import React from 'react';
import { Box, Edit, Plus, Trash2, X, Layers } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';

const InventoryManager = ({ user, userRole, transactions = [], readOnly = false, exchangeRate = 1 }) => {
    const [items, setItems] = React.useState([]);
    const [editingId, setEditingId] = React.useState(null);
    const [showForm, setShowForm] = React.useState(false);

    // Default State
    const [newItem, setNewItem] = React.useState({
        type: 'module', brand: '', model: '', vendor: '', pitch: '',
        width: '', height: '', length: '', size: '',
        price: '', carriage: '', currency: 'INR', indoor: true,
        brightness: '', refreshRate: '',
        ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
        contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: ''
    });

    const [loading, setLoading] = React.useState(true);
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

    // Helper to determine if Brand is mandatory
    const isBrandMandatory = (type) => {
        return true; // Brand is now compulsory for ALL types based on user request
    };

    const handleSaveItem = async () => {
        // --- VALIDATION LOGIC ---

        // 1. Cables (FRC / Power) - Brand Required, Vendor Optional
        if (['frc_cable', 'power_cable'].includes(newItem.type)) {
            if (!newItem.brand || !newItem.model || !newItem.ports || !newItem.length || !newItem.price) {
                return alert("Required: Brand, Model, No. of Pins, Length, and Price.");
            }
        }
        // 2. Fasteners (Screw / Bolt) - Brand Required, Vendor Optional
        else if (['screw', 'bolt'].includes(newItem.type)) {
            if (!newItem.brand || !newItem.model || !newItem.material || !newItem.size || !newItem.length || !newItem.price) {
                return alert("Required: Brand, Model, Type (SS/MS), Size, Length, and Price.");
            }
        }
        // 3. Gasket - Brand Required, Vendor Optional
        else if (newItem.type === 'gasket') {
            if (!newItem.brand || !newItem.model || !newItem.width || !newItem.length || !newItem.price) {
                return alert("Required: Brand, Model, Width, Length, and Price.");
            }
        }
        // 4. Tools - Brand Required, Vendor Optional
        else if (newItem.type === 'tool') {
            if (!newItem.brand || !newItem.model || !newItem.material || !newItem.price) {
                return alert("Required: Brand, Model, Tool Type, and Price.");
            }
        }
        // 5. Accessory - Brand Required
        else if (newItem.type === 'accessory') {
            if (!newItem.brand || !newItem.model || !newItem.price) {
                return alert("Brand, Model/Description and Price are required.");
            }
        }
        // 6. Core Components (Module/Ready) - Stricter Rules
        else if (newItem.type === 'module' || newItem.type === 'ready') {
            if (!newItem.pitch || !newItem.brand || !newItem.model || !newItem.price ||
                !newItem.width || !newItem.height ||
                !newItem.brightness || !newItem.refreshRate ||
                !newItem.avgPower || !newItem.maxPower ||
                !newItem.contrast || !newItem.viewAngleH || !newItem.viewAngleV ||
                !newItem.ipFront || !newItem.ipBack) {
                return alert("Please fill all compulsory (*) technical fields.");
            }
        }
        // 7. Cabinet - Indoor/Outdoor Compulsory
        else if (newItem.type === 'cabinet') {
            if (!newItem.brand || !newItem.material || !newItem.model || !newItem.price || !newItem.width || !newItem.height) {
                return alert("Please fill all compulsory (*) fields.");
            }
        }
        else if (newItem.type === 'card' || newItem.type === 'processor') {
            if (!newItem.brand || !newItem.model || !newItem.price) {
                return alert("Please fill all compulsory (*) fields.");
            }
        }
        else if (newItem.type === 'smps') {
            if (!newItem.brand || !newItem.model || !newItem.price || !newItem.amps || !newItem.voltage) {
                return alert("Please fill all compulsory (*) fields.");
            }
        }

        try {
            const collectionRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory');

            const itemData = {
                ...newItem,
                brand: newItem.brand || '', // Allow empty brand
                width: Number(newItem.width || 0),
                height: Number(newItem.height || 0),
                length: Number(newItem.length || 0),
                price: Number(newItem.price || 0),
                carriage: Number(newItem.carriage || 0),
                pitch: Number(newItem.pitch || 0),
                currency: newItem.currency || 'INR',
                indoor: newItem.indoor === 'true' || newItem.indoor === true,
                material: newItem.material || '',
                size: newItem.size || '',
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
                    width: '', height: '', length: '', size: '',
                    price: '', carriage: '', currency: 'INR', indoor: true,
                    brightness: '', refreshRate: '',
                    ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
                    contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: ''
                });
                alert("Item Added!");
            }
        } catch (e) { console.error(e); }
    };

    const handleEdit = (item) => {
        setNewItem({
            ...item,
            vendor: item.vendor || '',
            currency: item.currency || 'INR',
            carriage: item.carriage || 0,
            length: item.length || '',
            size: item.size || '',
            brand: item.brand || ''
        });
        setEditingId(item.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setShowForm(false);
        setNewItem({
            type: 'module', brand: '', model: '', vendor: '', pitch: '',
            width: '', height: '', length: '', size: '',
            price: '', carriage: '', currency: 'INR', indoor: true,
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

    const openBatchModal = (item) => {
        setSelectedItemForBatches(item);
        setShowBatchModal(true);
    };

    const getBatchBalances = (itemId) => {
        const itemTransactions = transactions.filter(t => t.itemId === itemId);
        const batchMap = {};
        itemTransactions.forEach(tx => {
            const batchName = tx.batch || 'Unbatched';
            const qty = tx.type === 'in' ? Number(tx.qty) : -Number(tx.qty);
            if (!batchMap[batchName]) batchMap[batchName] = 0;
            batchMap[batchName] += qty;
        });
        return Object.entries(batchMap)
            .map(([name, qty]) => ({ name, qty }))
            .filter(b => b.qty !== 0)
            .sort((a, b) => b.qty - a.qty);
    };

    const sortedItems = [...items].sort((a, b) => {
        const typeA = (a.type || '').toLowerCase();
        const typeB = (b.type || '').toLowerCase();
        if (typeA < typeB) return -1;
        if (typeA > typeB) return 1;
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
                    <button onClick={() => setShowForm(true)} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-teal-700 transition-colors">
                        <Plus size={16} /> Add New Component
                    </button>
                )}
            </div>

            {showForm && (
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 p-6 rounded-lg transition-colors border shadow-sm ${editingId ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                    <div className="col-span-2 md:col-span-4 flex justify-between items-center mb-2 pb-2 border-b border-slate-200 dark:border-slate-600">
                        <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400">{editingId ? 'Editing Item' : 'Add New Item'}</h3>
                        <button onClick={handleCancelEdit} className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1"><X size={14} /> Close</button>
                    </div>

                    {/* TYPE SELECTION */}
                    <div className="col-span-2 md:col-span-4 mb-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Component Type</label>
                        <select className="p-2 w-full border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}>
                            <optgroup label="Core Components">
                                <option value="module">LED Module</option>
                                <option value="cabinet">Cabinet</option>
                                <option value="ready">Ready Unit</option>
                                <option value="card">Receiving Card</option>
                                <option value="smps">SMPS (Power Supply)</option>
                                <option value="processor">Processor / Sender</option>
                            </optgroup>
                            <optgroup label="Cables & Fasteners">
                                <option value="frc_cable">FRC Cable</option>
                                <option value="power_cable">Power Cable</option>
                                <option value="screw">Screw</option>
                                <option value="bolt">Bolt</option>
                                <option value="gasket">Rubber Gasket</option>
                                <option value="tool">Tools</option>
                                <option value="accessory">Other Accessory</option>
                            </optgroup>
                        </select>
                    </div>

                    {/* BASIC FIELDS */}

                    {/* Brand: Label changes based on whether it is mandatory */}
                    <input
                        placeholder={isBrandMandatory(newItem.type) ? "Brand*" : "Brand (Optional)"}
                        className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        value={newItem.brand}
                        onChange={e => setNewItem({ ...newItem, brand: e.target.value })}
                    />

                    <input placeholder="Model / SKU*" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} />

                    <div className="flex gap-2 items-center col-span-2 md:col-span-1">
                        <div className="flex-1 min-w-[100px]"><input placeholder="Base Rate*" type="number" className="p-2 w-full border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} /></div>
                        <span className="text-slate-400 font-bold mb-3">+</span>
                        <div className="flex-1 min-w-[80px]"><input placeholder="Carriage" type="number" className="p-2 w-full border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.carriage} onChange={e => setNewItem({ ...newItem, carriage: e.target.value })} /></div>
                        <div className="flex-none mb-3"><select className="p-2 border rounded bg-slate-100 dark:bg-slate-600 dark:border-slate-600 dark:text-white" value={newItem.currency} onChange={e => setNewItem({ ...newItem, currency: e.target.value })}><option value="INR">INR</option><option value="USD">USD</option></select></div>
                    </div>
                    {/* Vendor is now Optional for everyone */}
                    <input placeholder="Vendor (Optional)" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.vendor} onChange={e => setNewItem({ ...newItem, vendor: e.target.value })} />

                    {/* --- CONDITIONAL FIELDS BASED ON NEW TYPES --- */}

                    {/* Cables */}
                    {['frc_cable', 'power_cable'].includes(newItem.type) && (
                        <>
                            <input placeholder="No. of Pins*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ports} onChange={e => setNewItem({ ...newItem, ports: e.target.value })} />
                            <input placeholder="Length (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.length} onChange={e => setNewItem({ ...newItem, length: e.target.value })} />
                        </>
                    )}

                    {/* Screws & Bolts */}
                    {['screw', 'bolt'].includes(newItem.type) && (
                        <>
                            <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })}>
                                <option value="">Select Type*</option>
                                <option value="SS">SS (Stainless Steel)</option>
                                <option value="MS">MS (Mild Steel)</option>
                            </select>
                            <input placeholder="Size (e.g. M3)*" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.size} onChange={e => setNewItem({ ...newItem, size: e.target.value })} />
                            <input placeholder="Length (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.length} onChange={e => setNewItem({ ...newItem, length: e.target.value })} />
                        </>
                    )}

                    {/* Gasket */}
                    {newItem.type === 'gasket' && (
                        <>
                            <input placeholder="Width (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                            <input placeholder="Length (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.length} onChange={e => setNewItem({ ...newItem, length: e.target.value })} />
                        </>
                    )}

                    {/* Tools */}
                    {newItem.type === 'tool' && (
                        <input placeholder="Tool Type (e.g. Drill)*" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
                    )}


                    {/* --- RESTORED CONDITIONAL FIELDS --- */}

                    {/* 1. Modules & Ready Units (Core Specs) */}
                    {(newItem.type === 'module' || newItem.type === 'ready') && (
                        <>
                            <input placeholder="Pitch (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white border-teal-500 ring-1 ring-teal-500" value={newItem.pitch} onChange={e => setNewItem({ ...newItem, pitch: e.target.value })} />
                            <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white border-teal-500 ring-1 ring-teal-500" value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                                <option value="true">Indoor</option>
                                <option value="false">Outdoor</option>
                            </select>

                            <input placeholder="LED Type (e.g. SMD2121)" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ledType} onChange={e => setNewItem({ ...newItem, ledType: e.target.value })} />
                            <input placeholder="Lamp Make" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.lampMake} onChange={e => setNewItem({ ...newItem, lampMake: e.target.value })} />

                            <input placeholder="Width (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                            <input placeholder="Height (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />

                            <input placeholder="Brightness (nits)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.brightness} onChange={e => setNewItem({ ...newItem, brightness: e.target.value })} />
                            <input placeholder="Refresh Rate (Hz)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.refreshRate} onChange={e => setNewItem({ ...newItem, refreshRate: e.target.value })} />

                            <input placeholder="Avg Power (W)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.avgPower} onChange={e => setNewItem({ ...newItem, avgPower: e.target.value })} />
                            <input placeholder="Max Power (W)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.maxPower} onChange={e => setNewItem({ ...newItem, maxPower: e.target.value })} />

                            <input placeholder="Contrast Ratio*" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.contrast} onChange={e => setNewItem({ ...newItem, contrast: e.target.value })} />
                            <input placeholder="Weight (kg)" type="number" step="0.01" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.weight} onChange={e => setNewItem({ ...newItem, weight: e.target.value })} />

                            <div className="flex gap-2 col-span-2 md:col-span-2">
                                <input placeholder="View Angle (H)*" className="flex-1 p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.viewAngleH} onChange={e => setNewItem({ ...newItem, viewAngleH: e.target.value })} />
                                <input placeholder="View Angle (V)*" className="flex-1 p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.viewAngleV} onChange={e => setNewItem({ ...newItem, viewAngleV: e.target.value })} />
                            </div>
                            <div className="flex gap-2 col-span-2 md:col-span-2">
                                <input placeholder="IP Rating (Front)*" className="flex-1 p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ipFront} onChange={e => setNewItem({ ...newItem, ipFront: e.target.value })} />
                                <input placeholder="IP Rating (Back)*" className="flex-1 p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ipBack} onChange={e => setNewItem({ ...newItem, ipBack: e.target.value })} />
                            </div>
                        </>
                    )}

                    {/* 2. Cabinets */}
                    {newItem.type === 'cabinet' && (
                        <>
                            <input placeholder="Material (e.g. Die-Cast)" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
                            <select className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                                <option value="true">Indoor</option>
                                <option value="false">Outdoor</option>
                            </select>
                            <input placeholder="Width (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                            <input placeholder="Height (mm)*" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />
                            <input placeholder="Weight (kg)" type="number" step="0.01" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.weight} onChange={e => setNewItem({ ...newItem, weight: e.target.value })} />
                        </>
                    )}

                    {/* 3. Electronics */}
                    {(newItem.type === 'card' || newItem.type === 'processor') && (
                        <input placeholder="Ports / Capacity" type="text" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.ports} onChange={e => setNewItem({ ...newItem, ports: e.target.value })} />
                    )}

                    {/* 4. Power */}
                    {newItem.type === 'smps' && (
                        <>
                            <input placeholder="Amps (A)" type="number" step="0.1" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.amps} onChange={e => setNewItem({ ...newItem, amps: e.target.value })} />
                            <input placeholder="Voltage (V)" type="number" className="p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value={newItem.voltage} onChange={e => setNewItem({ ...newItem, voltage: e.target.value })} />
                        </>
                    )}

                    <button onClick={handleSaveItem} className={`px-4 py-2 rounded text-white flex items-center justify-center gap-2 hover:opacity-90 transition ${editingId ? 'bg-amber-600' : 'bg-teal-600'} col-span-2 md:col-span-4`}>
                        {editingId ? <Edit size={16} /> : <Plus size={16} />} {editingId ? 'Update Item' : 'Add Item'}
                    </button>
                </div>
            )}

            <div className="mt-6">
                {/* 1. Mobile Card View */}
                <div className="md:hidden space-y-4">
                    {sortedItems.map(item => {
                        const stock = transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0);
                        const isCore = ['module', 'cabinet', 'card', 'smps', 'processor'].includes(item.type);

                        return (
                            <div key={item.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-lg text-[10px] font-bold uppercase tracking-wider ${isCore ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{item.type.replace('_', ' ')}</div>
                                <div className="pr-16 mb-3"><h3 className="font-bold text-slate-800 dark:text-white text-lg">{item.brand} {item.model}</h3>{item.vendor && <div className="text-xs text-teal-600 font-medium">{item.vendor}</div>}</div>
                                <div className="grid grid-cols-2 gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                                    <div>
                                        <span className="block text-[10px] uppercase font-bold text-slate-400">Specs</span>
                                        {item.type === 'module' ? <span>P{item.pitch} {item.indoor ? 'In' : 'Out'}</span> :
                                            ['frc_cable', 'power_cable'].includes(item.type) ? <span>{item.ports} pins • {item.length}mm</span> :
                                                ['screw', 'bolt'].includes(item.type) ? <span>{item.material} • {item.size} • {item.length}mm</span> :
                                                    <span>{item.width ? `${item.width}x${item.height || item.length}` : 'Standard'}</span>}
                                    </div>
                                    <div><span className="block text-[10px] uppercase font-bold text-slate-400">Stock</span><span className={`font-bold text-sm ${stock < 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>{stock}</span></div>

                                    {!readOnly && (
                                        <div className="border-t border-slate-200 dark:border-slate-600 pt-2 mt-1 col-span-2">
                                            <span className="block text-[10px] uppercase font-bold text-slate-400">Landed Cost</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency((item.price || 0) + (item.carriage || 0), item.currency || 'INR', false, true)}</span>
                                        </div>
                                    )}
                                    {!readOnly && (
                                        <div className="col-span-2 border-t border-slate-200 dark:border-slate-600 pt-2 mt-1 text-right">
                                            <span className="block text-[10px] uppercase font-bold text-slate-400">Stock Value (₹)</span>
                                            <span className="font-bold text-teal-600 dark:text-teal-400">{formatCurrency(item.currency === 'USD' ? ((item.price || 0) + (item.carriage || 0)) * stock * exchangeRate : ((item.price || 0) + (item.carriage || 0)) * stock, 'INR', false, true)}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {item.type === 'module' && <button onClick={() => openBatchModal(item)} className="flex-1 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg text-xs font-bold flex justify-center items-center gap-2 hover:bg-purple-100 transition-colors"><Layers size={14} /> Batches</button>}
                                    {!readOnly && <><button onClick={() => handleEdit(item)} className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold flex justify-center items-center gap-2 hover:bg-slate-200 transition-colors"><Edit size={14} /> Edit</button><button onClick={() => handleDelete(item.id)} className="flex-1 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold flex justify-center items-center gap-2 hover:bg-red-100 transition-colors"><Trash2 size={14} /> Delete</button></>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 2. Desktop Table View */}
                <div className="hidden md:block overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                            <tr>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Component</th>
                                <th className="px-4 py-3">Specs</th>
                                <th className="px-4 py-3 text-center">Stock</th>
                                {!readOnly && <th className="px-4 py-3">Landed Cost</th>}
                                {!readOnly && <th className="px-4 py-3 text-right">Stock Value (₹)</th>}
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {sortedItems.map(item => {
                                const stock = transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0);
                                const landedCost = (item.price || 0) + (item.carriage || 0);
                                const isCore = ['module', 'cabinet', 'card', 'smps', 'processor'].includes(item.type);

                                return (
                                    <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${editingId === item.id ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                                        <td className="px-4 py-3 capitalize"><span className={`px-2 py-1 rounded-full text-xs capitalize ${isCore ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'}`}>{item.type.replace('_', ' ')}</span></td>
                                        <td className="px-4 py-3 dark:text-slate-200"><div className="font-medium">{item.brand} {item.model}</div>{item.vendor && <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">{item.vendor}</div>}</td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                                            {item.type === 'module' ? `P${item.pitch} ${item.width}x${item.height}` :
                                                ['frc_cable', 'power_cable'].includes(item.type) ? `${item.ports} pins, ${item.length}mm` :
                                                    ['screw', 'bolt'].includes(item.type) ? `${item.material} ${item.size} x ${item.length}mm` :
                                                        item.width ? `${item.width}x${item.height || item.length}` : '-'}
                                        </td>
                                        <td className="px-4 py-3 font-bold dark:text-slate-200 text-teal-600 text-center">{stock}</td>

                                        {!readOnly && (
                                            <td className="px-4 py-3 dark:text-slate-200">
                                                <div className="flex flex-col"><span className="font-semibold">{formatCurrency(landedCost, item.currency || 'INR', false, true)}</span></div>
                                            </td>
                                        )}
                                        {!readOnly && (
                                            <td className="px-4 py-3 font-bold text-right text-teal-600 dark:text-teal-400">
                                                {formatCurrency(item.currency === 'USD' ? landedCost * stock * exchangeRate : landedCost * stock, 'INR', false, true)}
                                            </td>
                                        )}

                                        <td className="px-4 py-3 flex gap-2 justify-end">
                                            {item.type === 'module' && <button onClick={() => openBatchModal(item)} className="text-purple-500 hover:text-purple-700 p-1 bg-purple-50 dark:bg-purple-900/30 rounded"><Layers size={14} /></button>}
                                            {!readOnly && <><button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 p-1 bg-blue-50 dark:bg-blue-900/30 rounded"><Edit size={14} /></button><button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 dark:bg-red-900/30 rounded"><Trash2 size={14} /></button></>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {items.length === 0 && !loading && <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-800">No items found.</div>}
            </div>
            {/* Batch Modal */}
            {showBatchModal && selectedItemForBatches && (
                <div className="fixed inset-0 z-50 bg-black/80 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <div><h3 className="font-bold text-slate-800 dark:text-white">Batch Management</h3><p className="text-xs text-slate-500">{selectedItemForBatches.brand} {selectedItemForBatches.model}</p></div>
                            <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <div className="p-6">
                            <div className="mb-4 text-xs text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-100 dark:border-blue-800">ℹ️ To add stock or new batches, please use the <b>Stock Ledger</b> tab. This list shows current calculated balances.</div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800 p-2 text-xs font-bold text-slate-500 uppercase"><div>Batch No</div><div className="text-right">Current Balance</div></div>
                                <div className="max-h-60 overflow-y-auto">
                                    {getBatchBalances(selectedItemForBatches.id).map((batch, idx) => (
                                        <div key={idx} className="grid grid-cols-2 p-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0 text-sm items-center"><div className="font-medium text-slate-700 dark:text-slate-200">{batch.name}</div><div className="text-right font-bold text-slate-900 dark:text-white">{batch.qty}</div></div>
                                    ))}
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