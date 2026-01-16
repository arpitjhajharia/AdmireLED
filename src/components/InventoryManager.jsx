import React from 'react';
import { Box, Edit, Plus, Trash2 } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';

const InventoryManager = ({ user, transactions = [] }) => {
    const [items, setItems] = React.useState([]);
    const [editingId, setEditingId] = React.useState(null);
    const [newItem, setNewItem] = React.useState({
        type: 'module', brand: '', model: '', vendor: '', pitch: '',
        width: '', height: '', price: '', carriage: '', currency: 'INR', indoor: true,
        brightness: '', refreshRate: '',
        ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
        contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: ''
    });
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!user || !db) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory')
            .onSnapshot(snap => {
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setItems(data);
                setLoading(false);
            }, err => console.error(err));
        return () => unsub();
    }, [user]);

    const handleSaveItem = async () => {
        if (newItem.type === 'module') {
            if (!newItem.pitch || !newItem.brand || !newItem.model || !newItem.price || !newItem.width || !newItem.height || !newItem.weight || !newItem.avgPower || !newItem.maxPower || !newItem.brightness || !newItem.refreshRate || !newItem.contrast || !newItem.viewAngleH || !newItem.viewAngleV || !newItem.ipFront || !newItem.ipBack) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'cabinet') {
            if (!newItem.material || !newItem.model || !newItem.price || !newItem.vendor || !newItem.width || !newItem.height) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'card' || newItem.type === 'processor') {
            if (!newItem.brand || !newItem.model || !newItem.price || !newItem.vendor) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'psu') {
            if (!newItem.brand || !newItem.model || !newItem.price || !newItem.vendor || !newItem.amps) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (!newItem.brand || !newItem.model) {
            return alert("Brand and Model are required");
        }

        try {
            const collectionRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory');

            const itemData = {
                ...newItem,
                width: Number(newItem.width),
                height: Number(newItem.height),
                price: Number(newItem.price),
                carriage: Number(newItem.carriage || 0),
                pitch: Number(newItem.pitch),
                currency: newItem.currency || 'INR',
                indoor: newItem.indoor === 'true' || newItem.indoor === true,
                material: newItem.material || '',
                weight: newItem.weight ? Number(newItem.weight) : 0,
                avgPower: newItem.avgPower ? Number(newItem.avgPower) : 0,
                maxPower: newItem.maxPower ? Number(newItem.maxPower) : 0,
                brightness: newItem.brightness ? parseInt(newItem.brightness) : 0,
                refreshRate: newItem.refreshRate ? parseInt(newItem.refreshRate) : 0,
                viewAngleH: newItem.viewAngleH ? parseInt(newItem.viewAngleH) : 0,
                viewAngleV: newItem.viewAngleV ? parseInt(newItem.viewAngleV) : 0,
                ipFront: newItem.ipFront ? parseInt(newItem.ipFront) : 0,
                ipBack: newItem.ipBack ? parseInt(newItem.ipBack) : 0,
                ports: newItem.ports ? parseInt(newItem.ports) : 0,
                amps: newItem.amps ? Number(newItem.amps) : 0,
                updatedAt: new Date()
            };

            if (editingId) {
                await collectionRef.doc(editingId).update(itemData);
                setEditingId(null);
            } else {
                await collectionRef.add({ ...itemData, createdAt: new Date() });
            }
            setNewItem({
                type: 'module', brand: '', model: '', vendor: '', pitch: '',
                width: '', height: '', price: '', carriage: '', currency: 'INR', indoor: true,
                brightness: '', refreshRate: '',
                ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
                contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: ''
            });
        } catch (e) { console.error(e); }
    };

    const handleEdit = (item) => {
        setNewItem({ ...item, vendor: item.vendor || '', currency: item.currency || 'INR', carriage: item.carriage || 0 });
        setEditingId(item.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setNewItem({
            type: 'module', brand: '', model: '', vendor: '', pitch: '',
            width: '', height: '', price: '', carriage: '', currency: 'INR', indoor: true,
            brightness: '', refreshRate: '',
            ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
            contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: ''
        });
    };

    const handleDelete = async (id) => {
        if (confirm("Delete this item?")) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory').doc(id).delete();
        }
    };

    return (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                    <Box className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Components Management
                </h2>
            </div>

            {/* Add/Edit Item Form */}
            <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 rounded-lg transition-colors ${editingId ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/50'}`}>
                <div className="col-span-2 md:col-span-4 flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400">{editingId ? 'Editing Item' : 'Add New Item'}</h3>
                    {editingId && <button onClick={handleCancelEdit} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">Cancel Edit</button>}
                </div>

                {/* 1. Type */}
                <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}>
                    <option value="module">Module</option>
                    <option value="cabinet">Cabinet</option>
                    <option value="ready">Ready Unit</option>
                    <option value="card">Receiving Card</option>
                    <option value="psu">SMPS</option>
                    <option value="processor">Processor</option>
                </select>

                {/* 2. Module Specific Inputs */}
                {newItem.type === 'module' && (
                    <>
                        <input placeholder="Pitch*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white border-teal-500 ring-1 ring-teal-500" value={newItem.pitch} onChange={e => setNewItem({ ...newItem, pitch: e.target.value })} />
                        <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white border-teal-500 ring-1 ring-teal-500" value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                            <option value="true">Indoor</option>
                            <option value="false">Outdoor</option>
                        </select>
                    </>
                )}

                <input placeholder={(newItem.type === 'module' || newItem.type === 'card' || newItem.type === 'processor' || newItem.type === 'psu') ? "Brand*" : "Brand"} className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.brand} onChange={e => setNewItem({ ...newItem, brand: e.target.value })} />
                <input placeholder={(newItem.type === 'module' || newItem.type === 'cabinet' || newItem.type === 'card' || newItem.type === 'processor' || newItem.type === 'psu') ? "Model/SKU*" : "Model"} className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} />

                {/* Price & Carriage Inputs */}
                <div className="flex gap-2 items-center col-span-2 md:col-span-1">
                    <div className="flex-1 min-w-[100px]" title="Base Price">
                        <input placeholder="Base Rate*" type="number" className="p-2 w-full border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} />
                        <div className="text-[9px] text-slate-400 mt-0.5 ml-1">BASE RATE*</div>
                    </div>
                    <span className="text-slate-400 font-bold mb-3">+</span>
                    <div className="flex-1 min-w-[80px]" title="Carriage Inwards">
                        <input placeholder="Carriage" type="number" className="p-2 w-full border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.carriage} onChange={e => setNewItem({ ...newItem, carriage: e.target.value })} />
                        <div className="text-[9px] text-slate-400 mt-0.5 ml-1">CARRIAGE</div>
                    </div>
                    <div className="flex-none mb-3">
                        <select className="p-2 border rounded bg-slate-100 dark:bg-slate-600 dark:border-slate-600 dark:text-white" value={newItem.currency} onChange={e => setNewItem({ ...newItem, currency: e.target.value })}>
                            <option value="INR">INR</option>
                            <option value="USD">USD</option>
                        </select>
                    </div>
                </div>

                <input placeholder={(newItem.type === 'cabinet' || newItem.type === 'card' || newItem.type === 'processor' || newItem.type === 'psu') ? "Vendor*" : "Vendor"} className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.vendor} onChange={e => setNewItem({ ...newItem, vendor: e.target.value })} />

                {(newItem.type === 'card' || newItem.type === 'processor') && (
                    <input placeholder="Ports (Optional)" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ports} onChange={e => setNewItem({ ...newItem, ports: e.target.value })} />
                )}

                {newItem.type === 'psu' && (
                    <input placeholder="Capacity (Amps)*" type="number" step="0.1" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.amps} onChange={e => setNewItem({ ...newItem, amps: e.target.value })} />
                )}

                {newItem.type === 'module' && (
                    <>
                        <input placeholder="LED Type" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ledType} onChange={e => setNewItem({ ...newItem, ledType: e.target.value })} />
                        <input placeholder="Lamp Make" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.lampMake} onChange={e => setNewItem({ ...newItem, lampMake: e.target.value })} />
                        <input placeholder="Width (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                        <input placeholder="Height (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />
                        <input placeholder="Weight/sqm (kg)*" type="number" step="0.01" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.weight} onChange={e => setNewItem({ ...newItem, weight: e.target.value })} />
                        <input placeholder="Avg Power/sqm (W)*" type="number" step="0.01" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.avgPower} onChange={e => setNewItem({ ...newItem, avgPower: e.target.value })} />
                        <input placeholder="Max Power/sqm (W)*" type="number" step="0.01" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.maxPower} onChange={e => setNewItem({ ...newItem, maxPower: e.target.value })} />
                        <input placeholder="Brightness (nits)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.brightness} onChange={e => setNewItem({ ...newItem, brightness: e.target.value })} />
                        <input placeholder="Refresh Rate*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.refreshRate} onChange={e => setNewItem({ ...newItem, refreshRate: e.target.value })} />
                        <input placeholder="Contrast* (e.g. 5000:1)" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.contrast} onChange={e => setNewItem({ ...newItem, contrast: e.target.value })} />
                        <input placeholder="Viewing Angle (H)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.viewAngleH} onChange={e => setNewItem({ ...newItem, viewAngleH: e.target.value })} />
                        <input placeholder="Viewing Angle (V)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.viewAngleV} onChange={e => setNewItem({ ...newItem, viewAngleV: e.target.value })} />
                        <input placeholder="IP Protection (Front)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ipFront} onChange={e => setNewItem({ ...newItem, ipFront: e.target.value })} />
                        <input placeholder="IP Protection (Back)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ipBack} onChange={e => setNewItem({ ...newItem, ipBack: e.target.value })} />
                    </>
                )}

                {newItem.type === 'cabinet' && (
                    <>
                        <input placeholder="Material*" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
                        <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                            <option value="true">Indoor</option>
                            <option value="false">Outdoor</option>
                        </select>
                        <input placeholder="Width (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                        <input placeholder="Height (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />
                        <input placeholder="Weight (kg)" type="number" step="1" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.weight} onChange={e => setNewItem({ ...newItem, weight: e.target.value })} />
                    </>
                )}

                {newItem.type === 'ready' && (
                    <>
                        <input placeholder="Width (mm)" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                        <input placeholder="Height (mm)" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />
                    </>
                )}
                <button
                    onClick={handleSaveItem}
                    className={`px-4 py-2 rounded text-white flex items-center justify-center gap-2 hover:opacity-90 transition ${editingId ? 'bg-amber-600' : 'bg-teal-600'} col-span-2 md:col-span-1`}
                >
                    {editingId ? <Edit size={16} /> : <Plus size={16} />}
                    {editingId ? 'Update Item' : 'Add Item'}
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-slate-200 dark:border-slate-700 rounded">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                        <tr>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Component</th>
                            <th className="px-4 py-3">Specs</th>
                            <th className="px-4 py-3">Stock</th>
                            <th className="px-4 py-3">Landed Cost</th>
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {items.map(item => (
                            <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${editingId === item.id ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                                <td className="px-4 py-3 capitalize"><span className={`px-2 py-1 rounded-full text-xs ${item.type === 'module' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : item.type === 'ready' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{item.type === 'psu' ? 'SMPS' : item.type}</span></td>
                                <td className="px-4 py-3 dark:text-slate-200">
                                    <div className="font-medium">{item.brand} {item.model}</div>
                                    {item.vendor && <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">{item.vendor}</div>}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
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
                                <td className="px-4 py-3 font-bold dark:text-slate-200 text-teal-600">
                                    {transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0)}
                                </td>
                                <td className="px-4 py-3 dark:text-slate-200">
                                    <div className="flex flex-col">
                                        <span className="font-semibold">{formatCurrency((item.price || 0) + (item.carriage || 0), item.currency || 'INR')}</span>
                                        {(item.carriage > 0) && <span className="text-[10px] text-slate-400">Base: {item.price} + Carr: {item.carriage}</span>}
                                    </div>
                                </td>
                                <td className="px-4 py-3 flex gap-2">
                                    <button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 p-1 bg-blue-50 dark:bg-blue-900/30 rounded"><Edit size={14} /></button>
                                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 dark:bg-red-900/30 rounded"><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {items.length === 0 && !loading && <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800">No items found.</div>}
            </div>
        </div>
    );
};

export default InventoryManager;