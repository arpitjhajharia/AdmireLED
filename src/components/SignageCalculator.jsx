import React, { useState, useEffect, useMemo } from 'react';
import {
    Calculator, Box, FileText, ChevronRight, Layout, Trash2, Plus,
    Save, RefreshCw, Layers, Zap, PenTool, Image as LucideImage
} from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';
import SignageInventoryManager from './SignageInventoryManager';

const SignageCalculator = ({ user, userRole, readOnly = false }) => {
    const [view, setView] = useState('calculator');
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- INPUT STATE ---
    const [state, setState] = useState({
        projectName: '',
        clientName: '',
        signType: 'Backlit Flex',
        width: '',
        height: '',
        unit: 'ft', // ft, m, mm
        selectedProfileId: '',
        treatmentType: 'Powder Coat', // Powder Coat, Anodised (Factory), Anodised (3rd Party)
        treatmentRate: '',
        selectedFace1Id: '',
        selectedFace2Id: '',
        illuminationType: 'Backlit Module', // Non-Lit, Edge-Lit, Backlit Module, Backlit Strip
        selectedLEDId: '',
        selectedSMPSId: '',
        hardware: [], // { id, itemId, qty }
        marginPct: 20,
        targetSellPrice: 0,
        pricingMode: 'margin' // margin, target
    });

    // --- FETCH INVENTORY ---
    useEffect(() => {
        if (!user || !db) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public')
            .doc('data').collection('signage_inventory')
            .onSnapshot(snap => {
                setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            }, err => console.error(err));
        return () => unsub();
    }, [user]);

    // --- FILTERED INVENTORY ---
    const profiles = useMemo(() => inventory.filter(i => i.type === 'profile'), [inventory]);
    const substrates = useMemo(() => inventory.filter(i => i.type === 'substrate'), [inventory]);
    const leds = useMemo(() => inventory.filter(i => i.type === 'led'), [inventory]);
    const smpsList = useMemo(() => inventory.filter(i => i.type === 'smps'), [inventory]);
    const hardwareItems = useMemo(() => inventory.filter(i => i.type === 'hardware'), [inventory]);

    // --- CALCULATION ENGINE ---
    const bom = useMemo(() => {
        if (!state.width || !state.height) return null;

        const w = Number(state.width);
        const h = Number(state.height);

        // 1. Convert to Feet for primary math
        let w_ft = w;
        let h_ft = h;
        let w_mm = w;
        let h_mm = h;

        if (state.unit === 'm') {
            w_ft = w * 3.28084;
            h_ft = h * 3.28084;
            w_mm = w * 1000;
            h_mm = h * 1000;
        } else if (state.unit === 'mm') {
            w_ft = w / 304.8;
            h_ft = h / 304.8;
            w_mm = w;
            h_mm = h;
        } else {
            // ft to mm
            w_mm = w * 304.8;
            h_mm = h * 304.8;
        }

        // A. Dimensional Allowances
        const OuterW = w_ft + 0.5;
        const OuterH = h_ft + 0.5;
        const AreaSqft = OuterW * OuterH;
        const PerimeterFt = (OuterW + OuterH) * 2;
        const PerimeterM = PerimeterFt * 0.3048;

        const items = [];
        let totalCost = 0;

        // B. Framing & Treatment
        const profile = profiles.find(p => p.id === state.selectedProfileId);
        if (profile) {
            const weight = PerimeterM * (profile.weightPerM || 0);
            const cost = weight * (profile.ratePerKg || 0);
            items.push({
                name: `Profile: ${profile.name}`,
                qty: weight.toFixed(2),
                uom: 'kg',
                rate: profile.ratePerKg,
                total: cost
            });
            totalCost += cost;

            // Treatment
            if (state.treatmentType === 'Powder Coat') {
                const trCost = PerimeterM * 0.8 * (Number(state.treatmentRate) || 0);
                items.push({
                    name: 'Powder Coating',
                    qty: (PerimeterM * 0.8).toFixed(2),
                    uom: 'sqm',
                    rate: Number(state.treatmentRate) || 0,
                    total: trCost
                });
                totalCost += trCost;
            } else if (state.treatmentType === 'Anodised (Factory)') {
                const trCost = weight * (Number(state.treatmentRate) || 0);
                items.push({
                    name: 'Anodising (Factory)',
                    qty: weight.toFixed(2),
                    uom: 'kg',
                    rate: Number(state.treatmentRate) || 0,
                    total: trCost
                });
                totalCost += trCost;
            } else if (state.treatmentType === 'Anodised (3rd Party)') {
                const trCost = PerimeterFt * (Number(state.treatmentRate) || 0);
                items.push({
                    name: 'Anodising (3rd Party)',
                    qty: PerimeterFt.toFixed(2),
                    uom: 'sqft',
                    rate: Number(state.treatmentRate) || 0,
                    total: trCost
                });
                totalCost += trCost;
            }
        }

        // C. Substrates
        const calculateFaceCost = (faceId, faceName) => {
            const face = substrates.find(s => s.id === faceId);
            if (!face) return 0;

            if (face.subType === 'acp') {
                const cost = AreaSqft * (face.rateSft || 0);
                items.push({
                    name: `${faceName}: ${face.name} (ACP)`,
                    qty: AreaSqft.toFixed(2),
                    uom: 'sqft',
                    rate: face.rateSft,
                    total: cost
                });
                return cost;
            } else if (face.subType === 'acrylic') {
                const weight = AreaSqft * (face.thickness || 0) * 0.11;
                const cost = weight * (face.ratePerKg || 0);
                items.push({
                    name: `${faceName}: ${face.name} (Acrylic)`,
                    qty: weight.toFixed(2),
                    uom: 'kg',
                    rate: face.ratePerKg,
                    total: cost
                });
                return cost;
            }
            return 0;
        };

        totalCost += calculateFaceCost(state.selectedFace1Id, 'Face 1');
        totalCost += calculateFaceCost(state.selectedFace2Id, 'Face 2');

        // D. Illumination
        let ledQty = 0;
        const led = leds.find(l => l.id === state.selectedLEDId);

        if (led && state.illuminationType !== 'Non-Lit') {
            if (state.illuminationType === 'Backlit Module') {
                ledQty = Math.ceil(AreaSqft * 2.6);
            } else if (state.illuminationType === 'Edge-Lit') {
                const longEdge = Math.max(w_mm, h_mm);
                ledQty = Math.ceil((longEdge / 55) * 2);
            } else if (state.illuminationType === 'Backlit Strip') {
                const longEdge = Math.max(w_mm, h_mm);
                ledQty = Math.ceil(longEdge / 200);
            }

            const ledCost = ledQty * (led.rate || 0);
            items.push({
                name: `LED: ${led.name}`,
                qty: ledQty,
                uom: led.ledType === 'module' ? 'pcs' : 'm',
                rate: led.rate,
                total: ledCost
            });
            totalCost += ledCost;

            // E. SMPS
            const smps = smpsList.find(s => s.id === state.selectedSMPSId);
            if (smps && smps.wattage) {
                const reqCapacity = ledQty * (led.watts || 0) * 1.15;
                const smpsQty = Math.ceil(reqCapacity / smps.wattage);
                const smpsCost = smpsQty * (smps.rate || 0);
                items.push({
                    name: `SMPS: ${smps.name}`,
                    qty: smpsQty,
                    uom: 'pcs',
                    rate: smps.rate,
                    total: smpsCost
                });
                totalCost += smpsCost;
            }
        }

        // Hardware
        state.hardware.forEach(h => {
            const item = hardwareItems.find(i => i.id === h.itemId);
            if (item) {
                const cost = h.qty * (item.rate || 0);
                items.push({
                    name: `Hdw: ${item.name}`,
                    qty: h.qty,
                    uom: 'pcs',
                    rate: item.rate,
                    total: cost
                });
                totalCost += cost;
            }
        });

        // F. Labor & Wiring
        const wiringCost = AreaSqft > 50 ? 500 : 250;
        items.push({ name: 'Wiring & Misc', qty: 1, uom: 'ls', rate: wiringCost, total: wiringCost });
        totalCost += wiringCost;

        const laborCost = AreaSqft > 40 ? 1000 : 500;
        items.push({ name: 'Manufacturing Labor', qty: 1, uom: 'ls', rate: laborCost, total: laborCost });
        totalCost += laborCost;

        // TOTALS
        let sellPrice = 0;
        let margin = Number(state.marginPct);
        if (state.pricingMode === 'margin') {
            sellPrice = totalCost * (1 + margin / 100);
        } else {
            sellPrice = Number(state.targetSellPrice);
            if (totalCost > 0) margin = ((sellPrice - totalCost) / totalCost) * 100;
        }

        return {
            items,
            totalCost,
            totalSell: sellPrice,
            netProfit: sellPrice - totalCost,
            marginPct: margin,
            areaSqft: AreaSqft,
            perimeterM: PerimeterM
        };
    }, [state, profiles, substrates, leds, smpsList, hardwareItems]);

    const handleAddHardware = () => {
        setState(prev => ({
            ...prev,
            hardware: [...prev.hardware, { id: Date.now(), itemId: '', qty: 1 }]
        }));
    };

    const handleRemoveHardware = (id) => {
        setState(prev => ({
            ...prev,
            hardware: prev.hardware.filter(h => h.id !== id)
        }));
    };

    const handleHardwareChange = (id, field, value) => {
        setState(prev => ({
            ...prev,
            hardware: prev.hardware.map(h => h.id === id ? { ...h, [field]: value } : h)
        }));
    };

    const handleSaveQuote = async () => {
        if (!state.projectName || !state.clientName) return alert("Please enter Project and Client names.");

        try {
            await db.collection('artifacts').doc(appId).collection('public')
                .doc('data').collection('signage_quotes').add({
                    type: 'signage',
                    client: state.clientName,
                    project: state.projectName,
                    ref: `SIGN-${Date.now().toString().slice(-6)}`,
                    calculatorState: state,
                    bom: bom,
                    finalAmount: Math.round(bom.totalSell),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    createdBy: user.email
                });
            alert("Signage Quote Saved!");
        } catch (e) {
            console.error(e);
            alert("Error saving quote: " + e.message);
        }
    };

    const inputCls = "px-2.5 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 transition-all w-full";
    const labelCls = "text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1.5 tracking-wider";
    const sectionTitleCls = "flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-4 mt-2";

    if (view === 'inventory') return (
        <div className="max-w-7xl mx-auto">
            <button onClick={() => setView('calculator')} className="mb-4 text-xs font-bold text-indigo-600 flex items-center gap-1">← Back to Calculator</button>
            <SignageInventoryManager user={user} readOnly={readOnly} />
        </div>
    );

    return (
        <div className="max-w-[1600px] mx-auto animate-in fade-in duration-500">
            {/* Header Tabs (Reuse from previous implementation) */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 p-1.5 rounded-2xl mb-6 w-fit border border-slate-200 dark:border-slate-600 shadow-sm">
                <button
                    onClick={() => setView('calculator')}
                    className={`px-6 py-2 rounded-xl text-xs font-extra-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${view === 'calculator' ? 'bg-white dark:bg-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-none text-indigo-700 dark:text-white' : 'text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                >
                    <Calculator size={14} /> Calculator
                </button>
                <button
                    onClick={() => setView('inventory')}
                    className={`px-6 py-2 rounded-xl text-xs font-extra-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${view === 'inventory' ? 'bg-white dark:bg-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-none text-indigo-700 dark:text-white' : 'text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                >
                    <Box size={14} /> Inventory
                </button>
                <button
                    onClick={() => setView('saved')}
                    className={`px-6 py-2 rounded-xl text-xs font-extra-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${view === 'saved' ? 'bg-white dark:bg-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-none text-indigo-700 dark:text-white' : 'text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                >
                    <FileText size={14} /> Saved Quotes
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ── LEFT COLUMN: INPUTS ── */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-xl shadow-slate-100/50 dark:shadow-none">

                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="col-span-2 md:col-span-1">
                                <label className={labelCls}>Project Name</label>
                                <input className={inputCls} placeholder="e.g. KFC Main Signage" value={state.projectName} onChange={e => setState({ ...state, projectName: e.target.value })} />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className={labelCls}>Client Name</label>
                                <input className={inputCls} placeholder="e.g. KFC India" value={state.clientName} onChange={e => setState({ ...state, clientName: e.target.value })} />
                            </div>
                            <div className="col-span-2">
                                <label className={labelCls}>Sign Type</label>
                                <select className={inputCls} value={state.signType} onChange={e => setState({ ...state, signType: e.target.value })}>
                                    <option>Backlit Flex</option>
                                    <option>Shutter</option>
                                    <option>Suspended 80mm</option>
                                    <option>Face Mount 80mm</option>
                                    <option>Directional</option>
                                </select>
                            </div>
                            <div className="col-span-2 grid grid-cols-3 gap-3">
                                <div className="col-span-1">
                                    <label className={labelCls}>Width</label>
                                    <input type="number" className={inputCls} value={state.width} onChange={e => setState({ ...state, width: e.target.value })} />
                                </div>
                                <div className="col-span-1">
                                    <label className={labelCls}>Height</label>
                                    <input type="number" className={inputCls} value={state.height} onChange={e => setState({ ...state, height: e.target.value })} />
                                </div>
                                <div className="col-span-1">
                                    <label className={labelCls}>Unit</label>
                                    <select className={inputCls} value={state.unit} onChange={e => setState({ ...state, unit: e.target.value })}>
                                        <option value="ft">ft</option>
                                        <option value="m">m</option>
                                        <option value="mm">mm</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Framing */}
                        <h4 className={sectionTitleCls}><Layers size={14} /> Framing & Chassis</h4>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="col-span-2">
                                <label className={labelCls}>Profile Frame</label>
                                <select className={inputCls} value={state.selectedProfileId} onChange={e => setState({ ...state, selectedProfileId: e.target.value })}>
                                    <option value="">Select Profile...</option>
                                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.weightPerM}kg/m)</option>)}
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className={labelCls}>Treatment</label>
                                <select className={inputCls} value={state.treatmentType} onChange={e => setState({ ...state, treatmentType: e.target.value })}>
                                    <option>Powder Coat</option>
                                    <option>Anodised (Factory)</option>
                                    <option>Anodised (3rd Party)</option>
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className={labelCls}>Rate (₹)</label>
                                <input type="number" className={inputCls} value={state.treatmentRate} onChange={e => setState({ ...state, treatmentRate: e.target.value })} />
                            </div>
                        </div>

                        {/* Substrates */}
                        <h4 className={sectionTitleCls}><LucideImage size={14} /> Substrates (Face)</h4>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className={labelCls}>Front Face (Face 1)</label>
                                <select className={inputCls} value={state.selectedFace1Id} onChange={e => setState({ ...state, selectedFace1Id: e.target.value })}>
                                    <option value="">None</option>
                                    {substrates.map(s => <option key={s.id} value={s.id}>{s.name} ({s.subType} {s.thickness}mm)</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Back Face (Face 2)</label>
                                <select className={inputCls} value={state.selectedFace2Id} onChange={e => setState({ ...state, selectedFace2Id: e.target.value })}>
                                    <option value="">None</option>
                                    {substrates.map(s => <option key={s.id} value={s.id}>{s.name} ({s.subType} {s.thickness}mm)</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Illumination */}
                        <h4 className={sectionTitleCls}><Zap size={14} /> Illumination</h4>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="col-span-2">
                                <label className={labelCls}>Lighting Method</label>
                                <select className={inputCls} value={state.illuminationType} onChange={e => setState({ ...state, illuminationType: e.target.value })}>
                                    <option>Non-Lit</option>
                                    <option>Edge-Lit</option>
                                    <option>Backlit Module</option>
                                    <option>Backlit Strip</option>
                                </select>
                            </div>
                            {state.illuminationType !== 'Non-Lit' && (
                                <>
                                    <div>
                                        <label className={labelCls}>LED Component</label>
                                        <select className={inputCls} value={state.selectedLEDId} onChange={e => setState({ ...state, selectedLEDId: e.target.value })}>
                                            <option value="">Select LED...</option>
                                            {leds.map(l => <option key={l.id} value={l.id}>{l.name} ({l.watts}W)</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Power Supply (SMPS)</label>
                                        <select className={inputCls} value={state.selectedSMPSId} onChange={e => setState({ ...state, selectedSMPSId: e.target.value })}>
                                            <option value="">Select SMPS...</option>
                                            {smpsList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.wattage}W)</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Hardware */}
                        <div className="flex justify-between items-center mb-4">
                            <h4 className={sectionTitleCls}><PenTool size={14} /> Hardware</h4>
                            <button onClick={handleAddHardware} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition-colors uppercase"><Plus size={12} /> Add</button>
                        </div>
                        <div className="space-y-3 mb-4">
                            {state.hardware.map(h => (
                                <div key={h.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-900/40 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div className="col-span-7">
                                        <select className={inputCls} value={h.itemId} onChange={e => handleHardwareChange(h.id, 'itemId', e.target.value)}>
                                            <option value="">Select Item...</option>
                                            {hardwareItems.map(hi => <option key={hi.id} value={hi.id}>{hi.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <input type="number" className={inputCls} value={h.qty} onChange={e => handleHardwareChange(h.id, 'qty', Number(e.target.value))} />
                                    </div>
                                    <div className="col-span-2 flex justify-center">
                                        <button onClick={() => handleRemoveHardware(h.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT COLUMN: OUTPUTS ── */}
                <div className="lg:col-span-7 space-y-6">

                    {/* Financial Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <label className={labelCls}>Total Cost</label>
                            <div className="text-xl font-black text-slate-800 dark:text-white tabular-nums">
                                {bom ? formatCurrency(bom.totalCost) : '₹0'}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm ring-2 ring-indigo-50 dark:ring-indigo-900/20">
                            <label className={labelCls}>Margin %</label>
                            <input
                                type="number"
                                className="w-full bg-transparent text-xl font-black text-indigo-600 dark:text-indigo-400 focus:outline-none"
                                value={state.marginPct}
                                onChange={e => setState({ ...state, marginPct: Number(e.target.value), pricingMode: 'margin' })}
                            />
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <label className={labelCls}>Target Sell</label>
                            <input
                                type="number"
                                className="w-full bg-transparent text-xl font-black text-slate-800 dark:text-white focus:outline-none"
                                value={state.pricingMode === 'target' ? state.targetSellPrice : (bom ? Math.round(bom.totalSell) : 0)}
                                onChange={e => setState({ ...state, targetSellPrice: Number(e.target.value), pricingMode: 'target' })}
                            />
                        </div>
                        <div className="bg-indigo-600 p-5 rounded-3xl shadow-xl shadow-indigo-100 dark:shadow-none">
                            <label className="text-[10px] font-bold text-indigo-200 uppercase block mb-1.5 tracking-wider">Net Profit</label>
                            <div className="text-xl font-black text-white tabular-nums">
                                {bom ? formatCurrency(bom.netProfit) : '₹0'}
                            </div>
                        </div>
                    </div>

                    {/* BOM Table */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl shadow-slate-100/50 dark:shadow-none">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <FileText size={14} /> Bill of Materials
                            </h3>
                            <div className="flex gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <span>Area: {bom?.areaSqft.toFixed(2)} sqft</span>
                                <span className="w-px h-3 bg-slate-200 dark:bg-slate-600"></span>
                                <span>Perim: {bom?.perimeterM.toFixed(2)} m</span>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700">
                                <thead className="bg-slate-50/50 dark:bg-slate-800/80">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Item Description</th>
                                        <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Qty</th>
                                        <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Rate</th>
                                        <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                                    {bom?.items.map((item, i) => (
                                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-3 text-xs font-bold text-slate-700 dark:text-slate-300">{item.name}</td>
                                            <td className="px-6 py-3 text-right text-xs font-medium text-slate-500 tabular-nums">{item.qty} {item.uom}</td>
                                            <td className="px-6 py-3 text-right text-xs font-medium text-slate-500 tabular-nums">₹{item.rate}</td>
                                            <td className="px-6 py-3 text-right text-xs font-black text-slate-800 dark:text-white tabular-nums">₹{Math.round(item.total)}</td>
                                        </tr>
                                    ))}
                                    {(!bom || bom.items.length === 0) && (
                                        <tr>
                                            <td colSpan="4" className="px-6 py-12 text-center text-slate-300 uppercase font-black tracking-widest text-xs opacity-50">Enter dimensions to calculate</td>
                                        </tr>
                                    )}
                                </tbody>
                                {bom && (
                                    <tfoot>
                                        <tr className="bg-indigo-50/30 dark:bg-indigo-900/10">
                                            <td colSpan="3" className="px-6 py-4 text-right text-xs font-black uppercase text-indigo-600 dark:text-indigo-400">Total Factory Cost</td>
                                            <td className="px-6 py-4 text-right text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">₹{Math.round(bom.totalCost)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    <button
                        onClick={handleSaveQuote}
                        disabled={!bom || loading}
                        className="w-full py-5 rounded-3xl bg-slate-900 dark:bg-indigo-600 text-white font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-200 dark:shadow-none hover:bg-black dark:hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        <Save size={20} /> Save Quote Version
                    </button>

                    <p className="text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">Quotes are saved to the master ledger for reference and re-editing.</p>
                </div>
            </div>
        </div>
    );
};

export default SignageCalculator;
