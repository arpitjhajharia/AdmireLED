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
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg items-end">
                <div className="col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Date</label>
                    <input type="date" className="w-full p-2 border rounded text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })} />
                </div>
                <div className="col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Action</label>
                    <select className="w-full p-2 border rounded text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white" value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value })}>
                        <option value="in">Stock IN</option>
                        <option value="out">Stock OUT</option>
                    </select>
                </div>
                <div className="col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Component</label>
                    <select className="w-full p-2 border rounded text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white" value={newTx.itemId} onChange={e => setNewTx({ ...newTx, itemId: e.target.value })}>
                        <option value="">Select Item...</option>
                        {['module', 'cabinet', 'ready', 'card', 'processor', 'psu'].map(type => {
                            const items = inventory.filter(i => i.type === type).sort((a, b) => (a.brand + ' ' + a.model).localeCompare(b.brand + ' ' + b.model));
                            if (items.length === 0) return null;
                            return (
                                <optgroup key={type} label={type === 'psu' ? 'SMPS' : type.toUpperCase()}>
                                    {items.map(i => (
                                        <option key={i.id} value={i.id}>
                                            {i.brand} {i.model} (Stock: {getStock(i.id)})
                                        </option>
                                    ))}
                                </optgroup>
                            );
                        })}
                    </select>
                </div>
                <div className="col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Qty</label>
                    <input type="number" placeholder="Qty" className="w-full p-2 border rounded text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white" value={newTx.qty} onChange={e => setNewTx({ ...newTx, qty: e.target.value })} />
                </div>
                <div className="col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Loc/Source</label>
                    <input placeholder="Source/Loc" className="w-full p-2 border rounded text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white" value={newTx.source} onChange={e => setNewTx({ ...newTx, source: e.target.value })} />
                </div>
                <button onClick={handleAddTx} className="bg-teal-600 text-white p-2 rounded hover:bg-teal-700 font-bold text-sm h-[38px]">Add</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-slate-200 dark:border-slate-700 rounded">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                        <tr>
                            <th className="px-4 py-2">Date</th>
                            <th className="px-4 py-2">Type</th>
                            <th className="px-4 py-2">Component</th>
                            <th className="px-4 py-2">Specs</th>
                            <th className="px-4 py-2">Qty</th>
                            <th className="px-4 py-2">Source / Loc</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).map(tx => {
                            const item = inventory.find(i => i.id === tx.itemId) || {};
                            return (
                                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-4 py-2 text-slate-500">{tx.date}</td>
                                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${tx.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{tx.type.toUpperCase()}</span></td>
                                    <td className="px-4 py-2 dark:text-slate-200">
                                        <div className="font-medium">{item.brand} {item.model}</div>
                                        {item.vendor && <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">{item.vendor}</div>}
                                    </td>
                                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs">
                                        {item.type === 'module' && (
                                            <div className="flex flex-col">
                                                <span>P{item.pitch} {item.indoor ? 'Indoor' : 'Outdoor'}</span>
                                                <span>{item.width}x{item.height}mm</span>
                                            </div>
                                        )}
                                        {item.type === 'cabinet' && (
                                            <div className="flex flex-col">
                                                <span>{item.material}</span>
                                                <span>{item.width}x{item.height}mm</span>
                                                <span>{item.indoor ? 'Indoor' : 'Outdoor'}</span>
                                            </div>
                                        )}
                                        {(item.type === 'card' || item.type === 'processor') && (
                                            <span>{item.ports ? `${item.ports} Ports` : ''}</span>
                                        )}
                                        {item.type === 'psu' && (
                                            <span>{item.amps ? `${item.amps} Amps` : ''}</span>
                                        )}
                                        {item.type === 'ready' && (
                                            <span>{item.width}x{item.height}mm P{item.pitch}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 font-bold dark:text-slate-200">{tx.qty}</td>
                                    <td className="px-4 py-2 text-slate-500">{tx.source} {tx.location ? `(${tx.location})` : ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InventoryLedger;