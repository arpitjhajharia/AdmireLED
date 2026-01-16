import React from 'react';
import { Box } from 'lucide-react';
import { db, appId } from '../lib/firebase';

const InventoryLedger = ({ user, inventory, transactions }) => {
    const [newTx, setNewTx] = React.useState({
        date: new Date().toISOString().split('T')[0],
        type: 'in', itemId: '', qty: '', source: '', location: '', notes: ''
    });

    const handleAddTx = async () => {
        if (!newTx.itemId || !newTx.qty) return alert("Item and Quantity are required");
        try {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('transactions').add({
                ...newTx,
                qty: Number(newTx.qty),
                createdAt: new Date()
            });
            setNewTx({ ...newTx, qty: '', source: '', notes: '' });
        } catch (e) { console.error(e); }
    };

    const getStock = (id) => transactions.filter(t => t.itemId === id).reduce((acc, t) => acc + (t.type === 'in' ? t.qty : -t.qty), 0);

    return (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                    <Box className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Stock Ledger
                </h2>
            </div>
            {/* Add Transaction Form */}
            <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-6">
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

                <button onClick={handleAddTx} className="w-full md:w-auto bg-teal-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-teal-700 transition-colors shadow-sm">
                    Add Transaction
                </button>
            </div>
            <button onClick={handleAddTx} className="bg-teal-600 text-white p-2 rounded hover:bg-teal-700 font-bold text-sm h-[38px]">Add</button>
        </div>
            {/* History List */ }
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
                            <button onClick={() => handleDelete(tx.id)} className="text-[10px] text-red-400 hover:text-red-600 underline mt-1">Delete</button>
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
                                    <button onClick={() => handleDelete(tx.id)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {sortedTx.length === 0 && <div className="text-center py-8 text-slate-400">No transactions recorded.</div>}
        </div>
    </div>
        </div >
    );
};

export default InventoryLedger;