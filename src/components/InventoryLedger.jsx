import React, { useState } from 'react';
import { Archive, Trash2, Edit, X } from 'lucide-react';
import { db, appId } from '../lib/firebase';

const InventoryLedger = ({ user, inventory = [], transactions = [] }) => {
    const [newTx, setNewTx] = useState({ date: new Date().toISOString().split('T')[0], type: 'in', itemId: '', qty: '', remarks: '' });
    const [editingId, setEditingId] = useState(null);

    const handleAddTx = async () => {
        if (!newTx.itemId || !newTx.qty) return alert("Select Item and Qty");
        try {
            const ref = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('transactions');

            if (editingId) {
                await ref.doc(editingId).update({ ...newTx, qty: Number(newTx.qty), updatedAt: new Date() });
                setEditingId(null);
            } else {
                await ref.add({ ...newTx, qty: Number(newTx.qty), createdAt: new Date() });
            }
            setNewTx({ date: new Date().toISOString().split('T')[0], type: 'in', itemId: '', qty: '', remarks: '' });
        } catch (e) { console.error(e); }
    };

    const handleEdit = (tx) => {
        setNewTx({ ...tx, qty: tx.qty });
        setEditingId(tx.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setEditingId(null);
        setNewTx({ date: new Date().toISOString().split('T')[0], type: 'in', itemId: '', qty: '', remarks: '' });
    };

    const handleDelete = async (id) => {
        if (confirm('Delete record?')) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('transactions').doc(id).delete();
        }
    };

    // Sort: Latest first
    const sortedTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <div className="p-4 md:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-6">
                <Archive className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Stock Ledger</h2>
            </div>

            {/* Add/Edit Transaction Form */}
            <div className={`p-4 rounded-lg border mb-6 transition-colors ${editingId ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-700'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">{editingId ? 'Edit Transaction' : 'New Transaction'}</h3>
                    {editingId && <button onClick={handleCancel} className="text-xs text-red-500 flex items-center gap-1"><X size={14} /> Cancel</button>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Date & Action</label>
                        <div className="flex gap-2">
                            <input type="date" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })} className="flex-1 p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                            <select value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value })} className="w-28 p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white font-bold">
                                <option value="in">Stock IN</option>
                                <option value="out">Stock OUT</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Component</label>
                        <select value={newTx.itemId} onChange={e => setNewTx({ ...newTx, itemId: e.target.value })} className="w-full p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white">
                            <option value="">Select Item...</option>
                            {inventory.sort((a, b) => (a.brand + ' ' + a.model).localeCompare(b.brand + ' ' + b.model)).map(i => (
                                <option key={i.id} value={i.id}>{i.brand} {i.model} ({i.type})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Quantity</label>
                        <input type="number" placeholder="Qty" value={newTx.qty} onChange={e => setNewTx({ ...newTx, qty: e.target.value })} className="w-full p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Location / Source</label>
                        <input type="text" placeholder="Source/Loc" value={newTx.remarks} onChange={e => setNewTx({ ...newTx, remarks: e.target.value })} className="w-full p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white" />
                    </div>
                </div>

                <button onClick={handleAddTx} className={`w-full md:w-auto text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
                    {editingId ? 'Update Transaction' : 'Add Transaction'}
                </button>
            </div>

            {/* History List */}
            <div className="mt-8">
                <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400 mb-4">Transaction History</h3>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                    {sortedTx.map(tx => {
                        const item = inventory.find(i => i.id === tx.itemId) || {};
                        return (
                            <div key={tx.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tx.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {tx.type === 'in' ? 'IN' : 'OUT'}
                                        </span>
                                        <span className="text-xs text-slate-400">{new Date(tx.date).toLocaleDateString()}</span>
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-white text-sm mb-0.5">
                                        {item.brand} {item.model}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {tx.remarks || '-'}
                                    </div>
                                </div>
                                <div className="text-right pl-4 border-l border-slate-100 dark:border-slate-700 ml-2">
                                    <span className={`block text-lg font-bold ${tx.type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                                        {tx.type === 'in' ? '+' : '-'}{tx.qty}
                                    </span>
                                    <div className="flex gap-3 justify-end mt-1">
                                        <button onClick={() => handleEdit(tx)} className="text-[10px] text-blue-500 hover:text-blue-700 underline">Edit</button>
                                        <button onClick={() => handleDelete(tx.id)} className="text-[10px] text-red-400 hover:text-red-600 underline">Delete</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {sortedTx.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">No transactions yet.</div>}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3 text-center">Type</th>
                                <th className="px-4 py-3">Component</th>
                                <th className="px-4 py-3">Specs</th>
                                <th className="px-4 py-3 text-center">Qty</th>
                                <th className="px-4 py-3">Loc/Source</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {sortedTx.map(tx => {
                                const item = inventory.find(i => i.id === tx.itemId) || {};
                                return (
                                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-3 whitespace-nowrap dark:text-slate-300">{new Date(tx.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${tx.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {tx.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-medium dark:text-white">{item.brand} {item.model}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{item.type}</td>
                                        <td className={`px-4 py-3 text-center font-bold ${tx.type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                                            {tx.type === 'in' ? '+' : '-'}{tx.qty}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{tx.remarks}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => handleEdit(tx)} className="text-blue-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"><Edit size={14} /></button>
                                                <button onClick={() => handleDelete(tx.id)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {sortedTx.length === 0 && <div className="text-center py-8 text-slate-400">No transactions recorded.</div>}
                </div>
            </div>
        </div>
    );
};

export default InventoryLedger;