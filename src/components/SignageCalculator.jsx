import React, { useState, useEffect } from 'react';
import { Calculator, Save, Plus, Trash2, Cog, Zap, Copy, FileText, X, Printer } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, generateId } from '../lib/utils';
import { getNextQuoteRef } from '../lib/quotes';
import SignageBOMLayout from './SignageBOMLayout';
import SignageQuoteLayout from './SignageQuoteLayout';

// --- Pure BOM calculation (per single screen config) ---
const calculateSignageBOM = (screen, inventory) => {
    if (!screen.width || !screen.height || Number(screen.width) <= 0 || Number(screen.height) <= 0) return null;

    const conv = screen.unit === 'ft' ? 304.8 : screen.unit === 'm' ? 1000 : 1;
    const visualWidthMm = Number(screen.width) * conv;
    const visualHeightMm = Number(screen.height) * conv;
    const visualAreaSqFt = (visualWidthMm * visualHeightMm) / (304.8 * 304.8);

    const overrides = screen.overrides || {};
    let totalMaterialCost = 0;
    const bom = [];

    // Helper to apply override
    const getQty = (id, calculatedQty) => {
        if (overrides[id]?.qty !== undefined && overrides[id]?.qty !== '') return Number(overrides[id]?.qty);
        return calculatedQty;
    };

    // A. Profiles
    (Array.isArray(screen.profiles) ? screen.profiles : []).forEach(p => {
        const profItem = inventory.find(i => i.id === p.profileId);
        if (!profItem) return;
        const calcLengthM = (Number(p.wMult) * visualWidthMm + Number(p.hMult) * visualHeightMm) / 1000;
        const lengthM = getQty(`profile-${p.id}`, calcLengthM);
        if (lengthM <= 0) return;
        const rate = Number(profItem.weightPerMeter) * Number(profItem.ratePerKg);
        const cost = lengthM * rate;
        totalMaterialCost += cost;
        bom.push({
            id: `profile-${p.id}`,
            category: 'Profile',
            name: `${profItem.brand} ${profItem.model}`,
            specs: `W×${p.wMult} + H×${p.hMult}`,
            qty: lengthM,
            uom: 'm',
            rate,
            cost,
            isOverridden: overrides[`profile-${p.id}`]?.qty !== undefined
        });
    });

    // B. ACP Backing
    const acpSheet = inventory.find(i => i.id === screen.acpId);
    if (acpSheet) {
        const rate = Number(acpSheet.ratePerSqft);
        const qty = getQty('backing', visualAreaSqFt);
        const cost = qty * rate;
        totalMaterialCost += cost;
        bom.push({
            id: 'backing',
            category: 'Backing',
            name: 'ACP Sheet',
            specs: `${acpSheet.brand} ${acpSheet.model} ${acpSheet.acpThickness}`,
            qty,
            uom: 'Sq.Ft',
            rate,
            cost,
            isOverridden: overrides['backing']?.qty !== undefined
        });
    }

    // C. LED
    let ledWattage = 0;
    const ledItem = inventory.find(i => i.id === screen.led.id);
    if (ledItem) {
        let calcQty = 0;
        if (screen.led.type === 'Module') {
            calcQty = Math.ceil(visualAreaSqFt * Number(screen.led.density));
        } else {
            const longerEdgeMm = Math.max(visualWidthMm, visualHeightMm);
            const spacing = Number(screen.led.spacing) || 100;
            calcQty = Math.ceil(longerEdgeMm / spacing) + 1;
        }
        const qty = getQty('led', calcQty);
        ledWattage = qty * ledItem.wattagePerUnit;
        const rate = Number(ledItem.price);
        const cost = qty * rate;
        totalMaterialCost += cost;
        bom.push({
            id: 'led',
            category: 'Electrical',
            name: `LED ${screen.led.type}`,
            specs: `${ledItem.brand} ${ledItem.model}`,
            qty,
            uom: screen.led.type === 'Module' ? 'Pcs' : 'Lines',
            rate,
            cost,
            isOverridden: overrides['led']?.qty !== undefined
        });
    }

    // D. SMPS
    const activeSmpsIds = Array.isArray(screen.smpsIds) && screen.smpsIds.length > 0
        ? screen.smpsIds
        : (screen.smpsId ? [screen.smpsId] : []);

    const smpsOptions = activeSmpsIds
        .map(id => inventory.find(i => i.id === id))
        .filter(Boolean)
        .filter(i => Number(i.capacity) > 0)
        .map(i => ({ id: i.id, brand: i.brand, model: i.model, environment: i.environment || '', capacity: Number(i.capacity), price: Number(i.price) }));

    const bufferedWattage = ledWattage * 1.15;
    let smpsMix = [];

    if (smpsOptions.length > 0 && bufferedWattage > 0) {
        const reqW = Math.ceil(bufferedWattage);
        const maxCap = Math.max(...smpsOptions.map(o => o.capacity));
        const maxW = reqW + maxCap;
        const dp   = new Float64Array(maxW + 1).fill(Infinity);
        const from = new Array(maxW + 1).fill(null);
        dp[0] = 0;
        for (let w = 1; w <= maxW; w++) {
            for (const opt of smpsOptions) {
                const prev = w - opt.capacity;
                if (prev >= 0 && dp[prev] !== Infinity) {
                    const c = dp[prev] + opt.price;
                    if (c < dp[w]) { dp[w] = c; from[w] = opt.id; }
                }
            }
        }
        let bestW = -1, bestCost = Infinity;
        for (let w = reqW; w <= maxW; w++) {
            if (dp[w] < bestCost) { bestCost = dp[w]; bestW = w; }
        }
        if (bestW !== -1) {
            const counts = {};
            smpsOptions.forEach(o => { counts[o.id] = 0; });
            let w = bestW;
            while (w > 0 && from[w] !== null) {
                counts[from[w]]++;
                w -= smpsOptions.find(o => o.id === from[w]).capacity;
            }
            smpsMix = smpsOptions.map(o => ({ ...o, count: counts[o.id] })).filter(o => o.count > 0);
        }

        smpsMix.forEach((s, idx) => {
            const comboId = `smps-${s.id}`;
            const qty = getQty(comboId, s.count);
            const cost = qty * s.price;
            totalMaterialCost += cost;
            bom.push({
                id: comboId,
                category: 'Electrical',
                name: idx === 0 ? 'Power Supply' : 'Power Supply (mix)',
                specs: `${s.brand} ${s.capacity}W ${s.environment}`,
                qty,
                uom: 'Pcs',
                rate: s.price,
                cost,
                isOverridden: overrides[comboId]?.qty !== undefined
            });
        });
    }

    // E. Hardware
    (screen.hardware || []).forEach(hw => {
        const item = inventory.find(i => i.id === hw.hardwareId);
        if (item) {
            const rate = Number(item.price);
            const qty = getQty(`hw-${hw.id}`, Number(hw.qty));
            const cost = qty * rate;
            totalMaterialCost += cost;
            bom.push({
                id: `hw-${hw.id}`,
                category: 'Hardware',
                name: `${item.brand} ${item.model}`,
                specs: item.uom,
                qty,
                uom: item.uom,
                rate,
                cost,
                isOverridden: overrides[`hw-${hw.id}`]?.qty !== undefined
            });
        }
    });

    // F. Other Costs
    let otherCostTotal = 0;
    (screen.otherCosts || []).forEach(oc => {
        if (!oc.name || !Number(oc.rate)) return;
        const rate = Number(oc.rate);
        let calcQty;
        if (oc.qtyType === 'Per Sq.Ft') calcQty = visualAreaSqFt;
        else calcQty = Number(oc.qty) || 1;
        
        const qty = calcQty;
        const uom = oc.qtyType === 'Per Sq.Ft' ? 'Sq.Ft' : 'Board';
        const cost = rate * qty;
        totalMaterialCost += cost;
        otherCostTotal += cost;
        bom.push({
            id: `oc-${oc.id}`,
            category: 'Other',
            name: oc.name,
            specs: oc.qtyType,
            qty,
            uom,
            rate,
            cost
        });
    });

    // G. Labour
    let calcLabourCost = 0;
    const isLabPerSqft = screen.labour.method === 'Per Sq.Ft';
    if (screen.labour.method === 'Per Board') calcLabourCost = Number(screen.labour.rate);
    else if (isLabPerSqft) calcLabourCost = visualAreaSqFt * Number(screen.labour.rate);
    
    const labQty = isLabPerSqft ? visualAreaSqFt : 1;
    const labRate = Number(screen.labour.rate);
    const labourCost = labQty * labRate;
    const baseCost = totalMaterialCost + labourCost;

    if (labourCost > 0) {
        bom.push({
            id: 'labour',
            category: 'Labour',
            name: 'Manufacturing Labour',
            specs: screen.labour.method,
            qty: labQty,
            uom: isLabPerSqft ? 'Sq.Ft' : 'LS',
            rate: labRate,
            cost: labourCost
        });
    }

    // H. Logistics
    let logisticsCost = 0;
    const logisticsDefs = [
        { key: 'trans',   label: 'Transport' },
        { key: 'install', label: 'Installation' }
    ];
    logisticsDefs.forEach(({ key, label }) => {
        const method = screen.logistics[`${key}Method`];
        const rateVal = Number(screen.logistics[`${key}Rate`]);
        let calcCost = 0;
        if (method === 'Per Board') calcCost = rateVal;
        else if (method === 'Percentage') calcCost = baseCost * (rateVal / 100);
        
        const qty = 1;
        const cost = qty * calcCost;
        logisticsCost += cost;
        if (cost > 0) {
            bom.push({
                id: key,
                category: 'Logistics',
                name: label,
                specs: method === 'Percentage' ? `${rateVal}% of base` : 'Per Board',
                qty,
                uom: 'LS',
                rate: cost / qty,
                cost
            });
        }
    });

    const totalCostEstimate = baseCost + logisticsCost;
    const screenQty = Number(screen.screenQty) || 1;
    const totalCostWithQty = totalCostEstimate * screenQty;

    // I. Selling Price
    const pVal = Number(screen.pricing?.value) || 0;
    const pMode = screen.pricing?.mode || 'Margin';
    let finalSellPricePerScreen = 0;
    let marginPct = 0;

    if (pMode === 'Margin') {
        finalSellPricePerScreen = totalCostEstimate * (1 + pVal / 100);
        marginPct = pVal;
    } else if (pMode === 'Price/SqFt') {
        finalSellPricePerScreen = visualAreaSqFt * pVal;
        marginPct = totalCostEstimate > 0 ? ((finalSellPricePerScreen - totalCostEstimate) / totalCostEstimate) * 100 : 0;
    } else if (pMode === 'Flat Rate') {
        finalSellPricePerScreen = pVal;
        marginPct = totalCostEstimate > 0 ? ((finalSellPricePerScreen - totalCostEstimate) / totalCostEstimate) * 100 : 0;
    }

    const finalSellPrice = finalSellPricePerScreen * screenQty;

    return {
        visualAreaSqFt, ledWattage, bufferedWattage,
        totalMaterialCost, labourCost, logisticsCost, otherCostTotal,
        totalCostEstimate, totalCostWithQty,
        finalSellPricePerScreen, finalSellPrice,
        marginPct,
        netProfit: finalSellPrice - totalCostWithQty,
        screenQty, smpsMix, bom
    };
};

// --- Component ---
const SignageCalculator = ({ user, userRole, readOnly, loadedState }) => {

    const createDefaultScreen = (name = 'Board 1') => ({
        id: generateId(),
        name,
        screenQty: 1,
        width: '', height: '', environment: 'Indoor',
        profiles: [{ id: generateId(), profileId: '', wMult: 2, hMult: 2 }],
        acpId: '',
        led: { id: '', type: 'Module', density: 1, spacing: 0 },
        smpsIds: [],
        hardware: [],
        otherCosts: [],
        labour: { complexity: 'Standard', method: 'Per Board', rate: 0 },
        logistics: { transMethod: 'Per Board', transRate: 0, installMethod: 'Per Board', installRate: 0 },
        pricing: { mode: 'Margin', value: 10 },
        overrides: {}
    });

    const initialState = {
        client: '', project: '', ref: '', clientId: '',
        unit: 'ft',
        screens: [createDefaultScreen()],
        activeScreenIndex: 0,
        terms: {
            validity: '15 Days',
            delivery: '2-3 Weeks',
            warranty: '2 Years',
            payment: '50% Advance, 50% Before Dispatch'
        }
    };

    const [state, setState] = useState(initialState);
    const [calculation, setCalculation] = useState(null);
    const [allScreensTotal, setAllScreensTotal] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [crmClients, setCrmClients] = useState([]);
    const [showBOM, setShowBOM] = useState(false);
    const [showQuote, setShowQuote] = useState(false);
    const [autoPrint, setAutoPrint] = useState(false);

    // Auto-trigger print when autoPrint state is set
    useEffect(() => {
        if ((showBOM || showQuote) && autoPrint) {
            // Small delay to ensure modal and portal are rendered
            const timer = setTimeout(() => {
                const originalTitle = document.title;
                const prefix = showQuote ? 'Quote' : 'BOM';
                document.title = `${state.client || 'Signage'}_${state.project || 'Project'}_${prefix}`.replace(/[^a-zA-Z0-9_]/g, '_');
                window.print();
                document.title = originalTitle;
                setAutoPrint(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [showBOM, showQuote, autoPrint, state.client, state.project]);

    // --- FETCH DATA ---
    useEffect(() => {
        if (!db) return;
        const unsubInv = db.collection('artifacts').doc(appId).collection('public').doc('data')
            .collection('signage_inventory').onSnapshot(snap => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsubCrm = db.collection('artifacts').doc(appId).collection('public').doc('data')
            .collection('crm_leads').onSnapshot(snap => setCrmClients(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''))));
        return () => { unsubInv(); unsubCrm(); };
    }, []);

    // Converts old profiles object { baseId, flipId, ... } → new array format
    const migrateProfiles = (profiles) => {
        if (Array.isArray(profiles)) return profiles.length ? profiles : [{ id: generateId(), profileId: '', wMult: 2, hMult: 2 }];
        if (!profiles) return [{ id: generateId(), profileId: '', wMult: 2, hMult: 2 }];
        const entries = [];
        if (profiles.baseId)    entries.push({ id: generateId(), profileId: profiles.baseId,    wMult: 2, hMult: 2 });
        if (profiles.flipId)    entries.push({ id: generateId(), profileId: profiles.flipId,    wMult: 2, hMult: 2 });
        if (profiles.hingedId)  entries.push({ id: generateId(), profileId: profiles.hingedId,  wMult: 0, hMult: 1 });
        if (profiles.shutterId) entries.push({ id: generateId(), profileId: profiles.shutterId, wMult: 2, hMult: 2 });
        return entries.length ? entries : [{ id: generateId(), profileId: '', wMult: 2, hMult: 2 }];
    };

    // --- LOAD STATE (with backward compat for old single-screen quotes) ---
    useEffect(() => {
        if (!loadedState) return;
        if (!loadedState.screens) {
            // Old flat-state quote — migrate to screens[] format
            setState({
                client: loadedState.client || '',
                project: loadedState.project || '',
                ref: loadedState.ref || '',
                clientId: loadedState.clientId || '',
                unit: loadedState.unit || 'ft',
                screens: [{
                    ...createDefaultScreen('Board 1'),
                    width: loadedState.width || '',
                    height: loadedState.height || '',
                    environment: loadedState.environment || 'Indoor',
                    profiles: migrateProfiles(loadedState.profiles),
                    acpId: loadedState.acpId || '',
                    led: loadedState.led || { id: '', type: 'Module', density: 1, spacing: 0 },
                    smpsIds: Array.isArray(loadedState.smpsIds) ? loadedState.smpsIds : (loadedState.smpsId ? [loadedState.smpsId] : []),
                    hardware: loadedState.hardware || [],
                    otherCosts: loadedState.otherCosts || [],
                    labour: loadedState.labour || { complexity: 'Standard', method: 'Per Board', rate: 0 },
                    logistics: loadedState.logistics || { transMethod: 'Per Board', transRate: 0, installMethod: 'Per Board', installRate: 0 },
                    pricing: loadedState.pricing || { mode: 'Margin', value: 10 }
                }],
                activeScreenIndex: 0
            });
        } else {
            // Migrate any screens that still have old-format profiles/smps; extract unit to top level
            setState({
                ...loadedState,
                unit: loadedState.unit || loadedState.screens?.[0]?.unit || 'ft',
                screens: loadedState.screens.map(s => ({
                    ...s,
                    profiles: migrateProfiles(s.profiles),
                    smpsIds: Array.isArray(s.smpsIds) ? s.smpsIds : (s.smpsId ? [s.smpsId] : []),
                    otherCosts: Array.isArray(s.otherCosts) ? s.otherCosts : [],
                    overrides: s.overrides || {}
                }))
            });
        }
    }, [loadedState]);

    // --- CALCULATIONS ---
    useEffect(() => {
        if (!state.screens?.length) { setCalculation(null); return; }
        const active = state.screens[state.activeScreenIndex];
        setCalculation(active ? calculateSignageBOM({ ...active, unit: state.unit }, inventory) : null);
    }, [state, inventory]);

    useEffect(() => {
        if (!state.screens?.length) { setAllScreensTotal(null); return; }
        const allCalcs = state.screens.map(s => calculateSignageBOM({ ...s, unit: state.unit }, inventory));
        const valid = allCalcs.filter(Boolean);
        if (!valid.length) { setAllScreensTotal(null); return; }
        const totals = {
            totalProjectCost: valid.reduce((s, c) => s + c.totalCostWithQty, 0),
            totalProjectSell: valid.reduce((s, c) => s + c.finalSellPrice, 0),
            totalScreenQty: valid.reduce((s, c) => s + c.screenQty, 0),
            calculations: allCalcs,   // null entries kept so index aligns with state.screens
            screenConfigs: state.screens
        };
        totals.totalMargin = totals.totalProjectSell - totals.totalProjectCost;
        totals.totalMarginPct = totals.totalProjectCost > 0 ? (totals.totalMargin / totals.totalProjectCost) * 100 : 0;
        setAllScreensTotal(totals);
    }, [state, inventory]);

    // --- HELPERS ---
    const updateState = (key, value) => setState(prev => ({ ...prev, [key]: value }));

    const updateScreenProp = (idx, key, value) => setState(prev => {
        const screens = [...prev.screens];
        screens[idx] = { ...screens[idx], [key]: value };
        return { ...prev, screens };
    });

    const updateScreenNested = (idx, parent, key, value) => setState(prev => {
        const screens = [...prev.screens];
        screens[idx] = { ...screens[idx], [parent]: { ...screens[idx][parent], [key]: value } };
        return { ...prev, screens };
    });

    const addScreen = () => {
        const n = state.screens.length + 1;
        setState(prev => ({
            ...prev,
            screens: [...prev.screens, createDefaultScreen(`Board ${n}`)],
            activeScreenIndex: prev.screens.length
        }));
    };

    const updateOverride = (id, val) => {
        const scr = state.screens[state.activeScreenIndex];
        const newOverrides = { ...(scr.overrides || {}) };
        if (val === '' || val === null) delete newOverrides[id];
        else newOverrides[id] = { qty: val };
        updateScreenProp(state.activeScreenIndex, 'overrides', newOverrides);
    };

    const removeScreen = (idx) => {
        if (state.screens.length === 1) { alert("Cannot remove the last board."); return; }
        if (confirm("Remove this board configuration?")) {
            setState(prev => ({
                ...prev,
                screens: prev.screens.filter((_, i) => i !== idx),
                activeScreenIndex: Math.min(prev.activeScreenIndex, prev.screens.length - 2)
            }));
        }
    };

    const duplicateScreen = (idx) => {
        const src = state.screens[idx];
        setState(prev => ({
            ...prev,
            screens: [...prev.screens, { ...src, id: generateId(), name: src.name + ' (Copy)' }],
            activeScreenIndex: prev.screens.length
        }));
    };

    // --- SAVE ---
    const handleSaveQuote = async () => {
        if (!state.client && !state.clientId) return alert("Select or enter a client.");
        if (!state.project) return alert("Enter project name.");
        let currentRef = state.ref;
        if (!currentRef) {
            currentRef = await getNextQuoteRef();
            updateState('ref', currentRef);
        }
        const totalAmount = allScreensTotal?.totalProjectSell ?? calculation?.finalSellPrice ?? 0;
        try {
            const globalRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_quotes').doc();
            const payload = {
                client: state.client, clientId: state.clientId,
                project: state.project, ref: currentRef,
                state: { ...state, ref: currentRef },
                calculation, allScreensTotal,
                createdAt: new Date(),
                createdBy: user?.email || user?.uid || 'Unknown User',
                totalAmount
            };
            await globalRef.set(payload);
            if (state.clientId) {
                const crmRef = db.collection('artifacts').doc(appId).collection('public').doc('data')
                    .collection('crm_leads').doc(state.clientId).collection('quotes').doc();
                await crmRef.set({ ...payload, globalQuoteId: globalRef.id, status: 'Sent', date: new Date().toISOString().split('T')[0], amount: totalAmount, subtotal: totalAmount, calculatorRef: 'signage' });
            }
            alert(`Signage Quote ${currentRef} saved successfully!`);
        } catch (e) {
            console.error(e);
            alert("Error saving: " + e.message);
        }
    };

    // --- UI CONSTANTS ---
    const inputCls = "w-full p-2 text-sm border rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 focus:ring-2 focus:ring-pink-300 transition-shadow";
    const labelCls = "block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1";
    const sectionCls = "bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-4";

    const activeScreen = state.screens[state.activeScreenIndex];
    const isMultiScreen = state.screens.length > 1;

    if (!activeScreen) return null;

    return (
        <React.Fragment>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-in fade-in duration-300">

            {/* ── LEFT COL ── */}
            <div className="lg:col-span-8 space-y-0">

                {/* Quote Details */}
                <div className={sectionCls}>
                    <div className="flex items-center gap-2 mb-4 border-b pb-2 dark:border-slate-700">
                        <Calculator className="text-pink-600" />
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Quote Details</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className={labelCls}>Client (CRM)</label>
                            <select className={inputCls} value={state.clientId} onChange={e => {
                                updateState('clientId', e.target.value);
                                const c = crmClients.find(cl => cl.id === e.target.value);
                                if (c) updateState('client', c.companyName || c.contactPerson || '');
                            }}>
                                <option value="">Select CRM Client...</option>
                                {crmClients.map(c => <option key={c.id} value={c.id}>{c.companyName} ({c.contactPerson})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Or Manual Client Name</label>
                            <input type="text" className={inputCls} placeholder="Type name..." value={state.client} onChange={e => updateState('client', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Project / Signage Ref*</label>
                            <input type="text" className={inputCls} placeholder="e.g. Main Front Board" value={state.project} onChange={e => updateState('project', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Dimensions Unit</label>
                            <select className={inputCls} value={state.unit} onChange={e => updateState('unit', e.target.value)}>
                                <option value="ft">Feet</option>
                                <option value="m">Meters</option>
                                <option value="mm">MM</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Board Configurations */}
                <div className={sectionCls}>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-md font-bold text-slate-800 dark:text-white">Board Configurations</h3>
                        <button onClick={addScreen} className="text-[10px] font-bold text-pink-600 dark:text-pink-400 hover:text-pink-700 flex items-center gap-1 bg-pink-50 dark:bg-pink-900/30 px-2 py-1 rounded border border-pink-100 dark:border-pink-800 transition-colors">
                            <Plus size={12} /> Add Board
                        </button>
                    </div>

                    {/* Column headers */}
                    <div className="hidden md:grid grid-cols-12 gap-2 mb-1 px-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-2">Name</div>
                        <div className="col-span-2 text-center">W ({state.unit})</div>
                        <div className="col-span-2 text-center">H ({state.unit})</div>
                        <div className="col-span-2 text-center">Env</div>
                        <div className="col-span-1 text-center">Qty</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>

                    <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
                        {state.screens.map((screen, idx) => (
                            <div
                                key={screen.id}
                                onClick={() => setState(prev => ({ ...prev, activeScreenIndex: idx }))}
                                className={`grid grid-cols-4 md:grid-cols-12 gap-2 items-center p-2 rounded-lg border transition-all cursor-pointer ${state.activeScreenIndex === idx ? 'border-pink-500 ring-1 ring-pink-500 bg-pink-50/50 dark:bg-pink-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-pink-300 dark:hover:border-pink-700'}`}
                            >
                                <div className="col-span-1 text-center">
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">#{idx + 1}</span>
                                </div>
                                <div className="col-span-3 md:col-span-2">
                                    <input
                                        type="text"
                                        value={screen.name}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => { e.stopPropagation(); updateScreenProp(idx, 'name', e.target.value); }}
                                        className="w-full text-xs font-semibold bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none focus:border-pink-400 dark:text-white"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <input
                                        type="number"
                                        value={screen.width}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => { e.stopPropagation(); updateScreenProp(idx, 'width', e.target.value); }}
                                        className="w-full text-xs text-center bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none focus:border-pink-400 dark:text-white"
                                        placeholder="W"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2">
                                    <input
                                        type="number"
                                        value={screen.height}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => { e.stopPropagation(); updateScreenProp(idx, 'height', e.target.value); }}
                                        className="w-full text-xs text-center bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none focus:border-pink-400 dark:text-white"
                                        placeholder="H"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2" onClick={e => e.stopPropagation()}>
                                    <select
                                        value={screen.environment}
                                        onChange={e => { e.stopPropagation(); updateScreenProp(idx, 'environment', e.target.value); }}
                                        className="w-full text-xs bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none focus:border-pink-400 dark:text-white py-0.5"
                                    >
                                        <option value="Indoor">Indoor</option>
                                        <option value="Outdoor">Outdoor</option>
                                    </select>
                                </div>
                                <div className="col-span-1 md:col-span-1 flex justify-center">
                                    <input
                                        type="number"
                                        value={screen.screenQty}
                                        min="1"
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => { e.stopPropagation(); updateScreenProp(idx, 'screenQty', e.target.value); }}
                                        className="w-12 text-xs text-center bg-transparent border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none focus:border-pink-400 dark:text-white"
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-2 flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => duplicateScreen(idx)} className="p-1 text-slate-400 hover:text-pink-500 transition-colors" title="Duplicate">
                                        <Copy size={13} />
                                    </button>
                                    <button onClick={() => removeScreen(idx)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Remove">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── UNIFIED COST BREAKDOWN ── */}
                {(() => {
                    const sq = activeScreen.screenQty;
                    const totalCols = 4 + (sq > 1 ? 2 : 0);
                    const profileBomRows = calculation?.bom?.filter(b => b.category === 'Profile') ?? [];
                    const backingBom    = calculation?.bom?.find(b => b.category === 'Backing');
                    const ledBom        = calculation?.bom?.find(b => b.category === 'Electrical' && b.name.startsWith('LED'));
                    const smpsBomRows   = calculation?.bom?.filter(b => b.category === 'Electrical' && !b.name.startsWith('LED')) ?? [];
                    const otherBomRows  = calculation?.bom?.filter(b => b.category === 'Other') ?? [];
                    const labourBom     = calculation?.bom?.find(b => b.category === 'Labour');
                    const transBom      = calculation?.bom?.find(b => b.category === 'Logistics' && b.name === 'Transport');
                    const installBom    = calculation?.bom?.find(b => b.category === 'Logistics' && b.name === 'Installation');

                    // Helper: update a single other-cost field
                    const updateOtherCostField = (ocIdx, field, val) => {
                        const updated = (activeScreen.otherCosts || []).map((oc, i) =>
                            i === ocIdx ? { ...oc, [field]: val } : oc
                        );
                        updateScreenProp(state.activeScreenIndex, 'otherCosts', updated);
                    };
                    const addOtherCost = () => updateScreenProp(
                        state.activeScreenIndex, 'otherCosts',
                        [...(activeScreen.otherCosts || []), { id: generateId(), name: '', rate: 0, qtyType: 'Per Board', qty: 1 }]
                    );
                    const removeOtherCost = (ocIdx) => updateScreenProp(
                        state.activeScreenIndex, 'otherCosts',
                        (activeScreen.otherCosts || []).filter((_, i) => i !== ocIdx)
                    );

                    const catHeaderCls = "px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-pink-600 dark:text-pink-400";
                    const cellCls = "p-2 align-top text-slate-700 dark:text-slate-300";
                    const numCls  = "p-2 align-top text-right text-slate-500 dark:text-slate-400";
                    const amtCls  = "p-2 align-top text-right font-medium text-slate-700 dark:text-slate-200";

                    const dash = <span className="text-slate-300 dark:text-slate-600">—</span>;

                    const fmtR = (v, uom) => v != null
                        ? <>{formatCurrency(v, 'INR', false, true)}<span className="text-[9px] text-slate-400">/{uom}</span></>
                        : dash;
                    const fmtQ = (v, uom) => v != null ? `${typeof v === 'number' ? v.toFixed(2) : v} ${uom}` : dash;
                    const fmtA = v => v != null ? formatCurrency(v, 'INR', false, true) : dash;

                    const renderDataRow = (id, componentCell, bomRow, overrideAmt, allowOverride = true) => {
                        const rate = bomRow?.rate;
                        const qty  = bomRow?.qty;
                        const uom  = bomRow?.uom ?? '';
                        const amt  = overrideAmt ?? bomRow?.cost;
                        const isOv = bomRow?.isOverridden;

                        return (
                            <tr key={id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/20 border-t border-slate-100 dark:border-slate-700/50 ${isOv ? 'bg-amber-50/30' : ''}`}>
                                <td className={cellCls + " w-1/2"}>{componentCell}</td>
                                <td className={numCls}>{fmtR(rate, uom)}</td>
                                <td className={numCls}>
                                    {allowOverride ? (
                                        <div className="flex items-center justify-end gap-1">
                                            <input
                                                type="number"
                                                className={`w-16 p-0.5 text-right bg-transparent border-b border-dashed focus:outline-none transition-colors ${isOv ? 'border-amber-400 text-amber-700 font-bold' : 'border-slate-200 text-slate-500'}`}
                                                value={qty ?? ''}
                                                onChange={e => updateOverride(id, e.target.value)}
                                            />
                                            <span className="text-[9px] text-slate-400 w-4">{uom}</span>
                                            {isOv && (
                                                <button onClick={() => updateOverride(id, '')} className="text-amber-500 hover:text-amber-700" title="Reset to auto">
                                                    <X size={10} />
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        fmtQ(qty, uom)
                                    )}
                                </td>
                                <td className={amtCls}>{fmtA(amt)}</td>
                                {sq > 1 && <td className={numCls + " border-l border-slate-100 dark:border-slate-700"}>{qty != null ? `${(qty * sq).toFixed(2)} ${uom}` : dash}</td>}
                                {sq > 1 && <td className={amtCls}>{amt != null ? fmtA(amt * sq) : dash}</td>}
                            </tr>
                        );
                    };

                    const catRow = (label, extra) => (
                        <tr key={`cat-${label}`} className="bg-slate-50 dark:bg-slate-800/50">
                            <td colSpan={totalCols}>
                                <div className="flex items-center justify-between">
                                    <span className={catHeaderCls}>{label}</span>
                                    {extra}
                                </div>
                            </td>
                        </tr>
                    );



                    return (
                        <div className={sectionCls}>
                            <h3 className="text-md font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                                Cost Breakdown
                                {isMultiScreen && <span className="text-xs font-normal text-pink-500 dark:text-pink-400">— {activeScreen.name}</span>}
                                <span className="ml-auto text-[10px] font-normal text-slate-400">
                                    {sq > 1 ? `×${sq} boards` : '1 board'}
                                </span>
                            </h3>

                            {/* Desktop table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-slate-700/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            <th className="p-2 text-left w-1/2">Component</th>
                                            <th className="p-2 text-right">Rate</th>
                                            <th className="p-2 text-right">Qty/Board</th>
                                            <th className="p-2 text-right">Amt/Board</th>
                                            {sq > 1 && <th className="p-2 text-right border-l border-slate-200 dark:border-slate-600">Qty ×{sq}</th>}
                                            {sq > 1 && <th className="p-2 text-right">Amt ×{sq}</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* ── PROFILE ── */}
                                        {catRow('Profile', (
                                            <button
                                                onClick={() => updateScreenProp(state.activeScreenIndex, 'profiles', [...activeScreen.profiles, { id: generateId(), profileId: '', wMult: 2, hMult: 2 }])}
                                                className="mr-2 text-[9px] font-bold text-pink-600 dark:text-pink-400 flex items-center gap-0.5 bg-pink-50 dark:bg-pink-900/30 px-2 py-0.5 rounded border border-pink-100 dark:border-pink-800"
                                            >
                                                <Plus size={10} /> Add
                                            </button>
                                        ))}
                                        {activeScreen.profiles.map((p, pIdx) => {
                                            const conv = state.unit === 'ft' ? 304.8 : state.unit === 'm' ? 1000 : 1;
                                            const W = Number(activeScreen.width) * conv;
                                            const H = Number(activeScreen.height) * conv;
                                            const updateP = (field, val) => updateScreenProp(
                                                state.activeScreenIndex, 'profiles',
                                                activeScreen.profiles.map((pr, i) => i === pIdx ? { ...pr, [field]: val } : pr)
                                            );
                                            return renderDataRow(`profile-${p.id}`, (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <select
                                                        className="flex-1 min-w-32 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                        value={p.profileId}
                                                        onChange={e => updateP('profileId', e.target.value)}
                                                    >
                                                        <option value="">Select profile...</option>
                                                        {['Base', 'Flip', 'Hinged', 'Shutter'].map(type => {
                                                            const items = inventory.filter(i => i.type === 'profile' && i.profileType === type);
                                                            return items.length ? (
                                                                <optgroup key={type} label={type}>
                                                                    {items.map(i => <option key={i.id} value={i.id}>{i.brand} {i.model}{i.thickness ? ` (${i.thickness}mm)` : ''}</option>)}
                                                                </optgroup>
                                                            ) : null;
                                                        })}
                                                    </select>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-slate-400">W×</span>
                                                        <input type="number" min="0" step="0.5" className="w-12 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" value={p.wMult} onChange={e => updateP('wMult', e.target.value)} />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-slate-400">H×</span>
                                                        <input type="number" min="0" step="0.5" className="w-12 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" value={p.hMult} onChange={e => updateP('hMult', e.target.value)} />
                                                    </div>
                                                    {W > 0 && H > 0 && (
                                                        <span className="text-[10px] text-slate-400">= {((Number(p.wMult)*W + Number(p.hMult)*H)/1000).toFixed(2)}m</span>
                                                    )}
                                                    <button onClick={() => updateScreenProp(state.activeScreenIndex, 'profiles', activeScreen.profiles.filter((_, i) => i !== pIdx))} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                                                </div>
                                            ), profileBomRows[pIdx]);
                                        })}
                                        {activeScreen.profiles.length === 0 && (
                                            <tr><td colSpan={totalCols} className="px-3 py-2 text-[10px] text-slate-400 italic">No profiles — click Add to include one.</td></tr>
                                        )}

                                        {/* ── BACKING ── */}
                                        {catRow('Backing')}
                                        {renderDataRow('backing', (
                                            <select
                                                className="w-full p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                value={activeScreen.acpId}
                                                onChange={e => updateScreenProp(state.activeScreenIndex, 'acpId', e.target.value)}
                                            >
                                                <option value="">No Backing / Select ACP...</option>
                                                {inventory.filter(i => i.type === 'acp').map(i => (
                                                    <option key={i.id} value={i.id}>{i.model} ({i.acpThickness}) — ₹{i.ratePerSqft}/sqft</option>
                                                ))}
                                            </select>
                                        ), backingBom)}

                                        {/* ── ELECTRICAL: LED ── */}
                                        {catRow('Electrical')}
                                        {renderDataRow('led', (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex gap-1.5">
                                                    <select className="w-28 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.led.type} onChange={e => updateScreenNested(state.activeScreenIndex, 'led', 'type', e.target.value)}>
                                                        <option value="Module">Module</option>
                                                        <option value="Strip">Strip</option>
                                                    </select>
                                                    <select className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.led.id} onChange={e => {
                                                        const sel = inventory.find(i => i.id === e.target.value);
                                                        const newLed = { ...activeScreen.led, id: e.target.value };
                                                        if (activeScreen.led.type === 'Module' && sel?.density) newLed.density = sel.density;
                                                        updateScreenProp(state.activeScreenIndex, 'led', newLed);
                                                    }}>
                                                        <option value="">Select LED...</option>
                                                        {inventory.filter(i => i.type === 'led' && i.ledType === activeScreen.led.type).map(i => (
                                                            <option key={i.id} value={i.id}>{i.model} ({i.wattagePerUnit}W){i.density ? ` — ${i.density}/sqft` : ''}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {activeScreen.led.type === 'Module' ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Density (qty/sqft)</span>
                                                        <input type="number" className="w-16 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" value={activeScreen.led.density} onChange={e => updateScreenNested(state.activeScreenIndex, 'led', 'density', e.target.value)} />
                                                        {activeScreen.led.id && inventory.find(i => i.id === activeScreen.led.id)?.density && <span className="text-[9px] text-pink-400">from inventory</span>}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Spacing (mm)</span>
                                                        <input type="number" className="w-16 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" value={activeScreen.led.spacing} onChange={e => updateScreenNested(state.activeScreenIndex, 'led', 'spacing', e.target.value)} placeholder="100" />
                                                    </div>
                                                )}
                                            </div>
                                        ), ledBom)}

                                        {/* SMPS — Selector config row (full-width, no amounts) */}
                                        <tr key="smps-selector" className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                                            <td className={cellCls + " w-1/2"} colSpan={totalCols}>
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-[9px] text-slate-400 mb-0.5">
                                                        SMPS — Required: <b className="text-slate-600 dark:text-slate-300">{calculation?.bufferedWattage ? calculation.bufferedWattage.toFixed(0) : 0}W</b> (15% buffer) — tick to include in optimiser
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto pr-1">
                                                        {inventory.filter(i => i.type === 'smps' && (activeScreen.environment === 'Indoor' || i.environment !== 'Indoor')).map(s => {
                                                            const isChecked = (activeScreen.smpsIds || []).includes(s.id);
                                                            const toggle = () => {
                                                                const cur = activeScreen.smpsIds || [];
                                                                updateScreenProp(state.activeScreenIndex, 'smpsIds',
                                                                    cur.includes(s.id) ? cur.filter(x => x !== s.id) : [...cur, s.id]);
                                                            };
                                                            return (
                                                                <label key={s.id} className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[11px] transition-colors ${isChecked ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300'}`}>
                                                                    <input type="checkbox" className="accent-pink-600 w-3 h-3 shrink-0" checked={isChecked} onChange={toggle} />
                                                                    <span>{s.brand} {s.model}</span>
                                                                    <span className="ml-auto font-bold text-slate-400">{s.capacity}W · ₹{s.price}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* SMPS — Individual mix rows with per-unit Rate / Qty / Amt */}
                                        {smpsBomRows.length > 0
                                            ? smpsBomRows.map((bomRow, idx) =>
                                                renderDataRow(bomRow.id, (
                                                    <div className="pl-3 flex items-center gap-2">
                                                        <Zap size={11} className="text-pink-400 shrink-0" />
                                                        <span className="font-medium text-slate-700 dark:text-slate-200">{bomRow.specs}</span>
                                                        {idx === 0 && <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-pink-500">Mix</span>}
                                                    </div>
                                                ), bomRow)
                                            )
                                            : (
                                                <tr key="smps-empty">
                                                    <td colSpan={totalCols} className="px-3 py-1 text-[10px] text-slate-400 italic">No SMPS selected — tick options above to include.</td>
                                                </tr>
                                            )
                                        }

                                        {/* ── OTHER COSTS ── */}
                                        {catRow('Other Costs', (
                                            <button
                                                onClick={addOtherCost}
                                                className="mr-2 text-[9px] font-bold text-pink-600 dark:text-pink-400 flex items-center gap-0.5 bg-pink-50 dark:bg-pink-900/30 px-2 py-0.5 rounded border border-pink-100 dark:border-pink-800"
                                            >
                                                <Plus size={10} /> Add
                                            </button>
                                        ))}
                                        {(activeScreen.otherCosts || []).length === 0 && (
                                            <tr><td colSpan={totalCols} className="px-3 py-2 text-[10px] text-slate-400 italic">No other costs — click Add to include one.</td></tr>
                                        )}
                                        {(activeScreen.otherCosts || []).map((oc, ocIdx) => (
                                            renderDataRow(`oc-${oc.id}`, (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <input
                                                        type="text"
                                                        placeholder="Cost name..."
                                                        value={oc.name}
                                                        onChange={e => updateOtherCostField(ocIdx, 'name', e.target.value)}
                                                        className="flex-1 min-w-28 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                    />
                                                    <select
                                                        value={oc.qtyType}
                                                        onChange={e => updateOtherCostField(ocIdx, 'qtyType', e.target.value)}
                                                        className="w-28 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                    >
                                                        <option value="Per Board">Qty / Board</option>
                                                        <option value="Per Sq.Ft">Qty / Sq.Ft</option>
                                                    </select>
                                                    {oc.qtyType === 'Per Board' && (
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            placeholder="Qty"
                                                            value={oc.qty}
                                                            onChange={e => updateOtherCostField(ocIdx, 'qty', e.target.value)}
                                                            className="w-14 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center"
                                                        />
                                                    )}
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="Rate ₹"
                                                        value={oc.rate}
                                                        onChange={e => updateOtherCostField(ocIdx, 'rate', e.target.value)}
                                                        className="w-24 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right"
                                                    />
                                                    <button onClick={() => removeOtherCost(ocIdx)} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                                                </div>
                                            ), otherBomRows[ocIdx], null, false)
                                        ))}

                                        {/* ── LABOUR ── */}
                                        {catRow('Labour & Logistics')}
                                        {renderDataRow('labour', (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-500 whitespace-nowrap">Labour</span>
                                                <select className="w-32 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.labour.method} onChange={e => updateScreenNested(state.activeScreenIndex, 'labour', 'method', e.target.value)}>
                                                    <option value="Per Board">Per Board</option>
                                                    <option value="Per Sq.Ft">Per Sq.Ft</option>
                                                </select>
                                                <input type="number" className="w-24 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right" value={activeScreen.labour.rate} onChange={e => updateScreenNested(state.activeScreenIndex, 'labour', 'rate', e.target.value)} placeholder="0" />
                                            </div>
                                        ), labourBom, null, false)}

                                        {renderDataRow('trans', (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-500 whitespace-nowrap">Transport</span>
                                                <select className="w-32 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.logistics.transMethod} onChange={e => updateScreenNested(state.activeScreenIndex, 'logistics', 'transMethod', e.target.value)}>
                                                    <option value="Per Board">Per Board</option>
                                                    <option value="Percentage">% of Base</option>
                                                </select>
                                                <input type="number" className="w-24 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right" value={activeScreen.logistics.transRate} onChange={e => updateScreenNested(state.activeScreenIndex, 'logistics', 'transRate', e.target.value)} placeholder="0" />
                                            </div>
                                        ), transBom, null, false)}

                                        {renderDataRow('install', (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-500 whitespace-nowrap">Installation</span>
                                                <select className="w-32 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.logistics.installMethod} onChange={e => updateScreenNested(state.activeScreenIndex, 'logistics', 'installMethod', e.target.value)}>
                                                    <option value="Per Board">Per Board</option>
                                                    <option value="Percentage">% of Base</option>
                                                </select>
                                                <input type="number" className="w-24 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right" value={activeScreen.logistics.installRate} onChange={e => updateScreenNested(state.activeScreenIndex, 'logistics', 'installRate', e.target.value)} placeholder="0" />
                                            </div>
                                        ), installBom, null, false)}

                                        {/* ── TOTAL ── */}
                                        <tr className="bg-slate-800 dark:bg-slate-900 text-white font-bold text-xs">
                                            <td className="p-2" colSpan="2">Total Cost</td>
                                            <td className="p-2 text-right text-slate-300 text-[10px] font-normal">
                                                {calculation ? <>{formatCurrency(calculation.totalCostEstimate / calculation.visualAreaSqFt, 'INR', false, true)}/sqft</> : '—'}
                                            </td>
                                            <td className="p-2 text-right">{calculation ? formatCurrency(calculation.totalCostEstimate, 'INR', false, true) : '—'}</td>
                                            {sq > 1 && <td className="p-2 text-right border-l border-slate-700 text-slate-300 text-[10px] font-normal">{sq} pcs</td>}
                                            {sq > 1 && <td className="p-2 text-right">{calculation ? formatCurrency(calculation.totalCostWithQty, 'INR', false, true) : '—'}</td>}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile cards */}
                            <div className="md:hidden space-y-3">
                                {/* Profiles */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={catHeaderCls + " text-pink-600"}>Profiles</span>
                                        <button onClick={() => updateScreenProp(state.activeScreenIndex, 'profiles', [...activeScreen.profiles, { id: generateId(), profileId: '', wMult: 2, hMult: 2 }])} className="text-[9px] font-bold text-pink-600 flex items-center gap-0.5 bg-pink-50 px-2 py-0.5 rounded border border-pink-100"><Plus size={10} /> Add</button>
                                    </div>
                                    {activeScreen.profiles.map((p, pIdx) => {
                                        const updateP = (field, val) => updateScreenProp(state.activeScreenIndex, 'profiles', activeScreen.profiles.map((pr, i) => i === pIdx ? { ...pr, [field]: val } : pr));
                                        return (
                                            <div key={p.id} className="bg-slate-50 dark:bg-slate-700/30 rounded p-2 mb-1 space-y-1">
                                                <div className="flex gap-1">
                                                    <select className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={p.profileId} onChange={e => updateP('profileId', e.target.value)}>
                                                        <option value="">Select profile...</option>
                                                        {inventory.filter(i => i.type === 'profile').map(i => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}
                                                    </select>
                                                    <button onClick={() => updateScreenProp(state.activeScreenIndex, 'profiles', activeScreen.profiles.filter((_, i) => i !== pIdx))} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                                                </div>
                                                <div className="flex gap-2 text-xs">
                                                    <div className="flex items-center gap-1"><span className="text-slate-400">W×</span><input type="number" className="w-12 p-1 border rounded text-center bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={p.wMult} onChange={e => updateP('wMult', e.target.value)} /></div>
                                                    <div className="flex items-center gap-1"><span className="text-slate-400">H×</span><input type="number" className="w-12 p-1 border rounded text-center bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={p.hMult} onChange={e => updateP('hMult', e.target.value)} /></div>
                                                    {profileBomRows[pIdx] && <span className="ml-auto font-bold text-slate-600 dark:text-slate-300">{formatCurrency(profileBomRows[pIdx].cost, 'INR', false, true)}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Backing */}
                                <div>
                                    <span className={catHeaderCls + " text-pink-600 block mb-1"}>Backing</span>
                                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/30 rounded p-2">
                                        <select className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.acpId} onChange={e => updateScreenProp(state.activeScreenIndex, 'acpId', e.target.value)}>
                                            <option value="">No ACP Backing</option>
                                            {inventory.filter(i => i.type === 'acp').map(i => <option key={i.id} value={i.id}>{i.model} — ₹{i.ratePerSqft}/sqft</option>)}
                                        </select>
                                        {backingBom && <span className="ml-2 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatCurrency(backingBom.cost, 'INR', false, true)}</span>}
                                    </div>
                                </div>
                                {/* LED + SMPS */}
                                <div>
                                    <span className={catHeaderCls + " text-pink-600 block mb-1"}>Electrical</span>
                                    <div className="bg-slate-50 dark:bg-slate-700/30 rounded p-2 space-y-1.5">
                                        <div className="flex gap-1">
                                            <select className="w-24 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.led.type} onChange={e => updateScreenNested(state.activeScreenIndex, 'led', 'type', e.target.value)}>
                                                <option value="Module">Module</option>
                                                <option value="Strip">Strip</option>
                                            </select>
                                            <select className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={activeScreen.led.id} onChange={e => { const sel = inventory.find(i => i.id === e.target.value); const nl = { ...activeScreen.led, id: e.target.value }; if (activeScreen.led.type === 'Module' && sel?.density) nl.density = sel.density; updateScreenProp(state.activeScreenIndex, 'led', nl); }}>
                                                <option value="">Select LED...</option>
                                                {inventory.filter(i => i.type === 'led' && i.ledType === activeScreen.led.type).map(i => <option key={i.id} value={i.id}>{i.model}</option>)}
                                            </select>
                                        </div>
                                        {activeScreen.led.type === 'Module'
                                            ? <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-400">Density</span><input type="number" className="w-16 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" value={activeScreen.led.density} onChange={e => updateScreenNested(state.activeScreenIndex, 'led', 'density', e.target.value)} /></div>
                                            : <div className="flex items-center gap-1.5"><span className="text-[10px] text-slate-400">Spacing mm</span><input type="number" className="w-16 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" value={activeScreen.led.spacing} onChange={e => updateScreenNested(state.activeScreenIndex, 'led', 'spacing', e.target.value)} /></div>
                                        }
                                        {inventory.filter(i => i.type === 'smps').map(s => {
                                            const isChecked = (activeScreen.smpsIds || []).includes(s.id);
                                            const toggle = () => { const cur = activeScreen.smpsIds || []; updateScreenProp(state.activeScreenIndex, 'smpsIds', cur.includes(s.id) ? cur.filter(x => x !== s.id) : [...cur, s.id]); };
                                            return <label key={s.id} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${isChecked ? 'bg-pink-50 text-pink-700 font-semibold' : 'text-slate-600'}`}><input type="checkbox" className="accent-pink-600" checked={isChecked} onChange={toggle} />{s.brand} {s.model} {s.capacity}W</label>;
                                        })}
                                    </div>
                                </div>
                                {/* Other Costs */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={catHeaderCls + " text-pink-600"}>Other Costs</span>
                                        <button onClick={addOtherCost} className="text-[9px] font-bold text-pink-600 flex items-center gap-0.5 bg-pink-50 px-2 py-0.5 rounded border border-pink-100"><Plus size={10} /> Add</button>
                                    </div>
                                    <div className="space-y-1">
                                        {(activeScreen.otherCosts || []).length === 0 && (
                                            <p className="text-[10px] text-slate-400 italic px-1">No other costs yet.</p>
                                        )}
                                        {(activeScreen.otherCosts || []).map((oc, ocIdx) => (
                                            <div key={oc.id} className="bg-slate-50 dark:bg-slate-700/30 rounded p-2 space-y-1">
                                                <div className="flex gap-1 items-center">
                                                    <input
                                                        type="text"
                                                        placeholder="Cost name..."
                                                        value={oc.name}
                                                        onChange={e => updateOtherCostField(ocIdx, 'name', e.target.value)}
                                                        className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                    />
                                                    <button onClick={() => removeOtherCost(ocIdx)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                                                </div>
                                                <div className="flex gap-1">
                                                    <select
                                                        value={oc.qtyType}
                                                        onChange={e => updateOtherCostField(ocIdx, 'qtyType', e.target.value)}
                                                        className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                    >
                                                        <option value="Per Board">Qty / Board</option>
                                                        <option value="Per Sq.Ft">Qty / Sq.Ft</option>
                                                    </select>
                                                    {oc.qtyType === 'Per Board' && (
                                                        <input type="number" min="1" value={oc.qty} onChange={e => updateOtherCostField(ocIdx, 'qty', e.target.value)} className="w-14 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-center" placeholder="Qty" />
                                                    )}
                                                    <input type="number" min="0" value={oc.rate} onChange={e => updateOtherCostField(ocIdx, 'rate', e.target.value)} className="w-20 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right" placeholder="Rate ₹" />
                                                    {otherBomRows[ocIdx] && <span className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">{formatCurrency(otherBomRows[ocIdx].cost, 'INR', false, true)}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Labour & Logistics */}
                                <div>
                                    <span className={catHeaderCls + " text-pink-600 block mb-1"}>Labour & Logistics</span>
                                    <div className="space-y-1">
                                        {[
                                            { label: 'Labour', method: activeScreen.labour.method, rate: activeScreen.labour.rate, onMethod: v => updateScreenNested(state.activeScreenIndex, 'labour', 'method', v), onRate: v => updateScreenNested(state.activeScreenIndex, 'labour', 'rate', v), opts: [{v:'Per Board',l:'Per Board'},{v:'Per Sq.Ft',l:'Per Sq.Ft'}], bom: labourBom },
                                            { label: 'Transport', method: activeScreen.logistics.transMethod, rate: activeScreen.logistics.transRate, onMethod: v => updateScreenNested(state.activeScreenIndex, 'logistics', 'transMethod', v), onRate: v => updateScreenNested(state.activeScreenIndex, 'logistics', 'transRate', v), opts: [{v:'Per Board',l:'Per Board'},{v:'Percentage',l:'% of Base'}], bom: transBom },
                                            { label: 'Installation', method: activeScreen.logistics.installMethod, rate: activeScreen.logistics.installRate, onMethod: v => updateScreenNested(state.activeScreenIndex, 'logistics', 'installMethod', v), onRate: v => updateScreenNested(state.activeScreenIndex, 'logistics', 'installRate', v), opts: [{v:'Per Board',l:'Per Board'},{v:'Percentage',l:'% of Base'}], bom: installBom }
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/30 rounded p-2">
                                                <span className="text-[10px] text-slate-500 w-16 shrink-0">{item.label}</span>
                                                <select className="flex-1 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={item.method} onChange={e => item.onMethod(e.target.value)}>{item.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                                                <input type="number" className="w-20 p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-right" value={item.rate} onChange={e => item.onRate(e.target.value)} />
                                                {item.bom && <span className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatCurrency(item.bom.cost, 'INR', false, true)}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Total */}
                                <div className="bg-slate-800 dark:bg-slate-900 text-white rounded-lg p-2 flex justify-between text-xs font-bold">
                                    <span>Total Cost{sq > 1 ? ` ×${sq}` : ''}</span>
                                    <span>{calculation ? formatCurrency(sq > 1 ? calculation.totalCostWithQty : calculation.totalCostEstimate, 'INR', false, true) : '—'}</span>
                                </div>

                                {/* Terms & Conditions UI */}
                                <div className="mt-8 pt-6 border-t dark:border-slate-700">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                                            <FileText size={14} className="text-pink-600" />
                                        </div>
                                        <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Terms & Conditions</h4>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Price Validity</label>
                                            <input
                                                type="text"
                                                value={state.terms?.validity || ''}
                                                onChange={e => setState(s => ({ ...s, terms: { ...s.terms, validity: e.target.value } }))}
                                                className="w-full p-2 text-xs border rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-1 focus:ring-pink-500 outline-none transition-all"
                                                placeholder="e.g. 15 Days"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Delivery</label>
                                            <input
                                                type="text"
                                                value={state.terms?.delivery || ''}
                                                onChange={e => setState(s => ({ ...s, terms: { ...s.terms, delivery: e.target.value } }))}
                                                className="w-full p-2 text-xs border rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-1 focus:ring-pink-500 outline-none transition-all"
                                                placeholder="e.g. 2-3 Weeks"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Warranty</label>
                                            <input
                                                type="text"
                                                value={state.terms?.warranty || ''}
                                                onChange={e => setState(s => ({ ...s, terms: { ...s.terms, warranty: e.target.value } }))}
                                                className="w-full p-2 text-xs border rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-1 focus:ring-pink-500 outline-none transition-all"
                                                placeholder="e.g. 2 Years"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Payment</label>
                                            <input
                                                type="text"
                                                value={state.terms?.payment || ''}
                                                onChange={e => setState(s => ({ ...s, terms: { ...s.terms, payment: e.target.value } }))}
                                                className="w-full p-2 text-xs border rounded bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-1 focus:ring-pink-500 outline-none transition-all"
                                                placeholder="e.g. 50% Advance"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ── RIGHT COL ── */}
            <div className="lg:col-span-4 space-y-4 relative">
                <div className="sticky top-20">
                    <div className="bg-slate-900 border-2 border-slate-800 dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl">

                        {/* Header */}
                        <div className="bg-slate-800 p-4 border-b border-slate-700">
                            <h3 className="text-white font-bold text-lg flex justify-between items-center">
                                Quote Summary
                                {isMultiScreen && <span className="text-xs text-slate-400 font-normal">{state.screens.length} boards</span>}
                            </h3>
                            <div className="mt-2 text-slate-400 text-xs flex gap-4">
                                <div>Area: <b>{calculation?.visualAreaSqFt?.toFixed(2) || 0} sqft</b></div>
                                {activeScreen.width && activeScreen.height && <div>Dims: <b>{activeScreen.width}×{activeScreen.height} {state.unit}</b></div>}
                            </div>
                        </div>

                        {/* Pricing */}
                        <div className="p-4 bg-white dark:bg-slate-900">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                                Commercial Strategy{isMultiScreen ? ` — ${activeScreen.name}` : ''} (per board)
                            </label>
                            <div className="flex gap-2 mb-4">
                                <select className={inputCls + " w-1/2"} value={activeScreen.pricing.mode} onChange={e => updateScreenNested(state.activeScreenIndex, 'pricing', 'mode', e.target.value)}>
                                    <option value="Margin">Cost Plus Margin %</option>
                                    <option value="Price/SqFt">Target Price/SqFt</option>
                                    <option value="Flat Rate">Target Flat Amount</option>
                                </select>
                                <input
                                    type="number"
                                    className={inputCls + " w-1/2 !bg-pink-50 dark:!bg-pink-900/20 !border-pink-200 font-bold"}
                                    value={activeScreen.pricing.value}
                                    onChange={e => updateScreenNested(state.activeScreenIndex, 'pricing', 'value', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>

                            {/* All-boards summary table */}
                            {isMultiScreen && allScreensTotal && (
                                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                                    <div className="px-3 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                                        All Boards — {allScreensTotal.totalScreenQty} pcs
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                                                    <th className="px-2 py-1.5 text-left">Board</th>
                                                    <th className="px-2 py-1.5 text-center">Dims</th>
                                                    <th className="px-2 py-1.5 text-center">Qty</th>
                                                    <th className="px-2 py-1.5 text-right">Cost/Brd</th>
                                                    <th className="px-2 py-1.5 text-right">Quote/Brd</th>
                                                    <th className="px-2 py-1.5 text-right">Margin/Brd</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {allScreensTotal.calculations.map((calc, idx) => {
                                                    if (!calc) return null;
                                                    const scr = state.screens[idx];
                                                    const isActive = idx === state.activeScreenIndex;
                                                    const marginPerBoard = calc.finalSellPricePerScreen - calc.totalCostEstimate;
                                                    return (
                                                        <tr
                                                            key={idx}
                                                            className={`cursor-pointer transition-colors ${isActive ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                                            onClick={() => setState(s => ({ ...s, activeScreenIndex: idx }))}
                                                        >
                                                            <td className="px-2 py-2 font-bold text-slate-800 dark:text-slate-100 leading-tight">
                                                                {scr?.name || `B${idx + 1}`}
                                                            </td>
                                                            <td className="px-2 py-2 text-center text-slate-500 dark:text-slate-400">{scr?.width}×{scr?.height}</td>
                                                            <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-200 font-semibold">{scr?.screenQty}</td>
                                                            <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{formatCurrency(calc.totalCostEstimate, 'INR')}</td>
                                                            <td className="px-2 py-2 text-right font-semibold text-pink-600 dark:text-pink-400">{formatCurrency(calc.finalSellPricePerScreen, 'INR')}</td>
                                                            <td className="px-2 py-2 text-right font-semibold text-green-600 dark:text-green-400">
                                                                {formatCurrency(marginPerBoard, 'INR')}{' '}
                                                                <span className="text-[9px] font-bold">({Math.round(calc.marginPct)}%)</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {/* Totals footer */}
                                    <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-3 py-2.5 space-y-1">
                                        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                                            <span>Total Cost</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency(allScreensTotal.totalProjectCost, 'INR')}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                                            <span>Total Margin</span>
                                            <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(allScreensTotal.totalMargin, 'INR')} ({Math.round(allScreensTotal.totalMarginPct)}%)</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                                            <span className="font-black text-slate-800 dark:text-white text-sm">Grand Total</span>
                                            <span className="font-black text-pink-600 dark:text-pink-400 text-sm">{formatCurrency(allScreensTotal.totalProjectSell, 'INR')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}


                            {/* Single-board total */}
                            {!isMultiScreen && calculation && (
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl text-center border border-slate-200 dark:border-slate-700">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                                        {activeScreen.name} Total Quote{activeScreen.screenQty > 1 ? ` ×${activeScreen.screenQty} boards` : ''}
                                    </div>
                                    <div className="text-3xl font-black text-pink-600 dark:text-pink-400">
                                        {formatCurrency(calculation.finalSellPrice || 0, 'INR')}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        Cost: {formatCurrency(calculation.totalCostEstimate, 'INR')} · <span className="text-green-600 dark:text-green-400 font-semibold">Margin: {Math.round(calculation.marginPct)}%</span>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons Row */}
                            {calculation && (
                                <div className="flex gap-2 mt-6">
                                    <button
                                        onClick={() => setShowBOM(true)}
                                        className="flex-1 bg-pink-700 dark:bg-pink-800 text-white font-bold py-2.5 rounded-xl flex justify-center items-center gap-2 hover:bg-pink-600 dark:hover:bg-pink-700 transition shadow-sm text-xs"
                                    >
                                        <FileText size={16} /> BOM
                                    </button>

                                    <button
                                        onClick={() => {
                                            setShowQuote(true);
                                            setAutoPrint(true);
                                        }}
                                        className="flex-1 bg-indigo-600 dark:bg-indigo-700 text-white font-bold py-2.5 rounded-xl flex justify-center items-center gap-2 hover:bg-indigo-500 dark:hover:bg-indigo-600 transition shadow-sm text-xs"
                                    >
                                        <Printer size={16} /> Print
                                    </button>

                                    {!readOnly && (
                                        <button
                                            onClick={handleSaveQuote}
                                            disabled={!calculation}
                                            className="flex-1 bg-slate-800 dark:bg-slate-700 text-white font-bold py-2.5 rounded-xl flex justify-center items-center gap-2 hover:bg-slate-700 dark:hover:bg-slate-600 transition disabled:opacity-50 shadow-sm text-xs"
                                        >
                                            <Save size={16} /> Save
                                        </button>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>
        </div>

            {/* ── BOM Modal ── */}
            {showBOM && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-900 max-w-6xl w-full h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        {/* Modal header */}
                        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-t-2xl shrink-0">
                            <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                                <FileText size={20} className="text-pink-600" />
                                Signage BOM{state.project ? ` — ${state.project}` : ''}
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const originalTitle = document.title;
                                        document.title = `${state.client || 'Signage'}_${state.project || 'BOM'}_BOM`.replace(/[^a-zA-Z0-9_]/g, '_');
                                        window.print();
                                        document.title = originalTitle;
                                    }}
                                    className="px-4 py-2 bg-pink-600 text-white hover:bg-pink-700 rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm font-semibold"
                                >
                                    <Printer size={16} /> Print / PDF
                                </button>
                                <button
                                    onClick={() => setShowBOM(false)}
                                    className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        {/* Modal body */}
                        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-800 p-6 flex justify-center">
                            <SignageBOMLayout
                                state={state}
                                allScreensTotal={allScreensTotal}
                                calculation={calculation}
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* ── Quote Preview Modal ── */}
            {showQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white max-w-5xl w-full h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        {/* Modal header */}
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50 text-slate-800 shrink-0">
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <Printer size={20} className="text-indigo-600" />
                                Quote Preview
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const originalTitle = document.title;
                                        document.title = `${state.client || 'Signage'}_${state.project || 'Project'}_Quote`.replace(/[^a-zA-Z0-9_]/g, '_');
                                        window.print();
                                        document.title = originalTitle;
                                    }}
                                    className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm font-semibold"
                                >
                                    <Printer size={16} /> Print / PDF
                                </button>
                                <button
                                    onClick={() => setShowQuote(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        {/* Modal body */}
                        <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center">
                            <SignageQuoteLayout
                                state={state}
                                allScreensTotal={allScreensTotal}
                                calculation={calculation}
                            />
                        </div>
                    </div>
                </div>
            )}
        </React.Fragment>
    );
};

export default SignageCalculator;
