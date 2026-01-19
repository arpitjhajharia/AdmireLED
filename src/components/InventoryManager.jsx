import React from 'react';
import { Box, Edit, Plus, Trash2, X, Layers } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';

const InventoryManager = ({ user, transactions = [], readOnly = false }) => {
    const [items, setItems] = React.useState([]);
    const [editingId, setEditingId] = React.useState(null);
    const [showForm, setShowForm] = React.useState(false);
    const [newItem, setNewItem] = React.useState({
        type: 'module', brand: '', model: '', vendor: '', pitch: '',
        width: '', height: '', price: '', carriage: '', currency: 'INR', indoor: true,
        brightness: '', refreshRate: '',
        ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
        contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: ''
    });
    const [loading, setLoading] = React.useState(true);
    // Batch Management State
    const [showBatchModal, setShowBatchModal] = React.useState(false);
    const [selectedItemForBatches, setSelectedItemForBatches] = React.useState(null);

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
        // Validation Logic
        if (newItem.type === 'module') {
            if (!newItem.pitch || !newItem.brand || !newItem.model || !newItem.price || !newItem.width || !newItem.height || !newItem.weight || !newItem.avgPower || !newItem.maxPower || !newItem.brightness || !newItem.refreshRate || !newItem.contrast || !newItem.viewAngleH || !newItem.viewAngleV || !newItem.ipFront || !newItem.ipBack) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'cabinet') {
            if (!newItem.brand || !newItem.material || !newItem.model || !newItem.price || !newItem.width || !newItem.height) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'card' || newItem.type === 'processor') {
            if (!newItem.brand || !newItem.model || !newItem.price || !newItem.vendor) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'smps') {
            if (!newItem.brand || !newItem.model || !newItem.price || !newItem.vendor || !newItem.amps || !newItem.voltage) {
                return alert("Please fill all compulsory (*) fields.");
            }
        } else if (newItem.type === 'ready') {
            if (!newItem.pitch || !newItem.brand || !newItem.model || !newItem.price || !newItem.material || !newItem.width || !newItem.height || !newItem.weight || !newItem.avgPower || !newItem.maxPower || !newItem.brightness || !newItem.refreshRate || !newItem.contrast || !newItem.viewAngleH || !newItem.viewAngleV || !newItem.ipFront || !newItem.ipBack) {
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
                voltage: newItem.voltage ? Number(newItem.voltage) : 0,
                updatedAt: new Date()
            };

            if (editingId) {
                await collectionRef.doc(editingId).update(itemData);
                setEditingId(null);
                setShowForm(false);
            } else {
                await collectionRef.add({ ...itemData, createdAt: new Date() });
                setNewItem({
                    type: newItem.type,
                    brand: '', model: '', vendor: '', pitch: '',
                    width: '', height: '', price: '', carriage: '', currency: 'INR', indoor: true,
                    brightness: '', refreshRate: '',
                    ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
                    contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: ''
                });
                alert("Item Added!");
            }
        } catch (e) { console.error(e); }
    };

    const handleEdit = (item) => {
        setNewItem({ ...item, vendor: item.vendor || '', currency: item.currency || 'INR', carriage: item.carriage || 0 });
        setEditingId(item.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setShowForm(false);
        setNewItem({
            type: 'module', brand: '', model: '', vendor: '', pitch: '',
            width: '', height: '', price: '', carriage: '', currency: 'INR', indoor: true,
            brightness: '', refreshRate: '',
            ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
            contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: ''
        });
    };

    const handleDelete = async (id) => {
        if (confirm("Delete this item?")) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory').doc(id).delete();
        }
    };

    // --- Batch Management Functions ---
    const openBatchModal = (item) => {
        setSelectedItemForBatches(item);
        setShowBatchModal(true);
    };

    // Helper to calculate batches from Ledger Transactions
    const getBatchBalances = (itemId) => {
        const itemTransactions = transactions.filter(t => t.itemId === itemId);
        const batchMap = {};

        // 1. Group by Batch
        itemTransactions.forEach(tx => {
            const batchName = tx.batch || 'Unbatched';
            const qty = tx.type === 'in' ? Number(tx.qty) : -Number(tx.qty);

            if (!batchMap[batchName]) batchMap[batchName] = 0;
            batchMap[batchName] += qty;
        });

        // 2. Convert to Array and Filter out Zero balances
        return Object.entries(batchMap)
            .map(([name, qty]) => ({ name, qty }))
            .filter(b => b.qty !== 0) // Optional: Hide zero balance batches
            .sort((a, b) => b.qty - a.qty); // Sort highest stock first
    };

    // Sorting Logic: 1. By Type (A-Z) -> 2. By Name (A-Z)
    const sortedItems = [...items].sort((a, b) => {
        const typeA = (a.type || '').toLowerCase();
        const typeB = (b.type || '').toLowerCase();

        if (typeA < typeB) return -1;
        if (typeA > typeB) return 1;

        // If types are same, sort by Brand + Model
        const nameA = (a.brand + ' ' + a.model).toLowerCase();
        const nameB = (b.brand + ' ' + b.model).toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;

        return 0;
    });

    return (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                    <Box className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Components Management
                </h2>
                {!showForm && !readOnly && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-teal-700 transition-colors"
                    >
                        <Plus size={16} /> Add New Component
                    </button>
                )}
            </div>

            {/* Add/Edit Item Form - Toggleable */}
            {showForm && (
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 p-6 rounded-lg transition-colors border shadow-sm ${editingId ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                    <div className="col-span-2 md:col-span-4 flex justify-between items-center mb-2 pb-2 border-b border-slate-200 dark:border-slate-600">
                        <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400">{editingId ? 'Editing Item' : 'Add New Item'}</h3>
                        <button onClick={handleCancelEdit} className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1">
                            <X size={14} /> Close
                        </button>
                    </div>

                    <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}>
                        <option value="module">Module</option>
                        <option value="cabinet">Cabinet</option>
                        <option value="ready">Ready Unit</option>
                        <option value="card">Receiving Card</option>
                        <option value="smps">SMPS</option>
                        <option value="processor">Processor</option>
                    </select>

                    {(newItem.type === 'module' || newItem.type === 'ready') && (
                        <>
                            <input placeholder="Pitch*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white border-teal-500 ring-1 ring-teal-500" value={newItem.pitch} onChange={e => setNewItem({ ...newItem, pitch: e.target.value })} />
                            <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white border-teal-500 ring-1 ring-teal-500" value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                                <option value="true">Indoor</option>
                                <option value="false">Outdoor</option>
                            </select>
                        </>
                    )}

                    <input placeholder={(newItem.type === 'module' || newItem.type === 'ready' || newItem.type === 'cabinet' || newItem.type === 'card' || newItem.type === 'processor' || newItem.type === 'smps') ? "Brand*" : "Brand"} className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.brand} onChange={e => setNewItem({ ...newItem, brand: e.target.value })} />
                    <input placeholder={(newItem.type === 'module' || newItem.type === 'ready' || newItem.type === 'cabinet' || newItem.type === 'card' || newItem.type === 'processor' || newItem.type === 'psu') ? "Model/SKU*" : "Model"} className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} />

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

                    {newItem.type !== 'cabinet' && (
                        <input placeholder={(newItem.type === 'card' || newItem.type === 'processor' || newItem.type === 'smps') ? "Vendor*" : "Vendor"} className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.vendor} onChange={e => setNewItem({ ...newItem, vendor: e.target.value })} />
                    )}

                    {(newItem.type === 'card' || newItem.type === 'processor') && (
                        <input placeholder="Ports (Optional)" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ports} onChange={e => setNewItem({ ...newItem, ports: e.target.value })} />
                    )}

                    {newItem.type === 'smps' && (
                        <>
                            <input placeholder="Capacity (Amps)*" type="number" step="0.1" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.amps} onChange={e => setNewItem({ ...newItem, amps: e.target.value })} />
                            <input placeholder="Voltage (V)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.voltage} onChange={e => setNewItem({ ...newItem, voltage: e.target.value })} />
                        </>
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
                            <input placeholder="Cabinet Material*" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
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
                    <button
                        onClick={handleSaveItem}
                        className={`px-4 py-2 rounded text-white flex items-center justify-center gap-2 hover:opacity-90 transition ${editingId ? 'bg-amber-600' : 'bg-teal-600'} col-span-2 md:col-span-1`}
                    >
                        {editingId ? <Edit size={16} /> : <Plus size={16} />}
                        {editingId ? 'Update Item' : 'Add Item'}
                    </button>
                </div>
            )}

            {/* --- RESPONSIVE LIST SECTION --- */}
            <div className="mt-6">

                {/* 1. Mobile Card View (Visible on phones only) */}
                <div className="md:hidden space-y-4">
                    {sortedItems.map(item => {
                        const stock = transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0);
                        return (
                            <div key={item.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-lg text-[10px] font-bold uppercase tracking-wider ${item.type === 'module' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                    {item.type}
                                </div>

                                <div className="pr-16 mb-3">
                                    <h3 className="font-bold text-slate-800 dark:text-white text-lg">{item.brand} {item.model}</h3>
                                    {item.vendor && <div className="text-xs text-teal-600 font-medium">{item.vendor}</div>}
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                                    <div>
                                        <span className="block text-[10px] uppercase font-bold text-slate-400">Specs</span>
                                        {item.type === 'module' ? (
                                            <span>P{item.pitch} {item.indoor ? 'In' : 'Out'} • {item.width}x{item.height}</span>
                                        ) : (
                                            <span>{item.width ? `${item.width}x${item.height}` : 'Standard'}</span>
                                        )}
                                    </div>
                                    <div>
                                        <span className="block text-[10px] uppercase font-bold text-slate-400">Stock</span>
                                        <span className={`font-bold text-sm ${stock < 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>{stock}</span>
                                    </div>

                                    {/* Landed Cost (Left) */}
                                    <div className={`border-t border-slate-200 dark:border-slate-600 pt-2 mt-1 ${!readOnly ? 'col-span-1' : 'col-span-2'}`}>
                                        <span className="block text-[10px] uppercase font-bold text-slate-400">Landed Cost</span>
                                        <span className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency((item.price || 0) + (item.carriage || 0), item.currency || 'INR', false, true)}</span>
                                    </div>

                                    {/* Stock Value (Right) - Managers Only */}
                                    {!readOnly && (
                                        <div className="col-span-1 border-t border-slate-200 dark:border-slate-600 pt-2 mt-1 text-right">
                                            <span className="block text-[10px] uppercase font-bold text-slate-400">Stock Value</span>
                                            <span className="font-bold text-teal-600 dark:text-teal-400">
                                                {formatCurrency(((item.price || 0) + (item.carriage || 0)) * stock, item.currency || 'INR', false, true)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    {item.type === 'module' && (
                                        <button onClick={() => openBatchModal(item)} className="flex-1 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg text-xs font-bold flex justify-center items-center gap-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"><Layers size={14} /> Batches</button>
                                    )}
                                    {!readOnly && (
                                        <>
                                            <button onClick={() => handleEdit(item)} className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold flex justify-center items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"><Edit size={14} /> Edit</button>
                                            <button onClick={() => handleDelete(item.id)} className="flex-1 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold flex justify-center items-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"><Trash2 size={14} /> Delete</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 2. Desktop Table View (Hidden on phones) */}
                <div className="hidden md:block overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                            <tr>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Component</th>
                                <th className="px-4 py-3">Specs</th>
                                <th className="px-4 py-3 text-center">Stock</th>
                                {!readOnly && <th className="px-4 py-3 text-right">Stock Value</th>}
                                <th className="px-4 py-3">Landed Cost</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {sortedItems.map(item => {
                                const stock = transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0);
                                const landedCost = (item.price || 0) + (item.carriage || 0);

                                return (
                                    <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${editingId === item.id ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                                        <td className="px-4 py-3 capitalize"><span className={`px-2 py-1 rounded-full text-xs capitalize ${item.type === 'module' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                                            item.type === 'cabinet' ? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' :
                                                item.type === 'card' ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' :
                                                    item.type === 'smps' ? 'bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300' :
                                                        item.type === 'processor' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' :
                                                            item.type === 'ready' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' :
                                                                'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}>{item.type === 'smps' ? 'SMPS' : item.type}</span></td>
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
                                            {item.type === 'smps' && (
                                                <span>{item.amps ? `${item.amps} Amps` : ''}</span>
                                            )}
                                            {item.type === 'ready' && (
                                                <span>{item.width}x{item.height}mm P{item.pitch}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-bold dark:text-slate-200 text-teal-600 text-center">
                                            {stock}
                                        </td>

                                        {!readOnly && (
                                            <td className="px-4 py-3 font-bold text-right text-teal-600 dark:text-teal-400">
                                                {formatCurrency(stock * landedCost, item.currency || 'INR', false, true)}
                                            </td>
                                        )}

                                        <td className="px-4 py-3 dark:text-slate-200">
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{formatCurrency(landedCost, item.currency || 'INR', false, true)}</span>
                                                {(item.carriage > 0) && <span className="text-[10px] text-slate-400">Base: {item.price} + Carr: {item.carriage}</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 flex gap-2 justify-end">
                                            {item.type === 'module' && (
                                                <button onClick={() => openBatchModal(item)} title="Manage Batches" className="text-purple-500 hover:text-purple-700 p-1 bg-purple-50 dark:bg-purple-900/30 rounded"><Layers size={14} /></button>
                                            )}
                                            {!readOnly && (
                                                <>
                                                    <button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 p-1 bg-blue-50 dark:bg-blue-900/30 rounded"><Edit size={14} /></button>
                                                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 dark:bg-red-900/30 rounded"><Trash2 size={14} /></button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {items.length === 0 && !loading && <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800">No items found.</div>}
            </div>
            {/* Batch Management Modal */}
            {showBatchModal && selectedItemForBatches && (
                <div className="fixed inset-0 z-50 bg-black/80 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white">Batch Management</h3>
                                <p className="text-xs text-slate-500">{selectedItemForBatches.brand} {selectedItemForBatches.model}</p>
                            </div>
                            <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="p-6">
                            <div className="mb-4 text-xs text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-100 dark:border-blue-800">
                                ℹ️ To add stock or new batches, please use the <b>Stock Ledger</b> tab. This list shows current calculated balances.
                            </div>

                            {/* Batch List (Derived from Ledger) */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800 p-2 text-xs font-bold text-slate-500 uppercase">
                                    <div>Batch No</div>
                                    <div className="text-right">Current Balance</div>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {getBatchBalances(selectedItemForBatches.id).length === 0 && (
                                        <div className="p-4 text-center text-xs text-slate-400">No active batches found in ledger.</div>
                                    )}
                                    {getBatchBalances(selectedItemForBatches.id).map((batch, idx) => (
                                        <div key={idx} className="grid grid-cols-2 p-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0 text-sm items-center">
                                            <div className="font-medium text-slate-700 dark:text-slate-200">
                                                {batch.name === 'Unbatched' ? <span className="italic text-slate-400">Unbatched Stock</span> : batch.name}
                                            </div>
                                            <div className="text-right font-bold text-slate-900 dark:text-white">{batch.qty}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-teal-50 dark:bg-teal-900/20 flex justify-between items-center border-t border-teal-100 dark:border-teal-800">
                                    <span className="text-xs font-bold text-teal-800 dark:text-teal-400 uppercase">Total in Batches</span>
                                    <span className="text-sm font-bold text-teal-700 dark:text-teal-300">
                                        {getBatchBalances(selectedItemForBatches.id).reduce((acc, b) => acc + b.qty, 0)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryManager;