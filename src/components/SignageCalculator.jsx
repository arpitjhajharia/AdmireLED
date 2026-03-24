import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, Save, Plus, Trash2, Printer, Eye, Cog, Zap, CheckCircle, Package } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, generateId } from '../lib/utils';
import { getNextQuoteRef } from '../lib/quotes';

const SignageCalculator = ({ user, userRole, readOnly, loadedState }) => {
    // --- STATE ---
    const initialCalcState = {
        client: '', project: '', ref: '', clientId: '',
        width: '', height: '', unit: 'ft', environment: 'Indoor',
        frameStyle: 'Option A',
        profiles: { baseId: '', flipId: '', hingedId: '', shutterId: '', tubeId: '' },
        acpId: '',
        led: { id: '', type: 'Module', density: 1, spacing: 0 },
        smpsId: '',
        hardware: [],
        labour: { complexity: 'Standard', method: 'Lumpsum', rate: 0 },
        logistics: { transMethod: 'Lumpsum', transRate: 0, installMethod: 'Lumpsum', installRate: 0 },
        pricing: { mode: 'Margin', value: 10 }
    };

    const [state, setState] = useState(initialCalcState);
    const [inventory, setInventory] = useState([]);
    const [crmClients, setCrmClients] = useState([]);

    // --- FETCH DATA ---
    useEffect(() => {
        if (!db) return;
        const unsubInv = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_inventory')
            .onSnapshot(snap => setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        
        const unsubCrm = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('crm_leads')
            .onSnapshot(snap => setCrmClients(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.companyName||'').localeCompare(b.companyName||''))));
            
        return () => { unsubInv(); unsubCrm(); };
    }, []);

    useEffect(() => {
        if (loadedState) setState(loadedState);
    }, [loadedState]);

    // --- HELPERS ---
    const updateState = (key, value) => setState(prev => ({ ...prev, [key]: value }));
    const updateNested = (parent, key, value) => setState(prev => ({ ...prev, [parent]: { ...prev[parent], [key]: value } }));

    // --- COSTING ENGINE ---
    const calculation = useMemo(() => {
        if (!state.width || !state.height || state.width <= 0 || state.height <= 0) return null;

        // 1. Dimensions
        const conv = state.unit === 'ft' ? 304.8 : state.unit === 'm' ? 1000 : 1;
        const visualWidthMm = Number(state.width) * conv;
        const visualHeightMm = Number(state.height) * conv;
        const visualAreaSqFt = (visualWidthMm * visualHeightMm) / (304.8 * 304.8);
        const visualAreaSqM = (visualWidthMm * visualHeightMm) / 1000000;

        let totalMaterialCost = 0;
        const bom = []; // internal BOM lines

        // A. Profiles (Perimeter)
        const frameThickness = 0; // Assuming thickness isn't dynamically expanding visually for simplicity or grab from Base profile if selected.
        let baseProfile = inventory.find(i => i.id === state.profiles.baseId);
        let actualThickness = baseProfile ? Number(baseProfile.thickness || 0) : 0;
        
        const frameWidthMm = visualWidthMm + (actualThickness * 2);
        const frameHeightMm = visualHeightMm + (actualThickness * 2);
        const perimeterMm = (frameWidthMm + frameHeightMm) * 2;
        const perimeterM = perimeterMm / 1000;

        let profileCost = 0;
        if (state.frameStyle === 'Option A') {
            // Base + Flip (100% perimeter each)
            if (baseProfile) {
                const cost = perimeterM * baseProfile.weightPerMeter * baseProfile.ratePerKg;
                profileCost += cost;
                bom.push({ category: 'Profile', name: 'Base Profile', specs: `${baseProfile.brand} ${baseProfile.model}`, qty: perimeterM.toFixed(2), uom: 'm', cost });
            }
            let flipProfile = inventory.find(i => i.id === state.profiles.flipId);
            if (flipProfile) {
                const cost = perimeterM * flipProfile.weightPerMeter * flipProfile.ratePerKg;
                profileCost += cost;
                bom.push({ category: 'Profile', name: 'Flip Profile', specs: `${flipProfile.brand} ${flipProfile.model}`, qty: perimeterM.toFixed(2), uom: 'm', cost });
            }
        } else if (state.frameStyle === 'Option B') {
            // Base: 2H + W, Hinged: Top W, Shutter: Perimeter
            const baseLenM = ((frameHeightMm * 2) + frameWidthMm) / 1000;
            const topLenM = frameWidthMm / 1000;
            if (baseProfile) {
                const cost = baseLenM * baseProfile.weightPerMeter * baseProfile.ratePerKg;
                profileCost += cost;
                bom.push({ category: 'Profile', name: 'Base Profile (L/R/B)', specs: `${baseProfile.brand} ${baseProfile.model}`, qty: baseLenM.toFixed(2), uom: 'm', cost });
            }
            let hingedProfile = inventory.find(i => i.id === state.profiles.hingedId);
            if (hingedProfile) {
                const cost = topLenM * hingedProfile.weightPerMeter * hingedProfile.ratePerKg;
                profileCost += cost;
                bom.push({ category: 'Profile', name: 'Hinged Profile (Top)', specs: `${hingedProfile.brand} ${hingedProfile.model}`, qty: topLenM.toFixed(2), uom: 'm', cost });
            }
            let shutterProfile = inventory.find(i => i.id === state.profiles.shutterId);
            if (shutterProfile) {
                const cost = perimeterM * shutterProfile.weightPerMeter * shutterProfile.ratePerKg;
                profileCost += cost;
                bom.push({ category: 'Profile', name: 'Shutter Profile', specs: `${shutterProfile.brand} ${shutterProfile.model}`, qty: perimeterM.toFixed(2), uom: 'm', cost });
            }
        }
        totalMaterialCost += profileCost;

        // B. ACP Backing
        let acpCost = 0;
        let acpSheet = inventory.find(i => i.id === state.acpId);
        if (acpSheet) {
            acpCost = visualAreaSqFt * acpSheet.ratePerSqft;
            bom.push({ category: 'Backing', name: 'ACP Sheet', specs: `${acpSheet.brand} ${acpSheet.model} ${acpSheet.acpThickness}`, qty: visualAreaSqFt.toFixed(2), uom: 'Sq.Ft', cost: acpCost });
            totalMaterialCost += acpCost;
        }

        // C. LED Lighting
        let ledCost = 0;
        let ledWattage = 0;
        let ledItem = inventory.find(i => i.id === state.led.id);
        if (ledItem) {
            let qty = 0;
            if (state.led.type === 'Module') {
                qty = Math.ceil(visualAreaSqFt * Number(state.led.density));
            } else {
                // Strip logic: parallel to shorter edge
                const shorterEdgeMm = Math.min(visualWidthMm, visualHeightMm);
                const longerEdgeMm = Math.max(visualWidthMm, visualHeightMm);
                const spacing = Number(state.led.spacing) || 100; // mm center-to-center
                const lines = Math.ceil(longerEdgeMm / spacing) + 1;
                // qty of strip is in logic, but standard strip length?
                // PRD: "Length Selection: Matches shorter visual edge. Calculation: (Longer Edge / C-to-C Spacing) + 1"
                // Usually sold by meter or piece. If by piece, assume 1 qty = 1 length of shorterEdge
                qty = lines; // Number of strips
            }
            ledCost = qty * ledItem.price;
            ledWattage = qty * ledItem.wattagePerUnit;
            bom.push({ category: 'Electrical', name: `LED ${state.led.type}`, specs: `${ledItem.brand} ${ledItem.model}`, qty: qty, uom: 'Pcs/Lines', cost: ledCost });
            totalMaterialCost += ledCost;
        }

        // D. SMPS
        let smpsCost = 0;
        let smpsItem = inventory.find(i => i.id === state.smpsId);
        if (smpsItem && ledWattage > 0) {
            const bufferedWattage = ledWattage * 1.15;
            const qty = Math.ceil(bufferedWattage / smpsItem.capacity);
            smpsCost = qty * smpsItem.price;
            bom.push({ category: 'Electrical', name: 'Power Supply', specs: `${smpsItem.brand} ${smpsItem.capacity}W ${smpsItem.environment}`, qty: qty, uom: 'Pcs', cost: smpsCost });
            totalMaterialCost += smpsCost;
        }

        // E. Hardware
        let hwCost = 0;
        state.hardware.forEach(hw => {
            let item = inventory.find(i => i.id === hw.hardwareId);
            if (item) {
                const cost = Number(hw.qty) * item.price;
                hwCost += cost;
                bom.push({ category: 'Hardware', name: 'Misc Hardware', specs: `${item.brand} ${item.model}`, qty: hw.qty, uom: item.uom, cost });
            }
        });
        totalMaterialCost += hwCost;

        // F. Labour
        let labourCost = 0;
        if (state.labour.method === 'Lumpsum') labourCost = Number(state.labour.rate);
        else if (state.labour.method === 'Per Sq.Ft') labourCost = visualAreaSqFt * Number(state.labour.rate);
        // Slab logic can be added later if needed.
        const baseCost = totalMaterialCost + labourCost; // PRD: Block 4.6 Base Cost

        // G. Transport & Install
        let logisticsCost = 0;
        ['Trans', 'Install'].forEach(type => {
            const m = state.logistics[`${type.toLowerCase()}Method`];
            const r = Number(state.logistics[`${type.toLowerCase()}Rate`]);
            let cost = 0;
            if (m === 'Lumpsum') cost = r;
            else if (m === 'Percentage') cost = baseCost * (r / 100);
            logisticsCost += cost;
        });

        const totalCostEstimate = baseCost + logisticsCost;

        // H. Selling Price
        let finalSellPrice = 0;
        let marginPct = 0;
        const pVal = Number(state.pricing.value) || 0;
        
        if (state.pricing.mode === 'Margin') {
            finalSellPrice = totalCostEstimate * (1 + (pVal / 100));
            marginPct = pVal;
        } else if (state.pricing.mode === 'Price/SqFt') {
            finalSellPrice = visualAreaSqFt * pVal;
            marginPct = totalCostEstimate > 0 ? ((finalSellPrice - totalCostEstimate) / totalCostEstimate) * 100 : 0;
        } else if (state.pricing.mode === 'Flat Rate') {
            finalSellPrice = pVal;
            marginPct = totalCostEstimate > 0 ? ((finalSellPrice - totalCostEstimate) / totalCostEstimate) * 100 : 0;
        }

        return {
            visualAreaSqFt,
            frameWidthMm,
            frameHeightMm,
            ledWattage,
            totalMaterialCost,
            labourCost,
            logisticsCost,
            totalCostEstimate,
            finalSellPrice,
            marginPct,
            netProfit: finalSellPrice - totalCostEstimate,
            bom
        };
    }, [state, inventory]);

    // --- UI HELPERS ---
    const inputCls = "w-full p-2 text-sm border rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 focus:ring-2 focus:ring-pink-300 transition-shadow";
    const labelCls = "block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1";
    const sectionCls = "bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-4";

    const handleSaveQuote = async () => {
        if (!state.client && !state.clientId) return alert("Select or enter a client.");
        if (!state.project) return alert("Enter project name.");
        // logic to push to sign_quotes...
        let currentRef = state.ref;
        if (!currentRef) {
            currentRef = await getNextQuoteRef(); // Using existing global quote ref generator logic
            updateState('ref', currentRef);
        }

        try {
            const globalRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_quotes').doc();
            
            const payload = {
                client: state.client,
                clientId: state.clientId,
                project: state.project,
                ref: currentRef,
                state: state,
                calculation: calculation,
                createdAt: new Date(),
                createdBy: user?.email || user?.uid || 'Unknown User',
                totalAmount: calculation.finalSellPrice
            };

            await globalRef.set(payload);

            // Link to CRM if CRM Lead is selected
            if (state.clientId) {
                const crmRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('crm_leads').doc(state.clientId).collection('quotes').doc();
                await crmRef.set({
                    ...payload,
                    globalQuoteId: globalRef.id,
                    status: 'Sent',
                    date: new Date().toISOString().split('T')[0],
                    amount: calculation.finalSellPrice,
                    subtotal: calculation.finalSellPrice,
                    calculatorRef: 'signage'
                });
            }

            alert(`Signage Quote ${currentRef} saved successfully!`);
        } catch (e) {
            console.error(e);
            alert("Error saving: " + e.message);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-in fade-in duration-300">
            {/* LEFT COL: Input Form */}
            <div className="lg:col-span-8 space-y-0">
                
                {/* Header Info */}
                <div className={sectionCls}>
                    <div className="flex items-center gap-2 mb-4 border-b pb-2 dark:border-slate-700">
                        <Calculator className="text-pink-600" />
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Quote Details</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className={labelCls}>Client (CRM)</label>
                            <select className={inputCls} value={state.clientId} onChange={e => {
                                updateState('clientId', e.target.value);
                                const c = crmClients.find(client => client.id === e.target.value);
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
                    </div>
                </div>

                {/* Step 1 & 2: Dimensions & Structure */}
                <div className={sectionCls}>
                    <h3 className="text-md font-bold text-slate-800 dark:text-white mb-3">Dimensions & Structure</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div>
                            <label className={labelCls}>Visual Width</label>
                            <input type="number" className={inputCls} value={state.width} onChange={e => updateState('width', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Visual Height</label>
                            <input type="number" className={inputCls} value={state.height} onChange={e => updateState('height', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Unit</label>
                            <select className={inputCls} value={state.unit} onChange={e => updateState('unit', e.target.value)}>
                                <option value="ft">Feet</option>
                                <option value="m">Meters</option>
                                <option value="mm">MM</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Environment</label>
                            <select className={inputCls} value={state.environment} onChange={e => updateState('environment', e.target.value)}>
                                <option value="Indoor">Indoor</option>
                                <option value="Outdoor">Outdoor</option>
                            </select>
                        </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <label className={labelCls}>Frame Configuration Type</label>
                        <select className={inputCls + " mb-3"} value={state.frameStyle} onChange={e => updateState('frameStyle', e.target.value)}>
                            <option value="Option A">Option A: Base Profile + Flip Profile</option>
                            <option value="Option B">Option B: Base + Hinged + Shutter Profile</option>
                        </select>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>{state.frameStyle === 'Option A' ? "Base Profile (100% Perimeter)" : "Base Profile (Left/Right/Bottom)"}</label>
                                <select className={inputCls} value={state.profiles.baseId} onChange={e => updateNested('profiles', 'baseId', e.target.value)}>
                                    <option value="">Select Base...</option>
                                    {inventory.filter(i => i.type === 'profile' && i.profileType === 'Base').map(i => <option key={i.id} value={i.id}>{i.brand} {i.model} ({i.thickness}mm)</option>)}
                                </select>
                            </div>
                            {state.frameStyle === 'Option A' && (
                                <div>
                                    <label className={labelCls}>Flip Profile (100% Perimeter)</label>
                                    <select className={inputCls} value={state.profiles.flipId} onChange={e => updateNested('profiles', 'flipId', e.target.value)}>
                                        <option value="">Select Flip...</option>
                                        {inventory.filter(i => i.type === 'profile' && i.profileType === 'Flip').map(i => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}
                                    </select>
                                </div>
                            )}
                            {state.frameStyle === 'Option B' && (
                                <>
                                    <div>
                                        <label className={labelCls}>Hinged Profile (Top Only)</label>
                                        <select className={inputCls} value={state.profiles.hingedId} onChange={e => updateNested('profiles', 'hingedId', e.target.value)}>
                                            <option value="">Select Hinged...</option>
                                            {inventory.filter(i => i.type === 'profile' && i.profileType === 'Hinged').map(i => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Shutter Profile (100% Perimeter)</label>
                                        <select className={inputCls} value={state.profiles.shutterId} onChange={e => updateNested('profiles', 'shutterId', e.target.value)}>
                                            <option value="">Select Shutter...</option>
                                            {inventory.filter(i => i.type === 'profile' && i.profileType === 'Shutter').map(i => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Step 3 & 4: Backing & Electricals */}
                <div className={sectionCls}>
                    <h3 className="text-md font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Zap size={18} className="text-yellow-500" /> Backing & Electricals</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-slate-100 dark:border-slate-700 p-3 rounded-lg">
                            <label className={labelCls}>ACP Backing Sheet</label>
                            <select className={inputCls} value={state.acpId} onChange={e => updateState('acpId', e.target.value)}>
                                <option value="">No Backing / Select ACP...</option>
                                {inventory.filter(i => i.type === 'acp').map(i => <option key={i.id} value={i.id}>{i.model} ({i.acpThickness}) - ₹{i.ratePerSqft}/sqft</option>)}
                            </select>
                        </div>
                        <div className="border border-slate-100 dark:border-slate-700 p-3 rounded-lg flex flex-col gap-2">
                            <label className={labelCls}>LED Illumination</label>
                            <div className="flex gap-2">
                                <select className={inputCls} value={state.led.type} onChange={e => updateNested('led', 'type', e.target.value)}>
                                    <option value="Module">LED Module</option>
                                    <option value="Strip">LED Strip</option>
                                </select>
                                <select className={inputCls} value={state.led.id} onChange={e => updateNested('led', 'id', e.target.value)}>
                                    <option value="">Select LED...</option>
                                    {inventory.filter(i => i.type === 'led' && i.ledType === state.led.type).map(i => <option key={i.id} value={i.id}>{i.model} ({i.wattagePerUnit}W)</option>)}
                                </select>
                            </div>
                            {state.led.type === 'Module' ? (
                                <div>
                                    <label className={labelCls}>Density (Qty per Sq.Ft)</label>
                                    <input type="number" className={inputCls} value={state.led.density} onChange={e => updateNested('led', 'density', e.target.value)} />
                                </div>
                            ) : (
                                <div>
                                    <label className={labelCls}>Center-to-Center Spacing (mm)</label>
                                    <input type="number" className={inputCls} value={state.led.spacing} onChange={e => updateNested('led', 'spacing', e.target.value)} placeholder="e.g. 100" />
                                </div>
                            )}
                        </div>

                        <div className="md:col-span-2 border border-slate-100 dark:border-slate-700 p-3 rounded-lg">
                            <label className={labelCls}>Power Supply (SMPS)</label>
                            <p className="text-[10px] text-slate-500 mb-2">Calculated Load: {calculation?.ledWattage ? (calculation.ledWattage * 1.15).toFixed(0) : 0}W (including 15% safety buffer).</p>
                            <select className={inputCls} value={state.smpsId} onChange={e => updateState('smpsId', e.target.value)}>
                                <option value="">Select SMPS...</option>
                                {/* PRD: Filter SMPS based on environment (Outdoor -> Rainproof/Waterproof) */}
                                {inventory.filter(i => i.type === 'smps' && (state.environment === 'Indoor' || i.environment !== 'Indoor')).map(i => <option key={i.id} value={i.id}>{i.brand} {i.capacity}W {i.environment} - ₹{i.price}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Step 5: Labour & Logistics */}
                <div className={sectionCls}>
                    <h3 className="text-md font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Cog size={18} className="text-slate-500" /> Labour & Logistics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded">
                            <label className={labelCls}>Manufacturing Labour</label>
                            <select className={inputCls + " mb-2"} value={state.labour.method} onChange={e => updateNested('labour', 'method', e.target.value)}>
                                <option value="Lumpsum">Lumpsum Amount</option>
                                <option value="Per Sq.Ft">Rate per Sq.Ft</option>
                            </select>
                            <input type="number" className={inputCls} value={state.labour.rate} onChange={e => updateNested('labour', 'rate', e.target.value)} placeholder="Rate / Cost" />
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded">
                            <label className={labelCls}>Transport Cost</label>
                            <select className={inputCls + " mb-2"} value={state.logistics.transMethod} onChange={e => updateNested('logistics', 'transMethod', e.target.value)}>
                                <option value="Lumpsum">Lumpsum Amount</option>
                                <option value="Percentage">% of Base Cost</option>
                            </select>
                            <input type="number" className={inputCls} value={state.logistics.transRate} onChange={e => updateNested('logistics', 'transRate', e.target.value)} placeholder="Amount or %" />
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded">
                            <label className={labelCls}>Installation Cost</label>
                            <select className={inputCls + " mb-2"} value={state.logistics.installMethod} onChange={e => updateNested('logistics', 'installMethod', e.target.value)}>
                                <option value="Lumpsum">Lumpsum Amount</option>
                                <option value="Percentage">% of Base Cost</option>
                            </select>
                            <input type="number" className={inputCls} value={state.logistics.installRate} onChange={e => updateNested('logistics', 'installRate', e.target.value)} placeholder="Amount or %" />
                        </div>
                    </div>
                </div>

            </div>

            {/* RIGHT COL: Output & Commercials */}
            <div className="lg:col-span-4 space-y-4 relative">
                <div className="sticky top-20">
                    <div className="bg-slate-900 border-2 border-slate-800 dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl">
                        <div className="bg-slate-800 p-4 border-b border-slate-700">
                            <h3 className="text-white font-bold text-lg flex justify-between items-center">
                                Quote Summary
                            </h3>
                            <div className="mt-2 text-slate-400 text-xs flex gap-4">
                                <div>Visual Area: <b>{calculation?.visualAreaSqFt?.toFixed(2) || 0} sqft</b></div>
                                <div>Frame: <b>{Math.round(calculation?.frameWidthMm || 0)}x{Math.round(calculation?.frameHeightMm || 0)} mm</b></div>
                            </div>
                        </div>

                        {/* BOM Quick View */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 max-h-60 overflow-y-auto hidden md:block border-b border-slate-200 dark:border-slate-800">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Cost Breakdown</h4>
                            {calculation?.bom?.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center mb-1 text-xs">
                                    <div className="truncate pr-2 w-3/4">
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                                        <span className="text-[10px] text-slate-400 block truncate">{item.specs} ({item.qty} {item.uom})</span>
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200">
                                        {formatCurrency(item.cost, 'INR', false, true)}
                                    </div>
                                </div>
                            ))}
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200">
                                <span>Total Material Cost</span>
                                <span>{formatCurrency(calculation?.totalMaterialCost || 0, 'INR', false, true)}</span>
                            </div>
                        </div>

                        <div className="p-4 bg-white dark:bg-slate-900">
                            <div className="flex justify-between items-center mb-1 text-sm text-slate-600 dark:text-slate-400">
                                <span>Net Cost Estimate</span>
                                <span className="font-bold text-slate-800 dark:text-white">{formatCurrency(calculation?.totalCostEstimate || 0, 'INR')}</span>
                            </div>
                            
                            <hr className="my-3 border-slate-200 dark:border-slate-700" />
                            
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Commercial Strategy</label>
                            <div className="flex gap-2 mb-4">
                                <select className={inputCls + " w-1/2"} value={state.pricing.mode} onChange={e => updateNested('pricing', 'mode', e.target.value)}>
                                    <option value="Margin">Cost Plus Margin %</option>
                                    <option value="Price/SqFt">Target Price/SqFt</option>
                                    <option value="Flat Rate">Target Flat Amount</option>
                                </select>
                                <input type="number" className={inputCls + " w-1/2 !bg-pink-50 dark:!bg-pink-900/20 !border-pink-200 font-bold"} value={state.pricing.value} onChange={e => updateNested('pricing', 'value', e.target.value)} placeholder="0.00" />
                            </div>

                            <div className="bg-pink-100 dark:bg-pink-900/30 p-4 rounded-xl text-center border border-pink-200 dark:border-pink-800">
                                <div className="text-[10px] uppercase font-bold text-pink-600 dark:text-pink-400 mb-1">Final Sell Price</div>
                                <div className="text-3xl font-black text-pink-700 dark:text-pink-300">
                                    {formatCurrency(calculation?.finalSellPrice || 0, 'INR')}
                                </div>
                                <div className="mt-2 flex justify-center gap-4 text-xs font-bold">
                                    <span className="text-slate-600 dark:text-slate-400">Margin: <span className="text-pink-600">{calculation?.marginPct?.toFixed(1) || 0}%</span></span>
                                    <span className="text-slate-600 dark:text-slate-400">Net: <span className="text-green-600">{formatCurrency(calculation?.netProfit || 0, 'INR', false, true)}</span></span>
                                </div>
                            </div>

                            {!readOnly && (
                                <button onClick={handleSaveQuote} disabled={!calculation} className="mt-4 w-full bg-slate-800 dark:bg-slate-700 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 hover:bg-slate-700 dark:hover:bg-slate-600 transition disabled:opacity-50 shadow-md">
                                    <Save size={18} /> Save Quote
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignageCalculator;
