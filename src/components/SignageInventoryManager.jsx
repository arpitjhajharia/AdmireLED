import React from 'react';
import { Box, Edit, Plus, Trash2, X, Search, Package, Save, RefreshCw } from 'lucide-react';
import { db, appId } from '../lib/firebase';

const SignageInventoryManager = ({ user, readOnly = false }) => {
    const [items, setItems] = React.useState([]);
    const [editingId, setEditingId] = React.useState(null);
    const [showForm, setShowForm] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterType, setFilterType] = React.useState('all');
    const [loading, setLoading] = React.useState(true);

    const initialItemState = {
        type: 'profile',
        name: '',
        sku: '',
        // Profile fields
        weightPerM: '',
        ratePerKg: '',
        // Substrate fields
        subType: 'acp', // acp vs acrylic
        thickness: '',
        rateSft: '', // for ACP
        // LED fields
        ledType: 'module', // module vs strip
        watts: '',
        spacingCC: '', // or spread
        // SMPS fields
        wattage: '',
        // Common rate field for LED, SMPS, Hardware
        rate: '',
    };

    const [newItem, setNewItem] = React.useState(initialItemState);

    React.useEffect(() => {
        if (!user || !db) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public')
            .doc('data').collection('signage_inventory')
            .onSnapshot(snap => {
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setItems(data);
                setLoading(false);
            }, err => console.error(err));
        return () => unsub();
    }, [user]);

    const handleSaveItem = async () => {
        if (!newItem.name) return alert("Name is required.");

        try {
            const collectionRef = db.collection('artifacts').doc(appId).collection('public')
                .doc('data').collection('signage_inventory');

            const itemData = {
                ...newItem,
                updatedAt: new Date()
            };

            // Numeric conversions
            if (itemData.weightPerM) itemData.weightPerM = Number(itemData.weightPerM);
            if (itemData.ratePerKg) itemData.ratePerKg = Number(itemData.ratePerKg);
            if (itemData.thickness) itemData.thickness = Number(itemData.thickness);
            if (itemData.rateSft) itemData.rateSft = Number(itemData.rateSft);
            if (itemData.watts) itemData.watts = Number(itemData.watts);
            if (itemData.spacingCC) itemData.spacingCC = Number(itemData.spacingCC);
            if (itemData.rate) itemData.rate = Number(itemData.rate);
            if (itemData.wattage) itemData.wattage = Number(itemData.wattage);

            if (editingId) {
                await collectionRef.doc(editingId).update(itemData);
                setEditingId(null);
                setShowForm(false);
                setNewItem(initialItemState);
                alert("Item Updated!");
            } else {
                await collectionRef.add({ ...itemData, createdAt: new Date() });
                setNewItem({ ...initialItemState, type: newItem.type });
                alert("Item Added!");
            }
        } catch (e) {
            console.error(e);
            alert("Error saving item: " + e.message);
        }
    };

    const handleEdit = (item) => {
        setNewItem({ ...item });
        setEditingId(item.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (confirm("Delete this item?")) {
            await db.collection('artifacts').doc(appId).collection('public')
                .doc('data').collection('signage_inventory').doc(id).delete();
        }
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = !searchTerm.trim() ||
            `${item.name} ${item.sku || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || item.type === filterType;
        return matchesSearch && matchesType;
    }).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    const inputCls = "px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-500 transition-shadow w-full";
    const labelCls = "text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1";

    return (
        <div className="p-3 md:p-4 animate-in fade-in duration-500">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                        <Box className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Signage Inventory
                        </h2>
                        <p className="text-[11px] font-semibold text-slate-400 mt-1.5 tracking-wide uppercase flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
                            {items.length} items registered
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search signage items..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 placeholder:text-slate-400 transition-all"
                        />
                    </div>

                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="py-2.5 px-3 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 text-slate-600 dark:text-slate-300 cursor-pointer transition-all"
                    >
                        <option value="all">All Types</option>
                        <option value="profile">Profiles</option>
                        <option value="substrate">Substrates</option>
                        <option value="led">LEDs</option>
                        <option value="smps">SMPS</option>
                        <option value="hardware">Hardware</option>
                    </select>

                    {!showForm && !readOnly && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100 dark:shadow-none active:scale-95"
                        >
                            <Plus size={18} /> Add Item
                        </button>
                    )}
                </div>
            </div>

            {/* ── Form Section ── */}
            {showForm && (
                <div className={`mb-8 p-6 rounded-2xl border transition-all duration-300 shadow-sm ${editingId ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-3">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${editingId ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                {editingId ? <Edit size={16} /> : <Plus size={16} />}
                            </div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                {editingId ? 'Edit Signage Item' : 'Create New Signage Item'}
                            </h3>
                        </div>
                        <button
                            onClick={() => { setShowForm(false); setEditingId(null); setNewItem(initialItemState); }}
                            className="text-xs font-bold text-slate-400 hover:text-red-500 flex items-center gap-1.5 transition-colors uppercase tracking-tight"
                        >
                            <X size={16} /> Cancel
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <label className={labelCls}>Item Category</label>
                            <select className={inputCls} value={newItem.type} onChange={e => setNewItem({ ...newItem, type: e.target.value })}>
                                <option value="profile">Profile (Frame)</option>
                                <option value="substrate">Substrate (Face)</option>
                                <option value="led">LED (Illumination)</option>
                                <option value="smps">SMPS (Power)</option>
                                <option value="hardware">Hardware / Accessory</option>
                            </select>
                        </div>

                        <div>
                            <label className={labelCls}>Name / Description</label>
                            <input
                                placeholder="Enter item name..."
                                className={inputCls}
                                value={newItem.name}
                                onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className={labelCls}>SKU / Model No.</label>
                            <input
                                placeholder="Enter SKU..."
                                className={inputCls}
                                value={newItem.sku}
                                onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                            />
                        </div>

                        <div className="md:col-start-1 grid grid-cols-2 md:grid-cols-4 col-span-1 md:col-span-4 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                            {newItem.type === 'profile' && (
                                <>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Weight (kg/m)</label>
                                        <input type="number" step="0.001" placeholder="0.000" className={inputCls} value={newItem.weightPerM} onChange={e => setNewItem({ ...newItem, weightPerM: e.target.value })} />
                                    </div>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Rate (₹/kg)</label>
                                        <input type="number" placeholder="0" className={inputCls} value={newItem.ratePerKg} onChange={e => setNewItem({ ...newItem, ratePerKg: e.target.value })} />
                                    </div>
                                </>
                            )}

                            {newItem.type === 'substrate' && (
                                <>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Substrate Type</label>
                                        <select className={inputCls} value={newItem.subType} onChange={e => setNewItem({ ...newItem, subType: e.target.value })}>
                                            <option value="acp">ACP (Aluminum Composite)</option>
                                            <option value="acrylic">Acrylic (Perspex)</option>
                                        </select>
                                    </div>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Thickness (mm)</label>
                                        <input type="number" step="0.1" placeholder="0.0" className={inputCls} value={newItem.thickness} onChange={e => setNewItem({ ...newItem, thickness: e.target.value })} />
                                    </div>
                                    {newItem.subType === 'acp' ? (
                                        <div className="col-span-1">
                                            <label className={labelCls}>Rate (₹/sqft)</label>
                                            <input type="number" placeholder="0" className={inputCls} value={newItem.rateSft} onChange={e => setNewItem({ ...newItem, rateSft: e.target.value })} />
                                        </div>
                                    ) : (
                                        <div className="col-span-1">
                                            <label className={labelCls}>Rate (₹/kg)</label>
                                            <input type="number" placeholder="0" className={inputCls} value={newItem.ratePerKg} onChange={e => setNewItem({ ...newItem, ratePerKg: e.target.value })} />
                                        </div>
                                    )}
                                </>
                            )}

                            {newItem.type === 'led' && (
                                <>
                                    <div className="col-span-1">
                                        <label className={labelCls}>LED Form Factor</label>
                                        <select className={inputCls} value={newItem.ledType} onChange={e => setNewItem({ ...newItem, ledType: e.target.value })}>
                                            <option value="module">Module (Injection)</option>
                                            <option value="strip">Strip (Roll)</option>
                                        </select>
                                    </div>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Watts (per pc/m)</label>
                                        <input type="number" step="0.01" placeholder="0.00" className={inputCls} value={newItem.watts} onChange={e => setNewItem({ ...newItem, watts: e.target.value })} />
                                    </div>
                                    <div className="col-span-1">
                                        <label className={labelCls}>
                                            {newItem.ledType === 'module' ? 'Spacing CC (mm)' : 'Light Spread (mm)'}
                                        </label>
                                        <input type="number" placeholder="0" className={inputCls} value={newItem.spacingCC} onChange={e => setNewItem({ ...newItem, spacingCC: e.target.value })} />
                                    </div>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Unit Rate (₹)</label>
                                        <input type="number" placeholder="0" className={inputCls} value={newItem.rate} onChange={e => setNewItem({ ...newItem, rate: e.target.value })} />
                                    </div>
                                </>
                            )}

                            {newItem.type === 'smps' && (
                                <>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Capacity (Watts)</label>
                                        <input type="number" placeholder="0" className={inputCls} value={newItem.wattage} onChange={e => setNewItem({ ...newItem, wattage: e.target.value })} />
                                    </div>
                                    <div className="col-span-1">
                                        <label className={labelCls}>Unit Rate (₹)</label>
                                        <input type="number" placeholder="0" className={inputCls} value={newItem.rate} onChange={e => setNewItem({ ...newItem, rate: e.target.value })} />
                                    </div>
                                </>
                            )}

                            {newItem.type === 'hardware' && (
                                <div className="col-span-1">
                                    <label className={labelCls}>Unit Rate (₹)</label>
                                    <input type="number" placeholder="0" className={inputCls} value={newItem.rate} onChange={e => setNewItem({ ...newItem, rate: e.target.value })} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button
                            onClick={handleSaveItem}
                            className={`px-8 py-3 rounded-xl text-white text-sm font-extrabold flex items-center gap-2.5 transition-all shadow-lg active:scale-95 ${editingId ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200 dark:shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none'}`}
                        >
                            {editingId ? <RefreshCw size={18} /> : <Save size={18} />}
                            {editingId ? 'Update Record' : 'Save To Inventory'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Desktop List View ── */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-all duration-300">
                <table className="min-w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700 hover:bg-black transition-colors">
                            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Category</th>
                            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Item Description</th>
                            <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Specifications</th>
                            <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Rate (₹)</th>
                            {!readOnly && <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                        {filteredItems.map((item, idx) => (
                            <tr key={item.id} className={`group ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/40'} hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors`}>
                                <td className="px-5 py-4 whitespace-nowrap">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                                        {item.type}
                                    </span>
                                </td>
                                <td className="px-5 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            {item.name}
                                        </span>
                                        {item.sku && (
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                                                SKU: {item.sku}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-5 py-4 text-xs">
                                    <div className="bg-indigo-50/30 dark:bg-slate-700/40 rounded-lg p-2 border border-indigo-100/50 dark:border-slate-700/50 inline-block">
                                        {item.type === 'profile' && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[9px]">Linear Weight:</span>
                                                <span className="font-extrabold text-slate-700 dark:text-slate-300">{item.weightPerM || 0} kg/m</span>
                                            </div>
                                        )}
                                        {item.type === 'substrate' && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[9px]">Type:</span>
                                                <span className="font-extrabold text-slate-700 dark:text-slate-300">{item.subType?.toUpperCase()} | {item.thickness || 0}mm</span>
                                            </div>
                                        )}
                                        {item.type === 'led' && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[9px]">Spec:</span>
                                                <span className="font-extrabold text-slate-700 dark:text-slate-300">{item.ledType} · {item.watts || 0}W · {item.spacingCC || 0}mm</span>
                                            </div>
                                        )}
                                        {item.type === 'smps' && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[9px]">Rating:</span>
                                                <span className="font-extrabold text-slate-700 dark:text-slate-300">{item.wattage || 0}W</span>
                                            </div>
                                        )}
                                        {item.type === 'hardware' && <span className="text-slate-400 italic">No technical specs</span>}
                                    </div>
                                </td>
                                <td className="px-5 py-4 text-right">
                                    <div className="flex flex-col items-end">
                                        <span className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">
                                            {item.type === 'profile' && `₹ ${item.ratePerKg}/kg`}
                                            {item.type === 'substrate' && (item.subType === 'acp' ? `₹ ${item.rateSft}/sft` : `₹ ${item.ratePerKg}/kg`)}
                                            {['led', 'smps', 'hardware'].includes(item.type) && `₹ ${item.rate}`}
                                        </span>
                                    </div>
                                </td>
                                {!readOnly && (
                                    <td className="px-5 py-4 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(item)}
                                                className="w-8 h-8 flex items-center justify-center text-blue-500 hover:text-white hover:bg-blue-500 rounded-lg transition-all"
                                                title="Edit"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-red-500 rounded-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Mobile View ── */}
            <div className="md:hidden space-y-3">
                {filteredItems.map(item => (
                    <div key={item.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm active:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                {item.type}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => handleEdit(item)} className="p-1 text-blue-500"><Edit size={16} /></button>
                                <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-300"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-white text-sm">{item.name}</h4>
                        {item.sku && <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase">{item.sku}</p>}

                        <div className="mt-3 flex justify-between items-end border-t border-slate-100 dark:border-slate-700/50 pt-2">
                            <span className="text-[10px] text-slate-400 italic">
                                {item.type === 'profile' && `${item.weightPerM} kg/m`}
                                {item.type === 'substrate' && `${item.subType?.toUpperCase()} | ${item.thickness}mm`}
                                {item.type === 'led' && `${item.watts}W · ${item.spacingCC}mm`}
                                {item.type === 'smps' && `${item.wattage}W`}
                            </span>
                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                {item.type === 'profile' && `₹${item.ratePerKg}/kg`}
                                {item.type === 'substrate' && (item.subType === 'acp' ? `₹${item.rateSft}/sft` : `₹${item.ratePerKg}/kg`)}
                                {['led', 'smps', 'hardware'].includes(item.type) && `₹${item.rate}`}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Empty State ── */}
            {filteredItems.length === 0 && !loading && (
                <div className="py-20 bg-white dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400">
                    <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                        <Package size={32} className="opacity-20" />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest opacity-50">No items detected</p>
                    <p className="text-xs mt-1 opacity-40">Add your first signage component using the button above.</p>
                </div>
            )}
        </div>
    );
};

export default SignageInventoryManager;
