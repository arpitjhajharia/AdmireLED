import React, { useState, useEffect } from 'react';
import { Box, Edit, Plus, Trash2, X, Search, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';

const toMeters = (length, unit) => {
    if (unit === 'm') return length;
    if (unit === 'ft') return length * 0.3048;
    if (unit === 'mm') return length / 1000;
    return length;
};

const SignageInventoryManager = ({ user, userRole, readOnly = false, transactions = [] }) => {
    const [items, setItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [expandedItems, setExpandedItems] = useState(new Set());

    const toggleExpand = (id) => setExpandedItems(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const initialItemState = {
        type: 'profile',
        brand: '', model: '', vendor: '', price: '', currency: 'INR',
        // Profile specific
        profileType: 'Base', weightPerMeter: '', ratePerKg: '', thickness: '', drawingNumber: '',
        // ACP specific
        acpThickness: '3mm', ratePerSqft: '',
        // LED specific
        ledType: 'Module', wattagePerUnit: '', densityPerSqft: '',
        // SMPS specific
        capacity: '', environment: 'Indoor',
        // Hardware specific
        uom: 'Pcs'
    };

    const [newItem, setNewItem] = useState(initialItemState);

    useEffect(() => {
        if (!user || !db) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_inventory')
            .onSnapshot(snap => {
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setItems(data);
                setLoading(false);
            }, err => console.error(err));
        return () => unsub();
    }, [user]);

    const handleSaveItem = async () => {
        if (!newItem.model) return alert("Model/Name is required.");

        try {
            const collectionRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_inventory');

            const itemData = {
                ...newItem,
                price: Number(newItem.price || 0),
                weightPerMeter: Number(newItem.weightPerMeter || 0),
                ratePerKg: Number(newItem.ratePerKg || 0),
                thickness: Number(newItem.thickness || 0),
                ratePerSqft: Number(newItem.ratePerSqft || 0),
                wattagePerUnit: Number(newItem.wattagePerUnit || 0),
                densityPerSqft: Number(newItem.densityPerSqft || 0),
                capacity: Number(newItem.capacity || 0),
                updatedAt: new Date()
            };

            if (editingId) {
                await collectionRef.doc(editingId).update(itemData);
                setEditingId(null);
                setShowForm(false);
            } else {
                await collectionRef.add({ ...itemData, createdAt: new Date() });
                setNewItem(initialItemState);
                alert("Signage Item Added!");
            }
        } catch (e) {
            console.error(e);
            alert("Error saving: " + e.message);
        }
    };

    const handleEdit = (item) => {
        setNewItem({ ...initialItemState, ...item });
        setEditingId(item.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (confirm("Delete this item?")) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_inventory').doc(id).delete();
        }
    };

    const sortedItems = [...items].sort((a, b) => {
        const typeA = (a.type || '').toLowerCase();
        const typeB = (b.type || '').toLowerCase();
        if (typeA < typeB) return -1;
        if (typeA > typeB) return 1;
        const nameA = a.model.toLowerCase();
        const nameB = b.model.toLowerCase();
        return nameA.localeCompare(nameB);
    });

    const uniqueTypes = [...new Set(items.map(i => i.type))].sort();

    const filteredItems = sortedItems.filter(item => {
        const matchesSearch = !searchTerm.trim() ||
            `${item.brand} ${item.model} ${item.drawingNumber || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || item.type === filterType;
        return matchesSearch && matchesType;
    });

    const inputCls = "px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition-shadow";

    const formatSpecs = (item) => {
        if (item.type === 'profile') return `${item.profileType} | ${item.weightPerMeter} kg/m | ${item.thickness}mm thk`;
        if (item.type === 'acp') return `${item.acpThickness}`;
        if (item.type === 'led') return `${item.ledType} | ${item.wattagePerUnit}W | Density: ${item.densityPerSqft}/sqft`;
        if (item.type === 'smps') return `${item.capacity}W | ${item.environment}`;
        if (item.type === 'hardware' || item.type === 'labour') return `${item.uom}`;
        return `—`;
    };

    const getItemRateValue = (item) => {
        if (item.type === 'profile') return item.ratePerKg || 0;
        if (item.type === 'acp') return item.ratePerSqft || 0;
        return item.price || 0;
    };

    const formatRate = (item) => {
        const val = getItemRateValue(item);
        if (item.type === 'profile') return `₹${val}/kg`;
        if (item.type === 'acp') return `₹${val}/sqft`;
        return `₹${val}`;
    };

    // For non-profiles: returns { pcs, totalLengthM: null, totalCost }
    // For profiles: returns { pcs, totalLengthM, totalCost } using actual purchase rates
    const getItemBalance = (item) => {
        const txs = transactions.filter(tx => tx.itemId === item.id);
        const pcs = txs.reduce((acc, tx) => acc + (tx.type === 'in' ? Number(tx.qty) : -Number(tx.qty)), 0);

        if (item.type !== 'profile') {
            return { pcs, totalLengthM: null, totalCost: pcs * getItemRateValue(item) };
        }

        let totalLengthM = 0, totalCost = 0;
        txs.forEach(tx => {
            const sign = tx.type === 'in' ? 1 : -1;
            const q = Number(tx.qty);
            const lpp = Number(tx.lengthPerPiece || 0);
            const unit = tx.lengthUnit || 'ft';
            if (lpp) {
                const lm = q * toMeters(lpp, unit);
                totalLengthM += sign * lm;
                const rate = Number(tx.purchaseRatePerKg || 0);
                const wpm = Number(item.weightPerMeter || 0);
                if (rate && wpm) totalCost += sign * lm * wpm * rate;
            }
        });
        return { pcs, totalLengthM, totalCost };
    };

    // Per-length stock summary for the expanded profile breakup
    const getProfileStockBreakdown = (item) => {
        const txs = transactions.filter(tx => tx.itemId === item.id);
        const map = {};
        txs.forEach(tx => {
            const lpp = Number(tx.lengthPerPiece || 0);
            if (!lpp) return;
            const unit = tx.lengthUnit || 'ft';
            const key = `${lpp}_${unit}`;
            if (!map[key]) map[key] = { lpp, unit, pcs: 0, totalInKg: 0, totalInCost: 0 };
            const sign = tx.type === 'in' ? 1 : -1;
            map[key].pcs += sign * Number(tx.qty);
            if (tx.type === 'in') {
                const kg = Number(tx.qty) * toMeters(lpp, unit) * Number(item.weightPerMeter || 0);
                const rate = Number(tx.purchaseRatePerKg || 0);
                map[key].totalInKg += kg;
                map[key].totalInCost += kg * rate;
            }
        });
        return Object.values(map)
            .filter(l => l.pcs > 0)
            .map(l => {
                const wpm = Number(item.weightPerMeter || 0);
                const wtPerPc = toMeters(l.lpp, l.unit) * wpm;
                const totalLengthNative = l.pcs * l.lpp;
                const totalKg = l.pcs * toMeters(l.lpp, l.unit) * wpm;
                const wAvgRate = l.totalInKg > 0 ? l.totalInCost / l.totalInKg : 0;
                const value = totalKg * wAvgRate;
                return { lpp: l.lpp, unit: l.unit, pcs: l.pcs, wtPerPc, totalLengthNative, totalKg, wAvgRate, value };
            })
            .sort((a, b) => a.lpp - b.lpp);
    };

    return (
        <div className="p-3 md:p-4 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-800 to-pink-600 flex items-center justify-center shadow-sm">
                        <Box className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Signage Master Catalog
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {items.length} {items.length === 1 ? 'item' : 'items'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300 dark:focus:ring-pink-600 transition-shadow text-slate-800 dark:text-slate-200"
                        />
                    </div>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="py-2 px-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300 dark:focus:ring-pink-600 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                        <option value="all">All Types</option>
                        {uniqueTypes.map(t => (
                            <option key={t} value={t}>{t.toUpperCase()}</option>
                        ))}
                    </select>
                    {!showForm && !readOnly && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex-shrink-0 bg-pink-600 dark:bg-pink-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-pink-700 transition-colors shadow-sm"
                        >
                            <Plus size={15} /> Add
                        </button>
                    )}
                </div>
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 p-4 rounded-xl transition-colors border shadow-sm ${editingId ? 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                    <div className="col-span-2 md:col-span-4 flex justify-between items-center mb-1 pb-1.5 border-b border-slate-200 dark:border-slate-600">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{editingId ? '✏️ Editing Signage Item' : '➕ Add Signage Item'}</h3>
                        <button onClick={() => { setShowForm(false); setEditingId(null); setNewItem(initialItemState); }} className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"><X size={14} /> Close</button>
                    </div>

                    <div className="col-span-2 md:col-span-4 mb-2">
                        <label className="block text-[13px] font-bold uppercase text-slate-400 mb-1">Category Type</label>
                        <select className={inputCls + " w-full max-w-xs cursor-pointer"} value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}>
                            <option value="profile">Aluminium Profile</option>
                            <option value="acp">ACP Sheet</option>
                            <option value="led">LED Lighting (Module/Strip)</option>
                            <option value="smps">Power Supply (SMPS)</option>
                            <option value="hardware">Hardware / Accessory</option>
                            <option value="labour">Standard Labour Config</option>
                        </select>
                    </div>

                    {/* Common Fields */}
                    <input placeholder="Brand / Maker (Optional)" className={inputCls} value={newItem.brand} onChange={e => setNewItem({ ...newItem, brand: e.target.value })} />
                    <input placeholder="Model / Description*" className={inputCls} value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} />

                    {/* Profiles */}
                    {newItem.type === 'profile' && (
                        <>
                            <select className={inputCls} value={newItem.profileType} onChange={e => setNewItem({ ...newItem, profileType: e.target.value })}>
                                <option value="Base">Base Profile</option>
                                <option value="Flip">Flip Profile</option>
                                <option value="Hinged">Hinged Profile</option>
                                <option value="Shutter">Shutter Profile</option>
                                <option value="Tube">Tube / Support</option>
                            </select>
                            <input placeholder="Drawing No (Optional)" className={inputCls} value={newItem.drawingNumber} onChange={e => setNewItem({ ...newItem, drawingNumber: e.target.value })} />
                            <input placeholder="Weight (kg/m)*" type="number" className={inputCls} value={newItem.weightPerMeter} onChange={e => setNewItem({ ...newItem, weightPerMeter: e.target.value })} />
                            <input placeholder="Rate (₹/kg)*" type="number" className={inputCls} value={newItem.ratePerKg} onChange={e => setNewItem({ ...newItem, ratePerKg: e.target.value })} />
                            <input placeholder="Thickness / Frontage (mm)*" type="number" className={inputCls} value={newItem.thickness} onChange={e => setNewItem({ ...newItem, thickness: e.target.value })} />
                        </>
                    )}

                    {/* ACP */}
                    {newItem.type === 'acp' && (
                        <>
                            <input placeholder="Thickness (e.g. 3mm)" className={inputCls} value={newItem.acpThickness} onChange={e => setNewItem({ ...newItem, acpThickness: e.target.value })} />
                            <input placeholder="Rate (₹/sq.ft)*" type="number" className={inputCls} value={newItem.ratePerSqft} onChange={e => setNewItem({ ...newItem, ratePerSqft: e.target.value })} />
                        </>
                    )}

                    {/* LED */}
                    {newItem.type === 'led' && (
                        <>
                            <select className={inputCls} value={newItem.ledType} onChange={e => setNewItem({ ...newItem, ledType: e.target.value })}>
                                <option value="Module">LED Module (Grid)</option>
                                <option value="Strip">LED Strip/Bar (Linear)</option>
                            </select>
                            <input placeholder="Wattage Per Unit (W)*" type="number" className={inputCls} value={newItem.wattagePerUnit} onChange={e => setNewItem({ ...newItem, wattagePerUnit: e.target.value })} />
                            {newItem.ledType === 'Module' && (
                                <input placeholder="Target Density (qty/sqft)*" type="number" className={inputCls} value={newItem.densityPerSqft} onChange={e => setNewItem({ ...newItem, densityPerSqft: e.target.value })} />
                            )}
                            <input placeholder="Rate per unit (₹)*" type="number" className={inputCls} value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} />
                        </>
                    )}

                    {/* SMPS */}
                    {newItem.type === 'smps' && (
                        <>
                            <input placeholder="Capacity (W)*" type="number" className={inputCls} value={newItem.capacity} onChange={e => setNewItem({ ...newItem, capacity: e.target.value })} />
                            <select className={inputCls} value={newItem.environment} onChange={e => setNewItem({ ...newItem, environment: e.target.value })}>
                                <option value="Indoor">Indoor (Non-waterproof)</option>
                                <option value="Rainproof">Rainproof</option>
                                <option value="Waterproof">Waterproof</option>
                            </select>
                            <input placeholder="Rate (₹)*" type="number" className={inputCls} value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} />
                        </>
                    )}

                    {/* Hardware & Labour */}
                    {(newItem.type === 'hardware' || newItem.type === 'labour') && (
                        <>
                            <input placeholder="UOM (Pcs, Set, SqFt, etc)" className={inputCls} value={newItem.uom} onChange={e => setNewItem({ ...newItem, uom: e.target.value })} />
                            <input placeholder="Rate (₹)*" type="number" className={inputCls} value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} />
                        </>
                    )}

                    <button onClick={handleSaveItem} className={`px-4 py-2 col-span-2 md:col-span-4 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition mt-2 ${editingId ? 'bg-amber-600' : 'bg-pink-600'}`}>
                        {editingId ? <Edit size={15} /> : <Plus size={15} />} {editingId ? 'Update Catalog Item' : 'Add to Catalog'}
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-[13px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-left text-[13px] font-bold text-slate-500 uppercase tracking-wider">Name / Model</th>
                                <th className="px-4 py-3 text-left text-[13px] font-bold text-slate-500 uppercase tracking-wider">Specs</th>
                                <th className="px-4 py-3 text-right text-[13px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                                <th className="px-4 py-3 text-right text-[13px] font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                                <th className="px-4 py-3 text-right text-[13px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Stock Value</th>
                                {!readOnly && <th className="px-4 py-3 text-right text-[13px] font-bold text-slate-500 uppercase tracking-wider w-24">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredItems.map(item => {
                                const bal = getItemBalance(item);
                                const isProfile = item.type === 'profile';
                                const isExpanded = expandedItems.has(item.id);
                                const profileBreakdown = isProfile && isExpanded ? getProfileStockBreakdown(item) : null;
                                const colCount = readOnly ? 6 : 7;

                                return (
                                    <React.Fragment key={item.id}>
                                        <tr
                                            className={`transition-colors ${isProfile ? 'cursor-pointer' : ''} hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isExpanded ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
                                            onClick={isProfile ? () => toggleExpand(item.id) : undefined}
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    {isProfile && (
                                                        <span className="text-slate-400 dark:text-slate-500">
                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </span>
                                                    )}
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[13px] font-bold uppercase tracking-widest bg-pink-50 text-pink-600 ring-1 ring-pink-200/60 dark:bg-pink-900/40 dark:text-pink-400 dark:ring-pink-700/50`}>
                                                        {item.type}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{item.brand} {item.model}</div>
                                                {item.drawingNumber && <div className="text-[13px] text-slate-400">Drwg: {item.drawingNumber}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-400 min-w-[200px]">
                                                {formatSpecs(item)}
                                            </td>
                                            <td className="px-4 py-3 text-[13px] font-medium text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">
                                                {formatRate(item)}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <span className={`text-[13px] font-bold tabular-nums ${bal.pcs < 0 ? 'text-red-500' : 'text-slate-800 dark:text-white'}`}>
                                                    {bal.pcs} pcs
                                                </span>
                                                {isProfile && bal.totalLengthM > 0 && (
                                                    <div className="text-[11px] text-indigo-500 dark:text-indigo-400 font-medium leading-tight mt-0.5">
                                                        {bal.totalLengthM.toFixed(2)} m
                                                        {item.weightPerMeter > 0 && (
                                                            <span className="ml-1">· {(bal.totalLengthM * Number(item.weightPerMeter)).toFixed(2)} kg</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-[13px] font-extrabold text-slate-900 dark:text-white text-right whitespace-nowrap">
                                                {isProfile
                                                    ? (bal.totalCost > 0 ? formatCurrency(bal.totalCost, 'INR') : <span className="text-slate-400 font-normal text-[12px]">No rate data</span>)
                                                    : formatCurrency(bal.totalCost, 'INR')
                                                }
                                            </td>
                                            {!readOnly && (
                                                <td className="px-4 py-3 whitespace-nowrap text-right text-[13px] font-medium" onClick={e => e.stopPropagation()}>
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"><Edit size={16} /></button>
                                                        <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>

                                        {/* Collapsible stock breakup for profiles */}
                                        {isProfile && isExpanded && (
                                            <tr>
                                                <td colSpan={colCount} className="p-0 bg-indigo-50/60 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-800/40">
                                                    <div className="px-6 py-3">
                                                        {!profileBreakdown || profileBreakdown.length === 0 ? (
                                                            <p className="text-[12px] text-slate-400 italic">No length-tracked stock available.</p>
                                                        ) : (
                                                            <table className="w-full border-collapse text-[12px]">
                                                                <thead>
                                                                    <tr className="border-b border-indigo-200/60 dark:border-indigo-700/40">
                                                                        <th className="pb-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-indigo-400">Length each (Wt)</th>
                                                                        <th className="pb-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-indigo-400">Pcs</th>
                                                                        <th className="pb-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-indigo-400">Total Length (Total Wt)</th>
                                                                        <th className="pb-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-indigo-400">Wtd Avg Rate</th>
                                                                        <th className="pb-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-indigo-400">Value</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {profileBreakdown.map(row => (
                                                                        <tr key={`${row.lpp}_${row.unit}`} className="border-b border-indigo-100/40 dark:border-indigo-800/20 last:border-0">
                                                                            <td className="py-1.5 text-slate-700 dark:text-slate-300 font-medium tabular-nums">
                                                                                {row.lpp} {row.unit}
                                                                                {row.wtPerPc > 0 && (
                                                                                    <span className="ml-1.5 text-[10px] text-slate-400">({row.wtPerPc.toFixed(3)} kg/pc)</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="py-1.5 text-right font-bold tabular-nums text-slate-800 dark:text-white">
                                                                                {row.pcs}
                                                                            </td>
                                                                            <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                                                                                {row.totalLengthNative.toFixed(1)} {row.unit}
                                                                                {row.totalKg > 0 && (
                                                                                    <span className="ml-1.5 text-[10px] text-slate-400">({row.totalKg.toFixed(2)} kg)</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="py-1.5 text-right text-indigo-600 dark:text-indigo-400 tabular-nums font-medium">
                                                                                {row.wAvgRate > 0 ? `₹${row.wAvgRate.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/kg` : '—'}
                                                                            </td>
                                                                            <td className="py-1.5 text-right font-extrabold tabular-nums text-slate-900 dark:text-white">
                                                                                {row.value > 0 ? formatCurrency(row.value, 'INR') : '—'}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredItems.length === 0 && !loading && (
                    <div className="text-center py-10">
                        <Package className="mx-auto h-8 w-8 text-slate-300" />
                        <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">No components found</h3>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SignageInventoryManager;
