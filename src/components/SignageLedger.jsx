import React, { useState } from 'react';
import { Archive, Trash2, Edit, X, Search, ClipboardList, Plus } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';

const toMeters = (length, unit) => {
    if (unit === 'm') return length;
    if (unit === 'ft') return length * 0.3048;
    if (unit === 'mm') return length / 1000;
    return length;
};

const emptyTx = () => ({
    date: new Date().toISOString().split('T')[0],
    type: 'in', itemId: '', qty: '', remarks: '',
    lengthPerPiece: '', lengthUnit: 'ft', purchaseRatePerKg: ''
});

const SignageLedger = ({ signageInventory = [], signageTransactions = [], readOnly = false }) => {
    const [newTx, setNewTx] = useState(emptyTx());
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');

    const col = () => db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_transactions');

    const selectedItem = signageInventory.find(i => i.id === newTx.itemId);
    const isProfileSelected = selectedItem?.type === 'profile';

    const buildTxData = (tx) => {
        const item = signageInventory.find(i => i.id === tx.itemId);
        const isProfile = item?.type === 'profile';
        const data = { ...tx, qty: Number(tx.qty) };
        if (isProfile && Number(tx.lengthPerPiece) > 0) {
            data.lengthPerPiece = Number(tx.lengthPerPiece);
            data.lengthUnit = tx.lengthUnit || 'ft';
            data.purchaseRatePerKg = tx.type === 'in' ? Number(tx.purchaseRatePerKg || 0) : 0;
        } else {
            delete data.lengthPerPiece;
            delete data.lengthUnit;
            delete data.purchaseRatePerKg;
        }
        return data;
    };

    const handleAddTx = async () => {
        if (!newTx.itemId || !newTx.qty) return alert('Select Item and Qty');
        if (isProfileSelected && !newTx.lengthPerPiece) return alert('Length per piece is required for profiles');
        try {
            const txData = buildTxData(newTx);
            if (editingId) {
                await col().doc(editingId).update({ ...txData, updatedAt: new Date() });
                setEditingId(null);
                setShowForm(false);
            } else {
                await col().add({ ...txData, createdAt: new Date() });
            }
            setNewTx(emptyTx());
        } catch (e) { console.error(e); }
    };

    const handleEdit = (tx) => {
        setNewTx({
            ...emptyTx(),
            ...tx,
            qty: tx.qty,
            lengthPerPiece: tx.lengthPerPiece ?? '',
            lengthUnit: tx.lengthUnit ?? 'ft',
            purchaseRatePerKg: tx.purchaseRatePerKg ?? '',
        });
        setEditingId(tx.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setEditingId(null);
        setShowForm(false);
        setNewTx(emptyTx());
    };

    const handleDelete = async (id) => {
        if (confirm('Delete record?')) {
            await col().doc(id).delete();
        }
    };

    const getItemLabel = (item) => {
        if (!item) return '—';
        return item.brand ? `${item.brand} ${item.model}` : item.model;
    };

    const getItemSubSpec = (item) => {
        if (!item) return '';
        if (item.type === 'profile') return item.profileType || '';
        if (item.type === 'led') return item.ledType || '';
        if (item.type === 'smps') return item.environment || '';
        if (item.type === 'acp') return item.acpThickness ? `${item.acpThickness}` : '';
        return '';
    };

    // Current stock for an item, excluding the tx being edited
    const getStockBalance = (itemId) =>
        signageTransactions
            .filter(tx => tx.itemId === itemId && tx.id !== editingId)
            .reduce((acc, tx) => acc + (tx.type === 'in' ? Number(tx.qty) : -Number(tx.qty)), 0);

    // For profiles: distinct lengths still in stock, excluding the tx being edited
    const getProfileAvailableLengths = (itemId) => {
        const txs = signageTransactions.filter(tx => tx.itemId === itemId && tx.id !== editingId);
        const map = {};
        txs.forEach(tx => {
            const lpp = Number(tx.lengthPerPiece || 0);
            if (!lpp) return;
            const unit = tx.lengthUnit || 'ft';
            const key = `${lpp}_${unit}`;
            if (!map[key]) map[key] = { lpp, unit, qty: 0 };
            map[key].qty += tx.type === 'in' ? Number(tx.qty) : -Number(tx.qty);
        });
        return Object.values(map).filter(l => l.qty > 0).sort((a, b) => a.lpp - b.lpp);
    };

    // Returns enriched profile data if the tx has length info, otherwise null
    const enrichProfileTx = (tx, item) => {
        const lpp = Number(tx.lengthPerPiece || 0);
        if (!lpp || item?.type !== 'profile') return null;
        const unit = tx.lengthUnit || 'ft';
        const qty = Number(tx.qty);
        const totalLength = qty * lpp;
        const totalLengthM = toMeters(totalLength, unit);
        const kg = totalLengthM * Number(item.weightPerMeter || 0);
        const rate = Number(tx.purchaseRatePerKg || 0);
        const value = kg * rate;
        return { lpp, unit, totalLength, totalLengthM, kg, value };
    };

    const sortedTx = [...signageTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    const filteredTx = sortedTx.filter(tx => {
        const item = signageInventory.find(i => i.id === tx.itemId) || {};
        const matchesSearch = !searchTerm.trim() ||
            `${getItemLabel(item)} ${tx.remarks || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || tx.type === filterType;
        return matchesSearch && matchesType;
    });

    const getGroupedOptions = () => {
        const groups = signageInventory.reduce((acc, item) => {
            const type = item.type || 'Other';
            if (!acc[type]) acc[type] = [];
            acc[type].push(item);
            return acc;
        }, {});
        return Object.keys(groups).sort().map(type => (
            <optgroup key={type} label={type.replace(/_/g, ' ').toUpperCase()}>
                {groups[type]
                    .sort((a, b) => getItemLabel(a).localeCompare(getItemLabel(b)))
                    .map(i => (
                        <option key={i.id} value={i.id}>{getItemLabel(i)}</option>
                    ))
                }
            </optgroup>
        ));
    };

    const inputCls = "px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500 transition-shadow";

    // Stock-cap helpers (only relevant when form is open)
    const currentStock = newTx.itemId ? getStockBalance(newTx.itemId) : null;
    const availableLengths = (isProfileSelected && newTx.type === 'out' && newTx.itemId)
        ? getProfileAvailableLengths(newTx.itemId)
        : [];
    const selectedLengthStock = availableLengths.find(
        l => l.lpp === Number(newTx.lengthPerPiece) && l.unit === newTx.lengthUnit
    );
    const maxQty = newTx.type === 'out'
        ? (isProfileSelected && newTx.lengthPerPiece
            ? (selectedLengthStock?.qty ?? 0)
            : (currentStock ?? 0))
        : null;

    return (
        <div className="p-3 md:p-4">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-sm">
                        <Archive className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Signage Stock Ledger
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {signageTransactions.length} {signageTransactions.length === 1 ? 'transaction' : 'transactions'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:w-52">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 placeholder:text-slate-400 transition-shadow"
                        />
                    </div>

                    {/* In/Out filter */}
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                        {['all', 'in', 'out'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterType(f)}
                                className={`px-2.5 py-2 text-[11px] font-bold uppercase transition-colors ${filterType === f
                                    ? f === 'in' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                        : f === 'out' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                                    : 'bg-white dark:bg-slate-800 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                {f === 'all' ? 'All' : f === 'in' ? 'In' : 'Out'}
                            </button>
                        ))}
                    </div>

                    {/* Add button */}
                    {!showForm && !readOnly && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex-shrink-0 bg-slate-800 dark:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-slate-900 dark:hover:bg-slate-500 transition-colors shadow-sm"
                        >
                            <Plus size={15} /> Add
                        </button>
                    )}
                </div>
            </div>

            {/* ── Add/Edit Form ── */}
            {showForm && !readOnly && (
                <div className={`p-3 rounded-xl border mb-4 transition-colors ${editingId ? 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-600">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{editingId ? '✏️ Edit Transaction' : '➕ New Transaction'}</h3>
                        {editingId
                            ? <button onClick={handleCancel} className="text-xs text-red-500 flex items-center gap-1 hover:text-red-700 transition-colors"><X size={14} /> Cancel</button>
                            : <button onClick={handleCancel} className="text-xs text-slate-500 flex items-center gap-1 hover:text-red-500 transition-colors"><X size={14} /> Close</button>
                        }
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Date & Action</label>
                            <div className="flex gap-1.5">
                                <input type="date" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })} className={inputCls + " flex-1"} />
                                <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                                    <button
                                        onClick={() => setNewTx({ ...newTx, type: 'in' })}
                                        className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${newTx.type === 'in' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-white dark:bg-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                    >+ IN</button>
                                    <button
                                        onClick={() => {
                                            const balance = newTx.itemId ? getStockBalance(newTx.itemId) : 0;
                                            const updates = { type: 'out' };
                                            if (isProfileSelected && newTx.lengthPerPiece) {
                                                const avail = getProfileAvailableLengths(newTx.itemId);
                                                const found = avail.find(l => l.lpp === Number(newTx.lengthPerPiece) && l.unit === newTx.lengthUnit);
                                                if (!found) { updates.lengthPerPiece = ''; updates.qty = ''; }
                                                else if (newTx.qty && Number(newTx.qty) > found.qty) updates.qty = String(found.qty);
                                            } else if (newTx.qty && Number(newTx.qty) > balance) {
                                                updates.qty = String(balance);
                                            }
                                            setNewTx({ ...newTx, ...updates });
                                        }}
                                        className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${newTx.type === 'out' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-white dark:bg-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                    >- OUT</button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Component</label>
                            <select value={newTx.itemId} onChange={e => {
                                const newId = e.target.value;
                                const updates = { itemId: newId, lengthPerPiece: '', lengthUnit: 'ft' };
                                if (newTx.type === 'out' && newId && newTx.qty) {
                                    const bal = getStockBalance(newId);
                                    if (Number(newTx.qty) > bal) updates.qty = String(bal);
                                }
                                setNewTx({ ...newTx, ...updates });
                            }} className={inputCls + " w-full"}>
                                <option value="">Select Item...</option>
                                {getGroupedOptions()}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                Quantity (pcs)
                                {newTx.type === 'out' && newTx.itemId && maxQty !== null && (
                                    <span className="ml-1.5 text-[10px] normal-case font-normal text-red-400">
                                        max {maxQty}
                                    </span>
                                )}
                            </label>
                            <input
                                type="number"
                                placeholder="Qty"
                                value={newTx.qty}
                                min={0}
                                max={newTx.type === 'out' && maxQty !== null ? maxQty : undefined}
                                onChange={e => {
                                    let val = e.target.value;
                                    if (newTx.type === 'out' && val !== '' && maxQty !== null && Number(val) > maxQty) {
                                        val = String(maxQty);
                                    }
                                    setNewTx({ ...newTx, qty: val });
                                }}
                                className={inputCls + " w-full"}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Location / Source</label>
                            <input type="text" placeholder="Source/Loc" value={newTx.remarks} onChange={e => setNewTx({ ...newTx, remarks: e.target.value })} className={inputCls + " w-full"} />
                        </div>
                    </div>

                    {/* Profile-specific fields */}
                    {isProfileSelected && (
                        <div className="mt-1 mb-3 p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
                            <p className="text-[10px] font-bold uppercase text-indigo-500 dark:text-indigo-400 mb-2 tracking-wider">Profile Length Tracking</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {newTx.type === 'out' ? (
                                    /* OUT: dropdown of lengths currently in stock */
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Length in Stock</label>
                                        {availableLengths.length === 0 ? (
                                            <p className="text-[11px] text-red-400 italic py-1.5">No length data in stock</p>
                                        ) : (
                                            <select
                                                value={newTx.lengthPerPiece !== '' ? `${newTx.lengthPerPiece}_${newTx.lengthUnit}` : ''}
                                                onChange={e => {
                                                    if (!e.target.value) {
                                                        setNewTx({ ...newTx, lengthPerPiece: '', lengthUnit: 'ft' });
                                                        return;
                                                    }
                                                    const found = availableLengths.find(l => `${l.lpp}_${l.unit}` === e.target.value);
                                                    if (found) {
                                                        const clampedQty = newTx.qty
                                                            ? String(Math.min(Number(newTx.qty), found.qty))
                                                            : '';
                                                        setNewTx({ ...newTx, lengthPerPiece: found.lpp, lengthUnit: found.unit, qty: clampedQty });
                                                    }
                                                }}
                                                className={inputCls + " w-full"}
                                            >
                                                <option value="">Select length…</option>
                                                {availableLengths.map(l => (
                                                    <option key={`${l.lpp}_${l.unit}`} value={`${l.lpp}_${l.unit}`}>
                                                        {l.lpp} {l.unit} — {l.qty} pcs available
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                ) : (
                                    /* IN: free-form length + unit inputs */
                                    <>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                                                Length / Piece <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 6"
                                                value={newTx.lengthPerPiece}
                                                required
                                                onChange={e => setNewTx({ ...newTx, lengthPerPiece: e.target.value })}
                                                className={inputCls + " w-full" + (!newTx.lengthPerPiece ? " border-red-300 dark:border-red-600" : "")}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Unit</label>
                                            <select
                                                value={newTx.lengthUnit}
                                                onChange={e => setNewTx({ ...newTx, lengthUnit: e.target.value })}
                                                className={inputCls + " w-full"}
                                            >
                                                <option value="ft">ft (feet)</option>
                                                <option value="m">m (metres)</option>
                                                <option value="mm">mm (millimetres)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Purchase Rate (₹/kg)</label>
                                            <input
                                                type="number"
                                                placeholder="₹ per kg"
                                                value={newTx.purchaseRatePerKg}
                                                onChange={e => setNewTx({ ...newTx, purchaseRatePerKg: e.target.value })}
                                                className={inputCls + " w-full"}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            {/* Live preview */}
                            {newTx.qty && newTx.lengthPerPiece && (
                                <div className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                                    {(() => {
                                        const q = Number(newTx.qty);
                                        const lpp = Number(newTx.lengthPerPiece);
                                        const unit = newTx.lengthUnit;
                                        const total = q * lpp;
                                        const totalM = toMeters(total, unit);
                                        const kg = totalM * Number(selectedItem?.weightPerMeter || 0);
                                        const rate = Number(newTx.purchaseRatePerKg || 0);
                                        const val = kg * rate;
                                        return (
                                            <span>
                                                {q} pcs × {lpp}{unit} = <strong>{total.toFixed(2)}{unit}</strong>
                                                {kg > 0 && <> → <strong>{kg.toFixed(2)} kg</strong></>}
                                                {val > 0 && <> → <strong>{formatCurrency(val, 'INR')}</strong></>}
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}

                    <button onClick={handleAddTx} className={`w-full md:w-auto text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-800 dark:bg-slate-600 hover:bg-slate-900 dark:hover:bg-slate-500'}`}>
                        {editingId ? 'Update Transaction' : 'Add Transaction'}
                    </button>
                </div>
            )}

            {/* ── Transaction History ── */}
            <div className="mt-4">
                {/* Mobile Cards */}
                <div className="md:hidden space-y-2">
                    {filteredTx.map(tx => {
                        const item = signageInventory.find(i => i.id === tx.itemId) || {};
                        const enriched = enrichProfileTx(tx, item);
                        return (
                            <div key={tx.id} className={`bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between ${editingId === tx.id ? 'ring-2 ring-amber-300' : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className={`px-1.5 py-px rounded text-[10px] font-bold uppercase ${tx.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {tx.type === 'in' ? 'IN' : 'OUT'}
                                        </span>
                                        <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                                            {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')}
                                        </span>
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-white text-sm truncate">{getItemLabel(item)}</div>
                                    {enriched && (
                                        <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium mt-0.5">
                                            {tx.qty}×{enriched.lpp}{enriched.unit} = {enriched.totalLength.toFixed(1)}{enriched.unit} · {enriched.kg.toFixed(2)}kg
                                            {enriched.value > 0 && ` · ₹${Number(tx.purchaseRatePerKg).toLocaleString('en-IN')}/kg`}
                                        </div>
                                    )}
                                    {tx.remarks && <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{tx.remarks}</div>}
                                </div>
                                <div className="text-right pl-3 border-l border-slate-100 dark:border-slate-700 ml-2 flex-shrink-0">
                                    <span className={`block text-base font-extrabold tabular-nums ${tx.type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                                        {tx.type === 'in' ? '+' : '-'}{tx.qty}
                                    </span>
                                    {!readOnly && (
                                        <div className="flex gap-2 justify-end mt-0.5">
                                            <button onClick={() => handleEdit(tx)} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">Edit</button>
                                            <button onClick={() => handleDelete(tx.id)} className="text-[10px] text-red-400 hover:text-red-600 font-medium">Del</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filteredTx.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                            <p className="text-sm text-slate-400">No transactions found.</p>
                        </div>
                    )}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700">
                                    <th className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Date</th>
                                    <th className="px-3 py-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Type</th>
                                    <th className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Component</th>
                                    <th className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Category</th>
                                    <th className="px-3 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Qty / Length</th>
                                    <th className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Loc/Source</th>
                                    {!readOnly && <th className="px-2 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                {filteredTx.map((tx, rowIdx) => {
                                    const item = signageInventory.find(i => i.id === tx.itemId) || {};
                                    const subSpec = getItemSubSpec(item);
                                    const enriched = enrichProfileTx(tx, item);
                                    return (
                                        <tr key={tx.id} className={`group transition-colors duration-100 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50'} hover:bg-blue-50/50 dark:hover:bg-slate-700/60 ${editingId === tx.id ? 'bg-amber-50/60 dark:bg-amber-900/20' : ''}`}>
                                            {/* Date */}
                                            <td className="px-3 py-1 whitespace-nowrap">
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                                    {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')}
                                                </span>
                                            </td>

                                            {/* Type */}
                                            <td className="px-3 py-1 whitespace-nowrap text-center">
                                                <span className={`inline-block px-1 py-px rounded text-[9px] font-bold uppercase tracking-widest ${tx.type === 'in' ? 'bg-green-50 text-green-600 ring-1 ring-green-200/60 dark:bg-green-900/30' : 'bg-red-50 text-red-600 ring-1 ring-red-200/60 dark:bg-red-900/30'}`}>
                                                    {tx.type}
                                                </span>
                                            </td>

                                            {/* Component */}
                                            <td className="px-3 py-1 max-w-[200px]">
                                                <span className="text-[12px] font-semibold text-slate-800 dark:text-white truncate block">
                                                    {getItemLabel(item)}
                                                </span>
                                            </td>

                                            {/* Category */}
                                            <td className="px-3 py-1 whitespace-nowrap">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                                        {item.type?.replace(/_/g, ' ') || '—'}
                                                    </span>
                                                    {subSpec && (
                                                        <span className="text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1 py-px rounded uppercase">
                                                            {subSpec}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Qty / Length */}
                                            <td className="px-3 py-1 whitespace-nowrap text-right">
                                                <span className={`text-[13px] font-extrabold tabular-nums tracking-tight ${tx.type === 'in' ? 'text-green-600 dark:text-green-500' : 'text-red-500 dark:text-red-400'}`}>
                                                    {tx.type === 'in' ? '+' : '-'}{tx.qty} pcs
                                                </span>
                                                {enriched && (
                                                    <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium leading-tight mt-0.5">
                                                        <span>{tx.qty}×{enriched.lpp}{enriched.unit} = {enriched.totalLength.toFixed(1)}{enriched.unit}</span>
                                                        {enriched.kg > 0 && (
                                                            <span className="block">
                                                                {enriched.kg.toFixed(2)} kg
                                                                {enriched.value > 0 && ` · ₹${Number(tx.purchaseRatePerKg).toLocaleString('en-IN')}/kg`}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Loc/Source */}
                                            <td className="px-3 py-1 max-w-[120px]">
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={tx.remarks}>
                                                    {tx.remarks || '—'}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            {!readOnly && (
                                                <td className="px-2 py-1 whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-0">
                                                        <button onClick={() => handleEdit(tx)} className="w-6 h-6 rounded flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit">
                                                            <Edit size={12} />
                                                        </button>
                                                        <button onClick={() => handleDelete(tx.id)} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {filteredTx.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-center bg-white dark:bg-slate-800">
                            <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                            <p className="text-[12px] font-medium text-slate-400 uppercase tracking-widest">
                                {searchTerm || filterType !== 'all' ? 'No matching transactions' : 'No transactions recorded'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default SignageLedger;
