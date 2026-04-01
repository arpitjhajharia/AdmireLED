import React from 'react';
import { Box, Edit, Plus, Trash2, X, Layers, Search, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, formatComponentSpecs } from '../lib/utils';

const InventoryManager = ({ user, transactions = [], readOnly = false, exchangeRate = 1 }) => {
    const [items, setItems] = React.useState([]);
    const [editingId, setEditingId] = React.useState(null);
    const [showForm, setShowForm] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterType, setFilterType] = React.useState('all');

    // Default State
    const [newItem, setNewItem] = React.useState({
        type: 'module', brand: '', series: '', model: '', vendor: '', pitch: '',
        width: '', height: '', length: '', size: '',
        price: '', carriage: '', currency: 'INR', indoor: true,
        brightness: '', refreshRate: '',
        ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
        contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: '',
        warrantyPeriod: '', maintenance: ''
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
                !newItem.ipFront || !newItem.ipBack ||
                (newItem.type === 'ready' && !newItem.material)) {
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
                warrantyPeriod: newItem.warrantyPeriod ? Number(newItem.warrantyPeriod) : 0,
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
                    brand: '', series: '', model: '', vendor: '', pitch: '',
                    width: '', height: '', length: '', size: '',
                    price: '', carriage: '', currency: 'INR', indoor: true,
                    brightness: '', refreshRate: '',
                    ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
                    contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: '',
                    warrantyPeriod: '', maintenance: ''
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
            brand: item.brand || '',
            series: item.series || '',
            warrantyPeriod: item.warrantyPeriod || ''
        });
        setEditingId(item.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setShowForm(false);
        setNewItem({
            type: 'module', brand: '', series: '', model: '', vendor: '', pitch: '',
            width: '', height: '', length: '', size: '',
            price: '', carriage: '', currency: 'INR', indoor: true,
            brightness: '', refreshRate: '',
            ledType: '', lampMake: '', material: '', weight: '', avgPower: '', maxPower: '',
            contrast: '', viewAngleH: '', viewAngleV: '', ipFront: '', ipBack: '', ports: '', amps: '', voltage: '',
            warrantyPeriod: '', maintenance: ''
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

    // Get unique types for the filter
    const uniqueTypes = [...new Set(items.map(i => i.type))].sort();

    // Apply search + type filter
    const filteredItems = sortedItems.filter(item => {
        const matchesSearch = !searchTerm.trim() ||
            `${item.brand} ${item.model} ${item.vendor || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || item.type === filterType;
        return matchesSearch && matchesType;
    });

    // Shared input class
    const inputCls = "px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-500 transition-shadow";

    return (
        <div className="p-3 md:p-4">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-sm">
                        <Box className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Components
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {items.length} {items.length === 1 ? 'item' : 'items'} total
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 placeholder:text-slate-400 transition-shadow"
                        />
                    </div>

                    {/* Type filter */}
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="py-2 px-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                        <option value="all">All Types</option>
                        {uniqueTypes.map(t => (
                            <option key={t} value={t}>{t.replace('_', ' ')}</option>
                        ))}
                    </select>

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
            {showForm && (
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-4 rounded-xl transition-colors border shadow-sm ${editingId ? 'bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                    <div className="col-span-2 md:col-span-4 flex justify-between items-center mb-1 pb-1.5 border-b border-slate-200 dark:border-slate-600">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{editingId ? '✏️ Editing Item' : '➕ Add New Item'}</h3>
                        <button onClick={handleCancelEdit} className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"><X size={14} /> Close</button>
                    </div>

                    {/* TYPE SELECTION */}
                    <div className="col-span-2 md:col-span-4 mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Component Type</label>
                        <select className={inputCls + " w-full"} value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}>
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
                    <input
                        placeholder={isBrandMandatory(newItem.type) ? "Brand*" : "Brand (Optional)"}
                        className={inputCls}
                        value={newItem.brand}
                        onChange={e => setNewItem({ ...newItem, brand: e.target.value })}
                    />

                    <input placeholder="Model / SKU*" className={inputCls} value={newItem.model} onChange={e => setNewItem({ ...newItem, model: e.target.value })} />

                    <div className="flex gap-1.5 items-center col-span-2 md:col-span-1">
                        <div className="flex-1 min-w-[80px]"><input placeholder="Base Rate*" type="number" className={inputCls + " w-full"} value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} /></div>
                        <span className="text-slate-400 font-bold text-xs">+</span>
                        <div className="flex-1 min-w-[60px]"><input placeholder="Carriage" type="number" className={inputCls + " w-full"} value={newItem.carriage} onChange={e => setNewItem({ ...newItem, carriage: e.target.value })} /></div>
                        <div className="flex-none"><select className={inputCls + " bg-slate-50 dark:bg-slate-600"} value={newItem.currency} onChange={e => setNewItem({ ...newItem, currency: e.target.value })}><option value="INR">INR</option><option value="USD">USD</option></select></div>
                    </div>
                    <input placeholder="Vendor (Optional)" className={inputCls} value={newItem.vendor} onChange={e => setNewItem({ ...newItem, vendor: e.target.value })} />

                    {/* --- CONDITIONAL FIELDS BASED ON NEW TYPES --- */}

                    {/* Cables */}
                    {['frc_cable', 'power_cable'].includes(newItem.type) && (
                        <>
                            <input placeholder="No. of Pins*" type="number" className={inputCls} value={newItem.ports} onChange={e => setNewItem({ ...newItem, ports: e.target.value })} />
                            <input placeholder="Length (mm)*" type="number" className={inputCls} value={newItem.length} onChange={e => setNewItem({ ...newItem, length: e.target.value })} />
                        </>
                    )}

                    {/* Screws & Bolts */}
                    {['screw', 'bolt'].includes(newItem.type) && (
                        <>
                            <select className={inputCls} value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })}>
                                <option value="">Select Type*</option>
                                <option value="SS">SS (Stainless Steel)</option>
                                <option value="MS">MS (Mild Steel)</option>
                            </select>
                            <input placeholder="Size (e.g. M3)*" className={inputCls} value={newItem.size} onChange={e => setNewItem({ ...newItem, size: e.target.value })} />
                            <input placeholder="Length (mm)*" type="number" className={inputCls} value={newItem.length} onChange={e => setNewItem({ ...newItem, length: e.target.value })} />
                        </>
                    )}

                    {/* Gasket */}
                    {newItem.type === 'gasket' && (
                        <>
                            <input placeholder="Width (mm)*" type="number" className={inputCls} value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                            <input placeholder="Length (mm)*" type="number" className={inputCls} value={newItem.length} onChange={e => setNewItem({ ...newItem, length: e.target.value })} />
                        </>
                    )}

                    {/* Tools */}
                    {newItem.type === 'tool' && (
                        <input placeholder="Tool Type (e.g. Drill)*" className={inputCls} value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
                    )}


                    {/* --- RESTORED CONDITIONAL FIELDS --- */}

                    {/* 1. Modules & Ready Units (Core Specs) */}
                    {(newItem.type === 'module' || newItem.type === 'ready') && (
                        <>
                            <input placeholder="Series (Optional)" className={inputCls} value={newItem.series} onChange={e => setNewItem({ ...newItem, series: e.target.value })} />
                            {newItem.type === 'ready' && (
                                <input placeholder="Cabinet Material (e.g. Die-Cast)*" className={inputCls} value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
                            )}
                            <input placeholder="Pitch (mm)*" type="number" className={inputCls + " border-teal-500 ring-1 ring-teal-500"} value={newItem.pitch} onChange={e => setNewItem({ ...newItem, pitch: e.target.value })} />
                            <select className={inputCls + " border-teal-500 ring-1 ring-teal-500"} value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                                <option value="true">Indoor</option>
                                <option value="false">Outdoor</option>
                            </select>

                            <input placeholder="LED Type (e.g. SMD2121)" className={inputCls} value={newItem.ledType} onChange={e => setNewItem({ ...newItem, ledType: e.target.value })} />
                            <input placeholder="Lamp Make" className={inputCls} value={newItem.lampMake} onChange={e => setNewItem({ ...newItem, lampMake: e.target.value })} />

                            <input placeholder="Width (mm)*" type="number" className={inputCls} value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                            <input placeholder="Height (mm)*" type="number" className={inputCls} value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />

                            <input placeholder="Brightness (nits)*" type="number" className={inputCls} value={newItem.brightness} onChange={e => setNewItem({ ...newItem, brightness: e.target.value })} />
                            <input placeholder="Refresh Rate (Hz)*" type="number" className={inputCls} value={newItem.refreshRate} onChange={e => setNewItem({ ...newItem, refreshRate: e.target.value })} />

                            <input placeholder="Avg Power (W)*" type="number" className={inputCls} value={newItem.avgPower} onChange={e => setNewItem({ ...newItem, avgPower: e.target.value })} />
                            <input placeholder="Max Power (W)*" type="number" className={inputCls} value={newItem.maxPower} onChange={e => setNewItem({ ...newItem, maxPower: e.target.value })} />

                            <input placeholder="Contrast Ratio*" className={inputCls} value={newItem.contrast} onChange={e => setNewItem({ ...newItem, contrast: e.target.value })} />
                            <input placeholder="Weight (kg)" type="number" step="0.01" className={inputCls} value={newItem.weight} onChange={e => setNewItem({ ...newItem, weight: e.target.value })} />

                            <div className="flex gap-1.5 col-span-2 md:col-span-2">
                                <input placeholder="View Angle (H)*" className={inputCls + " flex-1"} value={newItem.viewAngleH} onChange={e => setNewItem({ ...newItem, viewAngleH: e.target.value })} />
                                <input placeholder="View Angle (V)*" className={inputCls + " flex-1"} value={newItem.viewAngleV} onChange={e => setNewItem({ ...newItem, viewAngleV: e.target.value })} />
                            </div>
                            <div className="flex gap-1.5 col-span-2 md:col-span-2">
                                <input placeholder="IP Rating (Front)*" className={inputCls + " flex-1"} value={newItem.ipFront} onChange={e => setNewItem({ ...newItem, ipFront: e.target.value })} />
                                <input placeholder="IP Rating (Back)*" className={inputCls + " flex-1"} value={newItem.ipBack} onChange={e => setNewItem({ ...newItem, ipBack: e.target.value })} />
                            </div>
                            <input placeholder="Warranty (Years)*" type="number" className={inputCls + " border-blue-400"} value={newItem.warrantyPeriod} onChange={e => setNewItem({ ...newItem, warrantyPeriod: e.target.value })} />
                            <select className={inputCls} value={newItem.maintenance} onChange={e => setNewItem({ ...newItem, maintenance: e.target.value })}>
                                <option value="">Maintenance Access</option>
                                <option value="Rear">Rear</option>
                                <option value="Front">Front</option>
                                <option value="Front & Rear">Front & Rear</option>
                            </select>
                        </>
                    )}

                    {/* 2. Cabinets */}
                    {newItem.type === 'cabinet' && (
                        <>
                            <input placeholder="Material (e.g. Die-Cast)" className={inputCls} value={newItem.material} onChange={e => setNewItem({ ...newItem, material: e.target.value })} />
                            <select className={inputCls} value={newItem.indoor} onChange={e => setNewItem({ ...newItem, indoor: e.target.value })}>
                                <option value="true">Indoor</option>
                                <option value="false">Outdoor</option>
                            </select>
                            <input placeholder="Width (mm)*" type="number" className={inputCls} value={newItem.width} onChange={e => setNewItem({ ...newItem, width: e.target.value })} />
                            <input placeholder="Height (mm)*" type="number" className={inputCls} value={newItem.height} onChange={e => setNewItem({ ...newItem, height: e.target.value })} />
                            <input placeholder="Weight (kg)" type="number" step="0.01" className={inputCls} value={newItem.weight} onChange={e => setNewItem({ ...newItem, weight: e.target.value })} />
                        </>
                    )}

                    {/* 3. Electronics */}
                    {(newItem.type === 'card' || newItem.type === 'processor') && (
                        <input placeholder="Ports / Capacity" type="text" className={inputCls} value={newItem.ports} onChange={e => setNewItem({ ...newItem, ports: e.target.value })} />
                    )}

                    {/* 4. Power */}
                    {newItem.type === 'smps' && (
                        <>
                            <input placeholder="Amps (A)" type="number" step="0.1" className={inputCls} value={newItem.amps} onChange={e => setNewItem({ ...newItem, amps: e.target.value })} />
                            <input placeholder="Voltage (V)" type="number" className={inputCls} value={newItem.voltage} onChange={e => setNewItem({ ...newItem, voltage: e.target.value })} />
                        </>
                    )}

                    <button onClick={handleSaveItem} className={`px-3 py-2 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition ${editingId ? 'bg-amber-600' : 'bg-slate-800 dark:bg-slate-600'} col-span-2 md:col-span-4`}>
                        {editingId ? <Edit size={15} /> : <Plus size={15} />} {editingId ? 'Update Item' : 'Add Item'}
                    </button>
                </div>
            )}

            {/* ── Inventory Table ── */}
            <div>
                {/* Mobile: compact list rows */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    {filteredItems.map(item => {
                        const stock = transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0);
                        const landedCost = (item.price || 0) + (item.carriage || 0);
                        const isCore = ['module', 'cabinet', 'card', 'smps', 'processor'].includes(item.type);
                        const specs = formatComponentSpecs(item);

                        return (
                            <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 active:bg-slate-50 dark:active:bg-slate-700/60 transition-colors">

                                {/* Left: type chip + name + specs */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className={`flex-shrink-0 text-[8px] font-bold uppercase px-1 py-px rounded tracking-wide ${isCore ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60' : 'bg-purple-50 text-purple-600 ring-1 ring-purple-200/60'}`}>
                                            {item.type.replace('_', ' ')}
                                        </span>
                                        <span className="text-[12px] font-semibold text-slate-800 dark:text-white truncate">
                                            {item.brand} {item.model}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] text-slate-400">
                                        {specs.map((spec, i) => (
                                            <React.Fragment key={i}>
                                                <span>{spec}</span>
                                                {i < specs.length - 1 && <span className="opacity-30">·</span>}
                                            </React.Fragment>
                                        ))}
                                        {item.vendor && (
                                            <>
                                                <span className="opacity-30">|</span>
                                                <span className="text-teal-500 truncate">{item.vendor}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Centre: stock + cost */}
                                <div className="flex-shrink-0 text-right">
                                    <div className={`text-sm font-bold tabular-nums leading-tight ${stock < 0 ? 'text-red-500' : stock === 0 ? 'text-slate-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {stock}
                                    </div>
                                    {!readOnly && (
                                        <div className="text-[9px] text-slate-400 tabular-nums">
                                            {formatCurrency(landedCost, item.currency || 'INR', false, true)}
                                        </div>
                                    )}
                                </div>

                                {/* Right: icon-only actions */}
                                <div className="flex-shrink-0 flex items-center gap-0.5">
                                    {item.type === 'module' && (
                                        <button onClick={() => openBatchModal(item)} className="w-7 h-7 flex items-center justify-center rounded-full text-purple-400 active:bg-purple-50" title="Batches">
                                            <Layers size={13} />
                                        </button>
                                    )}
                                    {!readOnly && (
                                        <>
                                            <button onClick={() => handleEdit(item)} className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 active:bg-blue-50 active:text-blue-600" title="Edit">
                                                <Edit size={13} />
                                            </button>
                                            <button onClick={() => handleDelete(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full text-slate-300 active:bg-red-50 active:text-red-500" title="Delete">
                                                <Trash2 size={13} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <table className="min-w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700">
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Type</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Component</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Specs</th>
                                <th scope="col" className="px-3 py-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Stock</th>
                                {!readOnly && <th scope="col" className="px-3 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Landed Cost</th>}
                                {!readOnly && <th scope="col" className="px-3 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Stock Value (₹)</th>}
                                <th scope="col" className="px-2 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {filteredItems.map((item, rowIdx) => {
                                const stock = transactions.filter(t => t.itemId === item.id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0);
                                const landedCost = (item.price || 0) + (item.carriage || 0);
                                const isCore = ['module', 'cabinet', 'card', 'smps', 'processor'].includes(item.type);
                                const specs = formatComponentSpecs(item);

                                return (
                                    <tr key={item.id} className={`group transition-colors duration-100 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50'} hover:bg-blue-50/50 dark:hover:bg-slate-700/60 ${editingId === item.id ? 'bg-amber-50/60 dark:bg-amber-900/20' : ''}`}>
                                        <td className="px-3 py-1 whitespace-nowrap text-left">
                                            <span className={`inline-block px-1 py-px rounded text-[8px] font-bold uppercase tracking-widest ${isCore ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60' : 'bg-purple-50 text-purple-600 ring-1 ring-purple-200/60'}`}>
                                                {item.type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1 max-w-[200px]">
                                            <div className="flex flex-col truncate">
                                                <span className="text-[12px] font-semibold text-slate-800 dark:text-white truncate" title={`${item.brand} ${item.model}`}>
                                                    {item.brand} {item.model}
                                                </span>
                                                {item.vendor && (
                                                    <span className="text-[10px] text-teal-600 dark:text-teal-400/80 font-medium truncate" title={item.vendor}>
                                                        {item.vendor}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-1 max-w-[250px]">
                                            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 max-h-[40px] overflow-y-auto scrollbar-hide">
                                                {specs.map((spec, i) => (
                                                    <span key={i} className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-slate-700/50 px-1 py-px rounded border border-slate-200 dark:border-slate-600/50">
                                                        {spec}
                                                    </span>
                                                ))}
                                                {specs.length === 0 && <span className="text-[10px] text-slate-300">-</span>}
                                            </div>
                                        </td>
                                        <td className={`px-3 py-1 whitespace-nowrap text-center ${stock < 0 ? 'text-red-500' : stock === 0 ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                            <span className="text-[13px] font-extrabold tabular-nums tracking-tight">
                                                {stock}
                                            </span>
                                        </td>

                                        {!readOnly && (
                                            <td className="px-3 py-1 whitespace-nowrap text-right">
                                                <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {formatCurrency(landedCost, item.currency || 'INR', false, true)}
                                                </span>
                                            </td>
                                        )}
                                        {!readOnly && (
                                            <td className="px-3 py-1 whitespace-nowrap text-right">
                                                <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-200">
                                                    {formatCurrency(item.currency === 'USD' ? landedCost * stock * exchangeRate : landedCost * stock, 'INR', false, true)}
                                                </span>
                                            </td>
                                        )}

                                        <td className="px-2 py-1 whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-0">
                                                {item.type === 'module' && (
                                                    <button onClick={() => openBatchModal(item)} className="w-6 h-6 rounded flex items-center justify-center text-purple-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors" title="Batches">
                                                        <Layers size={12} />
                                                    </button>
                                                )}
                                                {!readOnly && <>
                                                    <button onClick={() => handleEdit(item)} className="w-6 h-6 rounded flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit">
                                                        <Edit size={12} />
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id)} className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Empty state */}
                {filteredItems.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-10 text-center bg-white dark:bg-slate-800 rounded-b-xl border-t border-slate-100 dark:border-slate-700">
                        <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-[12px] font-medium text-slate-400 uppercase tracking-widest">{searchTerm || filterType !== 'all' ? 'No matching components' : 'No components yet'}</p>
                        <p className="text-[10px] mt-1 text-slate-400">
                            {searchTerm || filterType !== 'all'
                                ? 'Try adjusting your search or filter.'
                                : 'Add your first component to get started.'
                            }
                        </p>
                    </div>
                )}
            </div>

            {/* ── Batch Modal ── */}
            {showBatchModal && selectedItemForBatches && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <div><h3 className="font-bold text-sm text-slate-800 dark:text-white">Batch Management</h3><p className="text-xs text-slate-500">{selectedItemForBatches.brand} {selectedItemForBatches.model}</p></div>
                            <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
                        </div>
                        <div className="p-4">
                            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 p-2.5 rounded-lg border border-blue-100 dark:border-blue-800">ℹ️ To add stock or new batches, please use the <b>Stock Ledger</b> tab. This list shows current calculated balances.</div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><div>Batch No</div><div className="text-right">Current Balance</div></div>
                                <div className="max-h-60 overflow-y-auto">
                                    {getBatchBalances(selectedItemForBatches.id).map((batch, idx) => (
                                        <div key={idx} className="grid grid-cols-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0 text-sm items-center"><div className="font-medium text-slate-700 dark:text-slate-200">{batch.name}</div><div className="text-right font-bold text-slate-900 dark:text-white tabular-nums">{batch.qty}</div></div>
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