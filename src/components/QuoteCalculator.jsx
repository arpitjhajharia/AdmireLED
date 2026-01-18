import React from 'react';
import { Calculator, Settings, Printer, Plus, Trash2, Monitor, DollarSign, Box, Wrench, Percent, Edit, Copy, Save, FileText, Eye, RefreshCw, X } from 'lucide-react';
import { formatCurrency, generateId, calculateBOM } from '../lib/utils';
import { CONFIG } from '../lib/config';
import ScreenVisualizer from './ScreenVisualizer';
import BOMLayout from './BOMLayout';
import PrintLayout from './PrintLayout';

// --- Helper Hook ---
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = React.useState(value);
    React.useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
};

// --- Helper Components ---
const LogisticsInput = ({ label, fieldKey, extras, updateExtra }) => (
    <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-xs text-slate-500 dark:text-slate-400 flex-1">{label}</label>
        <div className="flex items-center w-36 relative">
            <input
                type="number"
                value={extras[fieldKey].val}
                onChange={e => updateExtra(fieldKey, 'val', e.target.value)}
                className="w-full pl-3 pr-9 py-1.5 text-right text-sm border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-700 focus:ring-1 focus:ring-teal-500 transition-all"
            />
            <button
                onClick={() => updateExtra(fieldKey, 'type', extras[fieldKey].type === 'abs' ? 'pct' : 'abs')}
                className="absolute right-1 top-1 bottom-1 px-1.5 text-[10px] font-bold text-slate-400 hover:text-teal-600 uppercase bg-transparent"
            >
                {extras[fieldKey].type === 'abs' ? '₹' : '%'}
            </button>
        </div>
    </div>
);

const InteractiveCostSheet = ({ calculation, state, updateState, updateExtra, updateScreenProp, inventory, getStock, overrides, onOverride, editingRow, setEditingRow, onClearOverride }) => {
    const activeScreen = state.screens[state.activeScreenIndex];
    const { screenQty, selectedPitch, selectedModuleId, selectedCabinetId, selectedCardId, selectedSMPSId, selectedProcId, extraComponents, extras, commercials } = activeScreen;
    const { assemblyMode, selectedIndoor } = state;
    const safeGenId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

    // Filter Logic
    const isIndoor = selectedIndoor === 'true';
    const availableModules = inventory.filter(i => i.type === 'module' && i.indoor === isIndoor);
    const uniquePitches = [...new Set(availableModules.map(m => m.pitch))].sort((a, b) => a - b);
    const filteredModules = selectedPitch ? availableModules.filter(m => m.pitch == selectedPitch) : [];
    const selectedModule = inventory.find(i => i.id === selectedModuleId);
    const cabinets = inventory.filter(i => {
        if (i.type !== 'cabinet') return false;
        if (!selectedModule) return true;
        return (i.width % selectedModule.width === 0) && (i.height % selectedModule.height === 0);
    });
    const readyUnits = inventory.filter(i => i.type === 'ready' && i.indoor === isIndoor);

    // Component Cell Helper
    const renderComponentCell = (item) => {
        const updateScreenState = (key, value) => updateScreenProp(state.activeScreenIndex, key, value);

        if (item.id === 'modules') {
            return (
                <div className="flex flex-col md:flex-row gap-2">
                    <select value={selectedPitch} onChange={e => { updateScreenState('selectedPitch', e.target.value); updateScreenState('selectedModuleId', ''); }} className="w-full md:w-20 p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Pitch</option>{uniquePitches.map(p => <option key={p} value={p}>P{p}</option>)}
                    </select>
                    <select value={selectedModuleId} onChange={e => updateScreenState('selectedModuleId', e.target.value)} disabled={!selectedPitch} className="w-full md:flex-1 p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white disabled:opacity-50">
                        <option value="">Select Module...</option>
                        {filteredModules.map(m => <option key={m.id} value={m.id}>{m.brand} {m.model} ({getStock(m.id)})</option>)}
                    </select>
                </div>
            );
        }
        if (item.id === 'cabinets') return <select value={selectedCabinetId} onChange={e => updateScreenState('selectedCabinetId', e.target.value)} disabled={!selectedModule} className="w-full p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white disabled:opacity-50"><option value="">Select Cabinet...</option>{cabinets.map(c => <option key={c.id} value={c.id}>{c.brand} {c.model} ({c.width}x{c.height}) - Stock: {getStock(c.id)}</option>)}</select>;
        if (item.id === 'cards') return <select value={selectedCardId} onChange={e => updateScreenState('selectedCardId', e.target.value)} className="w-full p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="">Select Card...</option>{inventory.filter(i => i.type === 'card').map(c => <option key={c.id} value={c.id}>{c.brand} {c.model} ({getStock(c.id)})</option>)}</select>;
        if (item.id === 'smps') return <select value={selectedSMPSId} onChange={e => updateScreenState('selectedSMPSId', e.target.value)} className="w-full p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="">Select SMPS...</option>{inventory.filter(i => i.type === 'smps').map(c => <option key={c.id} value={c.id}>{c.brand} {c.model} ({getStock(c.id)})</option>)}</select>;
        if (item.id === 'processor') {
            return (
                <div className="flex flex-col gap-2 md:gap-1">
                    <select value={selectedProcId} onChange={e => updateScreenState('selectedProcId', e.target.value)} className="w-full p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Select Processor...</option>
                        {inventory.filter(i => i.type === 'processor').map(c => <option key={c.id} value={c.id}>{c.brand} {c.model} ({getStock(c.id)})</option>)}
                    </select>
                    <div className="flex items-center gap-2 md:gap-1">
                        <span className="text-xs md:text-[10px] text-green-600 font-bold">Sell:</span>
                        <input type="number" className="flex-1 md:w-20 p-2 md:p-0.5 text-xs border border-green-200 rounded bg-green-50 text-green-800" value={commercials.processor?.val || 0} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, processor: { ...commercials.processor, val: e.target.value } })} />
                    </div>
                </div>
            );
        }
        if (item.id === 'ready') return <select value={activeScreen.readyId} onChange={e => updateScreenState('readyId', e.target.value)} className="w-full p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="">Select Screen Model...</option>{readyUnits.map(u => <option key={u.id} value={u.id}>{u.brand} {u.model} (P{u.pitch})</option>)}</select>;

        const extraIdx = extraComponents ? extraComponents.findIndex(e => e.id === item.id) : -1;
        if (extraIdx !== -1) {
            return (
                <div className="flex gap-1 items-center">
                    <select value={extraComponents[extraIdx].componentId} onChange={e => { const n = [...extraComponents]; n[extraIdx].componentId = e.target.value; updateScreenState('extraComponents', n); }} className="flex-1 p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Select...</option>
                        {['module', 'cabinet', 'card', 'smps'].map(type => {
                            const items = inventory.filter(i => i.type === type).sort((a, b) => (a.brand + ' ' + a.model).localeCompare(b.brand + ' ' + b.model));
                            if (items.length === 0) return null;
                            return (
                                <optgroup key={type} label={type === 'smps' ? 'SMPS' : type.toUpperCase()}>
                                    {items.map(i => (
                                        <option key={i.id} value={i.id}>{i.brand} {i.model}</option>
                                    ))}
                                </optgroup>
                            );
                        })}
                    </select>
                    <select value={extraComponents[extraIdx].type} onChange={e => { const n = [...extraComponents]; n[extraIdx].type = e.target.value; updateScreenState('extraComponents', n); }} className="w-16 p-2 md:p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="screen">/Scrn</option><option value="cabinet">/Cab</option></select>
                    <button type="button" onClick={() => updateScreenState('extraComponents', extraComponents.filter((_, i) => i !== extraIdx))} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
            );
        }
        return <span className="font-bold text-slate-700 dark:text-slate-200">{item.name} <span className="text-[10px] text-slate-400 font-normal">({item.spec})</span></span>;
    };

    const getExtraCost = (id) => calculation?.calculatedExtras?.[id] || 0;
    const areaSqFt = calculation?.matrix?.sqft?.perScreen || 1;

    let displayItems = calculation ? calculation.detailedItems : (assemblyMode === 'assembled' ? [
        { id: 'modules', type: 'led', name: 'Modules', qty: 0, unit: 0, total: 0 },
        { id: 'cabinets', type: 'led', name: 'Cabinets', qty: 0, unit: 0, total: 0 },
        { id: 'cards', type: 'led', name: 'Receiving Cards', qty: 0, unit: 0, total: 0 },
        { id: 'smps', type: 'led', name: 'SMPS', qty: 0, unit: 0, total: 0 },
        { id: 'processor', type: 'service', name: 'Processor', qty: 1, unit: 0, total: 0 }
    ] : [
        { id: 'ready', type: 'led', name: 'Ready Unit', qty: 0, unit: 0, total: 0 },
        { id: 'processor', type: 'service', name: 'Processor', qty: 1, unit: 0, total: 0 }
    ]);

    if (!calculation && extraComponents?.length > 0) {
        displayItems = [...displayItems, ...extraComponents.map(e => ({ id: e.id, type: 'led', name: 'Extra', spec: 'Select...', qty: e.qty, unit: 0, total: 0 }))];
    }

    const ledItems = displayItems.filter(i => i.type === 'led');
    const ledOpsTotal = (Array.isArray(extras) ? extras : []).reduce((sum, item) => sum + getExtraCost(item.id), 0);
    const ledItemsTotal = ledItems.reduce((sum, item) => sum + (item.total * screenQty), 0);
    const ledPanelSubtotal = ledItemsTotal + (ledOpsTotal * screenQty);
    const ledPanelPerScreen = ledPanelSubtotal / (screenQty || 1);
    const ledPanelPerSqFt = ledPanelPerScreen / areaSqFt;

    const serviceItems = displayItems.filter(i => i.type !== 'led');
    const installCost = getExtraCost('install');
    const structureCost = getExtraCost('structure');
    const serviceItemsTotal = serviceItems.reduce((sum, item) => sum + (item.total * screenQty), 0);
    const additionalSubtotal = serviceItemsTotal + ((installCost + structureCost) * screenQty);
    const additionalPerScreen = additionalSubtotal / (screenQty || 1);
    const additionalPerSqFt = additionalPerScreen / areaSqFt;

    const grandTotal = ledPanelSubtotal + additionalSubtotal;
    const grandTotalPerScreen = grandTotal / (screenQty || 1);
    const grandTotalPerSqFt = grandTotalPerScreen / areaSqFt;

    const handleAddExtra = () => {
        const newExtra = { id: safeGenId(), name: 'New Cost', val: 0, type: 'abs' };
        updateScreenProp(state.activeScreenIndex, 'extras', [...(extras || []), newExtra]);
    };
    const handleRemoveExtra = (index) => {
        const newExtras = [...extras];
        newExtras.splice(index, 1);
        updateScreenProp(state.activeScreenIndex, 'extras', newExtras);
    };
    const handleUpdateExtra = (index, key, val) => {
        const newExtras = [...extras];
        newExtras[index] = { ...newExtras[index], [key]: val };
        updateScreenProp(state.activeScreenIndex, 'extras', newExtras);
    };

    // --- RENDER HELPERS ---

    // 1. Desktop Table Row
    const renderDesktopRow = (item) => (
        <tr key={item.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${item.isOverridden ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
            <td className="p-2 pl-4">
                <div className="flex items-center gap-2">
                    <div className="flex-1">{renderComponentCell(item)}</div>
                    {calculation && (
                        <>
                            <button type="button" onClick={() => setEditingRow(editingRow === item.id ? null : item.id)} className={`p-1 rounded ${editingRow === item.id ? 'bg-teal-100 text-teal-700' : 'text-slate-300 hover:text-teal-600'}`}><Edit size={12} /></button>
                            {item.isOverridden && <button type="button" onClick={() => onClearOverride(item.id)} className="text-amber-500 hover:text-red-500"><RefreshCw size={12} /></button>}
                        </>
                    )}
                </div>
            </td>
            <td className="p-2 text-right w-24">
                {editingRow === item.id ? (
                    <input type="number" className="w-full p-1 text-right text-xs border rounded" value={overrides[item.id]?.rate ?? item.unit} onChange={e => onOverride(item.id, 'rate', e.target.value)} />
                ) : formatCurrency(item.unit, 'INR', false)}
            </td>
            <td className="p-2 text-center border-l border-slate-100 dark:border-slate-700 w-16">
                {editingRow === item.id ? (
                    <input type="number" className="w-full p-1 text-center text-xs border rounded" value={overrides[item.id]?.qty ?? item.qty} onChange={e => onOverride(item.id, 'qty', e.target.value)} />
                ) : item.qty}
            </td>
            <td className="p-2 text-right text-slate-500 w-24">{formatCurrency(item.total, 'INR', false)}</td>
            <td className="p-2 text-right font-medium border-l border-slate-100 dark:border-slate-700 w-28">{formatCurrency(item.total * screenQty, 'INR', false)}</td>
        </tr>
    );

    // 2. Mobile Card Row (NEW)
    const renderMobileRow = (item) => (
        <div key={item.id} className={`bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 mb-3 shadow-sm ${item.isOverridden ? 'ring-1 ring-amber-400 bg-amber-50 dark:bg-amber-900/10' : ''}`}>
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase text-slate-500">{item.name}</span>
                {calculation && (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setEditingRow(editingRow === item.id ? null : item.id)} className={`p-1 rounded ${editingRow === item.id ? 'bg-teal-100 text-teal-700' : 'text-slate-300 hover:text-teal-600'}`}><Edit size={14} /></button>
                        {item.isOverridden && <button type="button" onClick={() => onClearOverride(item.id)} className="text-amber-500 hover:text-red-500"><RefreshCw size={14} /></button>}
                    </div>
                )}
            </div>

            <div className="mb-3">
                {renderComponentCell(item)}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 dark:bg-slate-700/50 p-2 rounded">
                <div>
                    <span className="block text-[9px] uppercase text-slate-400 font-bold mb-1">Rate</span>
                    {editingRow === item.id ? (
                        <input type="number" className="w-full p-1 text-right text-xs border rounded" value={overrides[item.id]?.rate ?? item.unit} onChange={e => onOverride(item.id, 'rate', e.target.value)} />
                    ) : (
                        <span className="block font-medium dark:text-slate-200">{formatCurrency(item.unit, 'INR', false)}</span>
                    )}
                </div>
                <div className="text-center border-l border-slate-200 dark:border-slate-600">
                    <span className="block text-[9px] uppercase text-slate-400 font-bold mb-1">Qty</span>
                    {editingRow === item.id ? (
                        <input type="number" className="w-full p-1 text-center text-xs border rounded" value={overrides[item.id]?.qty ?? item.qty} onChange={e => onOverride(item.id, 'qty', e.target.value)} />
                    ) : (
                        <span className="block font-medium dark:text-slate-200">{item.qty}</span>
                    )}
                </div>
                <div className="text-right border-l border-slate-200 dark:border-slate-600">
                    <span className="block text-[9px] uppercase text-slate-400 font-bold mb-1">Total</span>
                    <span className="block font-bold text-teal-600 dark:text-teal-400">{formatCurrency(item.total * screenQty, 'INR', false)}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">

            {/* --- DESKTOP VIEW (Table) --- */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                            <th className="p-2">Component Selection</th>
                            <th className="p-2 text-right">Rate (Cost)</th>
                            <th className="p-2 text-center border-l border-slate-200 dark:border-slate-700">Qty/Scrn</th>
                            <th className="p-2 text-right">Cost/Scrn</th>
                            <th className="p-2 text-right border-l border-slate-200 dark:border-slate-700">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        <tr className="bg-slate-50 dark:bg-slate-800/50"><td colSpan="5" className="p-2 font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider text-[10px]">A. LED Panel & Logistics</td></tr>
                        {ledItems.map(renderDesktopRow)}
                        <tr className="bg-white dark:bg-slate-900">
                            <td colSpan="5" className="p-2 text-center">
                                <button type="button" onClick={() => updateScreenProp(state.activeScreenIndex, 'extraComponents', [...(extraComponents || []), { id: safeGenId(), componentId: '', qty: 1, type: 'screen' }])} className="text-[10px] text-teal-600 hover:underline flex items-center justify-center gap-1 w-full"><Plus size={10} /> Add Component to Panel</button>
                            </td>
                        </tr>

                        {(Array.isArray(extras) ? extras : []).map((item, idx) => (
                            <tr key={item.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 group">
                                <td className="p-2 pl-4">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleRemoveExtra(idx)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                        <input type="text" value={item.name} onChange={e => handleUpdateExtra(idx, 'name', e.target.value)} className="text-xs border-b border-transparent hover:border-slate-300 focus:border-teal-500 bg-transparent outline-none w-full text-slate-600 dark:text-slate-300 font-medium" />
                                    </div>
                                </td>
                                <td className="p-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <input type="number" value={item.val} onChange={e => handleUpdateExtra(idx, 'val', e.target.value)} className="w-16 p-1 text-right text-xs border rounded bg-white dark:bg-slate-800 dark:border-slate-600" />
                                        <button type="button" onClick={() => handleUpdateExtra(idx, 'type', item.type === 'abs' ? 'pct' : 'abs')} className="px-1 text-[10px] font-bold border rounded bg-slate-100 dark:bg-slate-700">{item.type === 'abs' ? '₹' : '%'}</button>
                                    </div>
                                </td>
                                <td className="p-2 text-center border-l border-slate-100 dark:border-slate-700 text-[10px] text-slate-400">{item.type === 'pct' ? `${item.val}%` : '-'}</td>
                                <td className="p-2 text-right">{formatCurrency(getExtraCost(item.id), 'INR', false)}</td>
                                <td className="p-2 text-right border-l border-slate-100 dark:border-slate-700">{formatCurrency(getExtraCost(item.id) * screenQty, 'INR', false)}</td>
                            </tr>
                        ))}
                        <tr className="bg-slate-50 dark:bg-slate-800/20">
                            <td colSpan="5" className="p-1 text-center">
                                <button onClick={handleAddExtra} className="text-[10px] text-blue-600 hover:text-blue-700 font-bold uppercase tracking-wider flex items-center justify-center gap-1 py-1 w-full hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"><Plus size={10} /> Add Extra Cost</button>
                            </td>
                        </tr>

                        <tr className="bg-teal-50 dark:bg-teal-900/20 font-bold border-t border-teal-100 dark:border-teal-800">
                            <td className="p-2 text-right text-teal-800 dark:text-teal-300">Sub-total (LED Panel)</td>
                            <td className="p-2 text-right text-teal-700 dark:text-teal-400 text-[10px] font-normal">{formatCurrency(ledPanelPerSqFt, 'INR')}/sqft</td>
                            <td className="p-2 text-center border-l border-teal-100 dark:border-teal-800">-</td>
                            <td className="p-2 text-right text-teal-800 dark:text-teal-300">{formatCurrency(ledPanelPerScreen, 'INR', false)}</td>
                            <td className="p-2 text-right text-teal-800 dark:text-teal-300 border-l border-teal-100 dark:border-teal-800">{formatCurrency(ledPanelSubtotal, 'INR', false)}</td>
                        </tr>

                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700"><td colSpan="5" className="p-2 font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider text-[10px]">B. Additional Costs</td></tr>
                        {serviceItems.map(renderDesktopRow)}
                        {/* Service Rows - Installation etc. */}
                        {['installation', 'structure'].map(sellKey => {
                            const costKey = sellKey === 'installation' ? 'install' : 'structure';
                            const label = sellKey === 'installation' ? 'Installation' : 'Structure';
                            return (
                                <tr key={sellKey} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="p-2 pl-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium">{label}</span>
                                                <select value={commercials[sellKey]?.unit || 'sqft'} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], unit: e.target.value } })} className="text-[10px] p-0.5 border rounded bg-slate-50 dark:bg-slate-700"><option value="sqft">/Sq.Ft</option><option value="screen">/Screen</option></select>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] text-green-600 font-bold">Sell:</span>
                                                <input type="number" className="w-20 p-0.5 text-xs border border-green-200 rounded bg-green-50 text-green-800" value={commercials[sellKey]?.val || 0} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], val: e.target.value } })} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <span className="text-[10px] text-slate-400 mr-1">Cost:</span>
                                            <input type="number" value={commercials[sellKey]?.cost || 0} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], cost: e.target.value } })} className="w-16 p-1 text-right text-xs border rounded bg-white dark:bg-slate-800 dark:border-slate-600" />
                                            <button type="button" onClick={() => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], costType: commercials[sellKey]?.costType === 'abs' ? 'pct' : 'abs' } })} className="px-1 text-[10px] font-bold border rounded bg-slate-100 dark:bg-slate-700">{commercials[sellKey]?.costType === 'abs' ? '₹' : '%'}</button>
                                        </div>
                                    </td>
                                    <td className="p-2 text-center border-l border-slate-100 dark:border-slate-700 text-xs">{commercials[sellKey]?.unit === 'sqft' ? calculation?.matrix.sqft.perScreen.toFixed(1) || '-' : '1'}</td>
                                    <td className="p-2 text-right">{formatCurrency(getExtraCost(costKey), 'INR', false)}</td>
                                    <td className="p-2 text-right border-l border-slate-100 dark:border-slate-700">{formatCurrency(getExtraCost(costKey) * screenQty, 'INR', false)}</td>
                                </tr>
                            );
                        })}
                        <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold border-t border-blue-100 dark:border-blue-800">
                            <td className="p-2 text-right text-blue-800 dark:text-blue-300">Sub-total (Additional)</td>
                            <td className="p-2 text-right text-blue-700 dark:text-blue-400 text-[10px] font-normal">{formatCurrency(additionalPerSqFt, 'INR')}/sqft</td>
                            <td className="p-2 text-center border-l border-blue-100 dark:border-blue-800">-</td>
                            <td className="p-2 text-right text-blue-800 dark:text-blue-300">{formatCurrency(additionalPerScreen, 'INR', false)}</td>
                            <td className="p-2 text-right text-blue-800 dark:text-blue-300 border-l border-blue-100 dark:border-blue-800">{formatCurrency(additionalSubtotal, 'INR', false)}</td>
                        </tr>

                        <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-900 text-sm">
                            <td className="p-3 text-right uppercase">Grand Total (Cost)</td>
                            <td className="p-3 text-right text-slate-300 text-xs font-normal">{formatCurrency(grandTotalPerSqFt, 'INR')}/sqft</td>
                            <td className="p-3 text-center border-l border-slate-600">-</td>
                            <td className="p-3 text-right border-l border-slate-600">{formatCurrency(grandTotalPerScreen, 'INR', false)}</td>
                            <td className="p-3 text-right border-l border-slate-600">{formatCurrency(grandTotal, 'INR', false)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* --- MOBILE VIEW (Cards) --- */}
            <div className="md:hidden bg-slate-50 dark:bg-slate-800/20 p-3">
                <div className="mb-2 font-bold text-teal-700 text-xs uppercase tracking-wider">A. LED Panel & Logistics</div>
                {ledItems.map(renderMobileRow)}
                <button type="button" onClick={() => updateScreenProp(state.activeScreenIndex, 'extraComponents', [...(extraComponents || []), { id: safeGenId(), componentId: '', qty: 1, type: 'screen' }])} className="w-full py-2 mb-4 bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-700 text-teal-600 dark:text-teal-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2"><Plus size={14} /> Add Component</button>

                {(Array.isArray(extras) ? extras : []).map((item, idx) => (
                    <div key={item.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 mb-3 shadow-sm flex items-center justify-between">
                        <div className="flex-1">
                            <input type="text" value={item.name} onChange={e => handleUpdateExtra(idx, 'name', e.target.value)} className="text-xs font-bold border-b border-transparent focus:border-teal-500 bg-transparent outline-none w-full text-slate-600 dark:text-slate-300" />
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="number" value={item.val} onChange={e => handleUpdateExtra(idx, 'val', e.target.value)} className="w-12 p-1 text-right text-xs border rounded bg-slate-50 dark:bg-slate-700" />
                            <button type="button" onClick={() => handleUpdateExtra(idx, 'type', item.type === 'abs' ? 'pct' : 'abs')} className="px-1 text-[10px] font-bold border rounded bg-slate-100 dark:bg-slate-600">{item.type === 'abs' ? '₹' : '%'}</button>
                            <button onClick={() => handleRemoveExtra(idx)} className="text-red-400 p-1"><Trash2 size={14} /></button>
                        </div>
                    </div>
                ))}
                <button onClick={handleAddExtra} className="w-full py-2 mb-4 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2"><Plus size={14} /> Add Overhead Cost</button>

                <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-lg border border-teal-100 dark:border-teal-800 mb-6">
                    <div className="flex justify-between items-center text-xs font-bold text-teal-800 dark:text-teal-300">
                        <span>Sub-total (LED Panel)</span>
                        <span>{formatCurrency(ledPanelSubtotal, 'INR', false)}</span>
                    </div>
                    <div className="text-[10px] text-right text-teal-600 dark:text-teal-400 mt-1">
                        {formatCurrency(ledPanelPerSqFt, 'INR')}/sqft
                    </div>
                </div>

                <div className="mb-2 font-bold text-blue-700 text-xs uppercase tracking-wider">B. Additional Costs</div>
                {serviceItems.map(renderMobileRow)}
                {/* Mobile Service Rows */}
                {['installation', 'structure'].map(sellKey => {
                    const costKey = sellKey === 'installation' ? 'install' : 'structure';
                    const label = sellKey === 'installation' ? 'Installation' : 'Structure';
                    return (
                        <div key={sellKey} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 mb-3 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                                <select value={commercials[sellKey]?.unit || 'sqft'} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], unit: e.target.value } })} className="text-[10px] p-0.5 border rounded bg-slate-50 dark:bg-slate-700"><option value="sqft">/Sq.Ft</option><option value="screen">/Screen</option></select>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <div className="flex items-center gap-1 bg-green-50 p-1 rounded border border-green-100">
                                    <span className="text-[10px] text-green-600 font-bold">Sell:</span>
                                    <input type="number" className="w-full p-0.5 text-xs bg-transparent outline-none text-green-800 font-bold" value={commercials[sellKey]?.val || 0} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], val: e.target.value } })} />
                                </div>
                                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded border border-slate-100">
                                    <span className="text-[10px] text-slate-400">Cost:</span>
                                    <input type="number" className="w-full p-0.5 text-xs bg-transparent outline-none" value={commercials[sellKey]?.cost || 0} onChange={e => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], cost: e.target.value } })} />
                                    <button type="button" onClick={() => updateScreenProp(state.activeScreenIndex, 'commercials', { ...commercials, [sellKey]: { ...commercials[sellKey], costType: commercials[sellKey]?.costType === 'abs' ? 'pct' : 'abs' } })} className="px-1 text-[10px] font-bold">{commercials[sellKey]?.costType === 'abs' ? '₹' : '%'}</button>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
                                <span className="text-[10px] text-slate-400 font-bold">Total Cost</span>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatCurrency(getExtraCost(costKey) * screenQty, 'INR', false)}</span>
                            </div>
                        </div>
                    );
                })}

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 mb-6">
                    <div className="flex justify-between items-center text-xs font-bold text-blue-800 dark:text-blue-300">
                        <span>Sub-total (Additional)</span>
                        <span>{formatCurrency(additionalSubtotal, 'INR', false)}</span>
                    </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg text-white shadow-lg">
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-xs uppercase text-slate-400 font-bold">Grand Total (Cost)</span>
                        <span className="text-lg font-bold">{formatCurrency(grandTotal, 'INR', false)}</span>
                    </div>
                    <div className="text-[10px] text-right text-slate-500">
                        {formatCurrency(grandTotalPerSqFt, 'INR')}/sqft
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---
const QuoteCalculator = ({ user, inventory, transactions, state, setState, exchangeRate, setExchangeRate, onSaveQuote, readOnly = false }) => {
    const {
        client, project, screenQty, targetWidth, targetHeight, unit,
        selectedIndoor, assemblyMode, sizingMode, margin, extras, overrides, editingRow
    } = state;

    const [calculation, setCalculation] = React.useState(null);
    const [allScreensTotal, setAllScreensTotal] = React.useState(null);
    const [showPreview, setShowPreview] = React.useState(false);
    const [showBOM, setShowBOM] = React.useState(false);

    // Using Debounce
    const debouncedState = useDebounce(state, 300);

    const getStock = (id) => transactions ? transactions.filter(t => t.itemId === id).reduce((acc, t) => acc + (t.type === 'in' ? Number(t.qty) : -Number(t.qty)), 0) : 0;
    const updateState = (key, value) => setState(prev => ({ ...prev, [key]: value }));
    const updateExtra = (key, field, val) => {
        const activeIndex = state.activeScreenIndex;
        setState(prev => {
            const newScreens = [...prev.screens];
            newScreens[activeIndex] = {
                ...newScreens[activeIndex],
                extras: {
                    ...newScreens[activeIndex].extras,
                    [key]: {
                        ...newScreens[activeIndex].extras[key],
                        [field]: val
                    }
                }
            };
            return { ...prev, screens: newScreens };
        });
    };

    const handleReset = () => {
        if (confirm("Reset calculator to defaults?")) {
            setState({
                client: '', project: '', unit: 'ft',
                screens: [
                    {
                        id: generateId(),
                        screenQty: 0,
                        targetWidth: 0,
                        targetHeight: 0,
                        selectedIndoor: 'true',
                        assemblyMode: 'assembled',
                        selectedPitch: '',
                        selectedModuleId: '',
                        selectedCabinetId: '',
                        selectedCardId: '',
                        selectedSMPSId: '',
                        selectedProcId: '',
                        sizingMode: 'closest',
                        readyId: '',
                        extraComponents: [],
                        overrides: {},
                        editingRow: null,
                        extras: [],
                        commercials: {
                            processor: { val: 0, unit: 'screen', cost: 0, costType: 'abs' },
                            installation: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' },
                            structure: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' }
                        }
                    }
                ],
                activeScreenIndex: 0,
                selectedIndoor: 'true', assemblyMode: 'assembled', selectedPitch: '',
                selectedModuleId: '', selectedCabinetId: '', selectedCardId: '',
                selectedSMPSId: '', selectedProcId: '', sizingMode: 'closest', readyId: '',
                margin: 0, pricingMode: 'margin', targetSellPrice: 0,
                extraComponents: [],
                commercials: {
                    processor: { val: 0, unit: 'screen' },
                    installation: { val: 0, unit: 'sqft' },
                    structure: { val: 0, unit: 'sqft' }
                },
                terms: {
                    price: CONFIG.DEFAULTS.PRICE_BASIS,
                    deliveryWeeks: CONFIG.DEFAULTS.DELIVERY_WEEKS,
                    payment: CONFIG.DEFAULTS.PAYMENT_TERMS
                },
                extras: [],
                overrides: {},
                editingRow: null
            });
        }
    };

    const addScreen = () => {
        const newScreen = {
            id: generateId(),
            screenQty: 1,
            targetWidth: 0,
            targetHeight: 0,
            selectedIndoor: state.selectedIndoor,
            assemblyMode: state.assemblyMode,
            selectedPitch: '',
            selectedModuleId: '',
            selectedCabinetId: '',
            selectedCardId: '',
            selectedPSUId: '',
            selectedProcId: '',
            sizingMode: 'closest',
            readyId: '',
            extraComponents: [],
            overrides: {},
            editingRow: null,
            extras: [],
            commercials: {
                processor: { val: 0, unit: 'screen', cost: 0, costType: 'abs' },
                installation: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' },
                structure: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' }
            }
        };
        setState(prev => ({
            ...prev,
            screens: [...prev.screens, newScreen],
            activeScreenIndex: prev.screens.length
        }));
    };

    const removeScreen = (index) => {
        if (state.screens.length === 1) {
            alert("Cannot remove the last screen configuration.");
            return;
        }
        if (confirm("Remove this screen configuration?")) {
            setState(prev => ({
                ...prev,
                screens: prev.screens.filter((_, i) => i !== index),
                activeScreenIndex: Math.min(prev.activeScreenIndex, prev.screens.length - 2)
            }));
        }
    };

    const updateScreenProp = (index, key, value) => {
        setState(prev => {
            const newScreens = [...prev.screens];
            newScreens[index] = { ...newScreens[index], [key]: value };
            return { ...prev, screens: newScreens };
        });
    };

    const duplicateScreen = (index) => {
        const screenToDup = state.screens[index];
        const newScreen = {
            ...screenToDup,
            id: generateId(),
            overrides: {},
            editingRow: null
        };
        setState(prev => ({
            ...prev,
            screens: [...prev.screens, newScreen],
            activeScreenIndex: prev.screens.length
        }));
    };

    const onOverride = (id, field, value) => {
        const screen = state.screens[state.activeScreenIndex];
        updateScreenProp(state.activeScreenIndex, 'overrides', {
            ...screen.overrides,
            [id]: { ...screen.overrides[id], [field]: value }
        });
    };

    const onClearOverride = (id) => {
        const screen = state.screens[state.activeScreenIndex];
        const newOverrides = { ...screen.overrides };
        delete newOverrides[id];
        updateScreenProp(state.activeScreenIndex, 'overrides', newOverrides);
        updateScreenProp(state.activeScreenIndex, 'editingRow', null);
    };

    // --- Debounced Calculations ---

    // 1. Single Screen Calculation
    React.useEffect(() => {
        if (!debouncedState.screens || debouncedState.screens.length === 0) {
            setCalculation(null);
            return;
        }

        const activeScreen = debouncedState.screens[debouncedState.activeScreenIndex];
        if (!activeScreen) {
            setCalculation(null);
            return;
        }

        const calcState = {
            ...debouncedState,
            ...activeScreen
        };

        const result = calculateBOM(calcState, inventory, transactions, exchangeRate);
        setCalculation(result);
    }, [debouncedState, inventory, exchangeRate]);

    // 2. All Screens Total
    React.useEffect(() => {
        const calculateAllScreens = () => {
            if (!debouncedState.screens || debouncedState.screens.length === 0) return null;

            const allCalculations = debouncedState.screens.map((screen) => {
                const calcState = { ...debouncedState, ...screen };
                return calculateBOM(calcState, inventory, transactions, exchangeRate);
            }).filter(calc => calc !== null);

            if (allCalculations.length === 0) return null;

            const totals = {
                totalProjectCost: allCalculations.reduce((sum, calc) => sum + calc.totalProjectCost, 0),
                totalProjectSell: allCalculations.reduce((sum, calc) => sum + calc.totalProjectSell, 0),
                totalLEDSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.led.sell * calc.screenQty), 0),
                totalServicesSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.sell.total - (calc.matrix.led.sell * calc.screenQty)), 0),
                totalMargin: 0,
                // FIX: Force 'screenQty' to be a Number so it adds (10+2=12) instead of concatenates ("10"+"2"="102")
                totalScreenQty: allCalculations.reduce((sum, calc) => sum + Number(calc.screenQty), 0),
                calculations: allCalculations,
                screenConfigs: debouncedState.screens
            };
            totals.totalMargin = totals.totalProjectSell - totals.totalProjectCost;
            return totals;
        };

        const totals = calculateAllScreens();
        setAllScreensTotal(totals);
    }, [debouncedState, inventory, exchangeRate]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative items-start">

            {/* --- Modals --- */}
            {showBOM && (calculation || allScreensTotal) && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-900 max-w-5xl w-full h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <div className="flex items-center gap-4">
                                <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                                    <FileText size={20} className="text-teal-600" /> BOM
                                </h2>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowBOM(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-sm font-bold">Close</button>
                                <button onClick={() => {
                                    const originalTitle = document.title;
                                    document.title = `${client}_${project}_BOM`.replace(/[^a-zA-Z0-9_]/g, '_');
                                    window.print();
                                    document.title = originalTitle;
                                }} className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 rounded flex items-center gap-2 text-sm font-bold"><Printer size={16} /> Print</button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-800 p-8 flex justify-center">
                            <BOMLayout
                                data={calculation ? { ...calculation, clientName: client, projectName: project } : null}
                                allScreensData={allScreensTotal ? {
                                    ...allScreensTotal,
                                    clientName: client,
                                    projectName: project,
                                    screenConfigs: state.screens.map(s => ({
                                        targetWidth: s.targetWidth,
                                        targetHeight: s.targetHeight,
                                        unit: unit
                                    }))
                                } : null}
                                inventory={inventory}
                                transactions={transactions}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showPreview && (calculation || allScreensTotal) && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex justify-center items-center p-4">
                    <div className="bg-white max-w-4xl w-full h-[90vh] rounded-lg shadow-2xl flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-100 rounded-t-lg">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Eye size={20} /> Print Preview</h2>
                            <div className="flex gap-2">
                                <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded">Close</button>
                                <button onClick={() => {
                                    const originalTitle = document.title;
                                    document.title = `${client}_${project}_Quote`.replace(/[^a-zA-Z0-9_]/g, '_');
                                    window.print();
                                    document.title = originalTitle;
                                }} className="px-4 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded flex items-center gap-2"><Printer size={16} /> Print / Save PDF</button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-200">
                            <PrintLayout
                                data={calculation ? { ...calculation, clientName: client, projectName: project, margin } : null}
                                allScreensData={allScreensTotal ? { ...allScreensTotal, clientName: client, projectName: project } : null}
                                currency='INR'
                                exchangeRate={exchangeRate}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* --- Left Column --- */}
            <div className="lg:col-span-8 space-y-6">

                {/* Project Specs */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                            <Settings className="w-4 h-4 text-teal-600" /> Project Specs
                        </h3>
                        <div className="flex items-center gap-2">
                            <button onClick={handleReset} className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded transition-colors mr-2 flex items-center gap-1">
                                <RefreshCw size={10} /> Reset
                            </button>
                            <div className="flex bg-slate-200 dark:bg-slate-700 rounded-md p-0.5">
                                <button onClick={() => updateState('unit', 'm')} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${unit === 'm' ? 'bg-white dark:bg-slate-600 shadow text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>M</button>
                                <button onClick={() => updateState('unit', 'ft')} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${unit === 'ft' ? 'bg-white dark:bg-slate-600 shadow text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>FT</button>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="relative group">
                                <label className="absolute -top-1.5 left-2 bg-white dark:bg-slate-800 px-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">CLIENT</label>
                                <input value={client} onChange={e => updateState('client', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:text-white transition-all" placeholder="Client Name" />
                            </div>
                            <div className="relative group">
                                <label className="absolute -top-1.5 left-2 bg-white dark:bg-slate-800 px-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">PROJECT</label>
                                <input value={project} onChange={e => updateState('project', e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:text-white transition-all" placeholder="Project Ref" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center border border-slate-200 dark:border-slate-600 rounded-md overflow-hidden h-8">
                                <div className="bg-slate-100 dark:bg-slate-700 px-3 h-full flex items-center border-r border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase w-20 justify-center">Type</div>
                                <div className="flex-1 flex p-0.5 bg-slate-50 dark:bg-slate-800 h-full">
                                    <button onClick={() => { updateState('selectedIndoor', 'true'); updateScreenProp(state.activeScreenIndex, 'selectedIndoor', 'true'); }} className={`flex-1 text-[10px] font-bold rounded-sm transition-all ${selectedIndoor === 'true' ? 'bg-white dark:bg-slate-600 shadow text-teal-700 dark:text-teal-300' : 'text-slate-400 hover:text-slate-600'}`}>Indoor</button>
                                    <button onClick={() => { updateState('selectedIndoor', 'false'); updateScreenProp(state.activeScreenIndex, 'selectedIndoor', 'false'); }} className={`flex-1 text-[10px] font-bold rounded-sm transition-all ${selectedIndoor === 'false' ? 'bg-white dark:bg-slate-600 shadow text-teal-700 dark:text-teal-300' : 'text-slate-400 hover:text-slate-600'}`}>Outdoor</button>
                                </div>
                            </div>

                            <div className="flex items-center border border-slate-200 dark:border-slate-600 rounded-md overflow-hidden h-8">
                                <div className="bg-slate-100 dark:bg-slate-700 px-3 h-full flex items-center border-r border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase w-20 justify-center">Supply</div>
                                <div className="flex-1 flex p-0.5 bg-slate-50 dark:bg-slate-800 h-full">
                                    <button onClick={() => { updateState('assemblyMode', 'assembled'); updateScreenProp(state.activeScreenIndex, 'assemblyMode', 'assembled'); }} className={`flex-1 text-[10px] font-bold rounded-sm transition-all ${assemblyMode === 'assembled' ? 'bg-white dark:bg-slate-600 shadow text-teal-700 dark:text-teal-300' : 'text-slate-400 hover:text-slate-600'}`}>Assm</button>
                                    <button onClick={() => { updateState('assemblyMode', 'ready'); updateScreenProp(state.activeScreenIndex, 'assemblyMode', 'ready'); }} className={`flex-1 text-[10px] font-bold rounded-sm transition-all ${assemblyMode === 'ready' ? 'bg-white dark:bg-slate-600 shadow text-teal-700 dark:text-teal-300' : 'text-slate-400 hover:text-slate-600'}`}>Ready</button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Screen Configurations</label>
                                <button onClick={addScreen} className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 bg-teal-50 dark:bg-teal-900/30 px-2 py-1 rounded transition-colors border border-teal-100 dark:border-teal-800">
                                    <Plus size={12} /> Add Size
                                </button>
                            </div>

                            <div className="grid grid-cols-4 md:grid-cols-12 gap-2 mb-1 px-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider hidden md:grid">
                                <div className="col-span-1 text-center">#</div>
                                <div className="col-span-3">Width ({unit})</div>
                                <div className="col-span-3">Height ({unit})</div>
                                <div className="col-span-2 text-center">Qty</div>
                                <div className="col-span-2">Sizing</div>
                                <div className="col-span-1 text-right">Actions</div>
                            </div>

                            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                {state.screens.map((screen, index) => (
                                    <div
                                        key={screen.id}
                                        onClick={() => setState({ ...state, activeScreenIndex: index })}
                                        className={`grid grid-cols-4 md:grid-cols-12 gap-3 items-start p-3 rounded-lg border transition-all cursor-pointer ${state.activeScreenIndex === index ? 'border-teal-500 ring-1 ring-teal-500 bg-teal-50/50 dark:bg-teal-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-teal-300'}`}
                                    >
                                        {/* 1. Header: Index & Mobile Actions */}
                                        <div className="col-span-4 md:col-span-1 flex justify-between md:justify-center items-center border-b md:border-b-0 pb-2 md:pb-0 mb-1 md:mb-0">
                                            <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">#{index + 1}</span>

                                            {/* Mobile Actions (Moved to Top) */}
                                            <div className="md:hidden flex gap-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const n = [...state.screens];
                                                        const newId = Math.random().toString(36).substr(2, 9);
                                                        n.splice(index + 1, 0, { ...n[index], id: newId });
                                                        setState({ ...state, screens: n, activeScreenIndex: index + 1 });
                                                    }}
                                                    className="text-blue-500 hover:text-blue-700 bg-blue-50 p-1.5 rounded"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                {state.screens.length > 1 && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const n = state.screens.filter((_, i) => i !== index);
                                                            setState({ ...state, screens: n, activeScreenIndex: Math.max(0, index - 1) });
                                                        }}
                                                        className="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 2. Width Input */}
                                        <div className="col-span-2 md:col-span-3">
                                            <label className="md:hidden text-[10px] font-bold text-slate-400 mb-1 block uppercase">Width ({state.unit})</label>
                                            <input
                                                type="number"
                                                value={screen.targetWidth}
                                                onChange={e => updateScreenProp(index, 'targetWidth', e.target.value)}
                                                className="w-full p-2 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:border-teal-500 outline-none"
                                                placeholder="W"
                                            />
                                        </div>

                                        {/* 3. Height Input */}
                                        <div className="col-span-2 md:col-span-3">
                                            <label className="md:hidden text-[10px] font-bold text-slate-400 mb-1 block uppercase">Height ({state.unit})</label>
                                            <input
                                                type="number"
                                                value={screen.targetHeight}
                                                onChange={e => updateScreenProp(index, 'targetHeight', e.target.value)}
                                                className="w-full p-2 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:border-teal-500 outline-none"
                                                placeholder="H"
                                            />
                                        </div>

                                        {/* 4. Qty Input */}
                                        <div className="col-span-2 md:col-span-2">
                                            <label className="md:hidden text-[10px] font-bold text-slate-400 mb-1 block uppercase">Qty</label>
                                            <input
                                                type="number"
                                                value={screen.screenQty}
                                                onChange={e => updateScreenProp(index, 'screenQty', e.target.value)}
                                                className="w-full p-2 text-center text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:border-teal-500 outline-none"
                                                placeholder="Qty"
                                            />
                                        </div>

                                        {/* 5. Sizing Dropdown */}
                                        <div className="col-span-2 md:col-span-2">
                                            <label className="md:hidden text-[10px] font-bold text-slate-400 mb-1 block uppercase">Sizing</label>
                                            <select
                                                value={screen.sizingMode}
                                                onChange={e => updateScreenProp(index, 'sizingMode', e.target.value)}
                                                className="w-full p-2 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-white outline-none"
                                            >
                                                <option value="closest">Auto</option>
                                                <option value="exact">Exact</option>
                                            </select>
                                        </div>

                                        {/* 6. Desktop Actions (Hidden on Mobile) */}
                                        <div className="hidden md:flex col-span-1 justify-end gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const n = [...state.screens];
                                                    const newId = Math.random().toString(36).substr(2, 9);
                                                    n.splice(index + 1, 0, { ...n[index], id: newId });
                                                    setState({ ...state, screens: n, activeScreenIndex: index + 1 });
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                                title="Duplicate"
                                            >
                                                <Copy size={14} />
                                            </button>
                                            {state.screens.length > 1 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const n = state.screens.filter((_, i) => i !== index);
                                                        setState({ ...state, screens: n, activeScreenIndex: Math.max(0, index - 1) });
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Detailed Table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <details className="group p-4" open>
                        <summary className="flex justify-between items-center cursor-pointer list-none">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Box className="w-4 h-4 text-teal-600" /> Hardware & Cost Breakdown
                                {state.screens.length > 1 && (
                                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                                        (Screen #{state.activeScreenIndex + 1} of {state.screens.length})
                                    </span>
                                )}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-teal-600 text-xs font-bold group-open:hidden">Show Table</span>
                                <span className="text-slate-400 text-xs hidden group-open:block">Hide Table</span>
                            </div>
                        </summary>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            {state.screens.length > 1 && (
                                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                    {state.screens.map((screen, index) => {
                                        const isActive = state.activeScreenIndex === index;
                                        const screenLabel = screen.targetWidth && screen.targetHeight
                                            ? `${screen.targetWidth}×${screen.targetHeight}${unit} (×${screen.screenQty})`
                                            : `Screen #${index + 1}`;

                                        return (
                                            <button
                                                key={screen.id}
                                                onClick={() => updateState('activeScreenIndex', index)}
                                                className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-all ${isActive
                                                    ? 'bg-teal-600 text-white shadow-lg'
                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span>#{index + 1}</span>
                                                    <span className="text-[10px] opacity-75">{screenLabel}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {state.screens[state.activeScreenIndex] && (
                                <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                        <div>
                                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Dimensions:</span>
                                            <span className="ml-2 font-bold text-slate-800 dark:text-white">
                                                {state.screens[state.activeScreenIndex].targetWidth || 0} × {state.screens[state.activeScreenIndex].targetHeight || 0} {unit}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Quantity:</span>
                                            <span className="ml-2 font-bold text-teal-600 dark:text-teal-400">
                                                {state.screens[state.activeScreenIndex].screenQty || 0} screens
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 dark:text-slate-400 font-semibold">Sizing:</span>
                                            <span className="ml-2 font-bold text-slate-800 dark:text-white capitalize">
                                                {state.screens[state.activeScreenIndex].sizingMode}
                                            </span>
                                        </div>
                                        {calculation && (
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400 font-semibold">Final Size:</span>
                                                <span className="ml-2 font-bold text-slate-800 dark:text-white">
                                                    {calculation.finalWidth} × {calculation.finalHeight} m
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <InteractiveCostSheet
                                calculation={calculation}
                                state={state}
                                updateState={updateState}
                                updateExtra={updateExtra}
                                updateScreenProp={updateScreenProp}
                                inventory={inventory}
                                getStock={getStock}
                                overrides={state.screens[state.activeScreenIndex]?.overrides || {}}
                                onOverride={onOverride}
                                editingRow={state.screens[state.activeScreenIndex]?.editingRow}
                                setEditingRow={(id) => updateScreenProp(state.activeScreenIndex, 'editingRow', id)}
                                onClearOverride={onClearOverride}
                            />
                        </div>
                    </details>
                </div>

                {/* Terms */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <details className="group p-4">
                        <summary className="flex justify-between items-center cursor-pointer list-none">
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Terms & Conditions</span>
                            <span className="text-teal-600 text-xs group-open:hidden">Show Details</span>
                        </summary>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <div><label className="text-[10px] uppercase font-bold text-slate-400">Price Basis</label><input value={state.terms?.price} onChange={e => setState(p => ({ ...p, terms: { ...p.terms, price: e.target.value } }))} className="w-full p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" /></div>
                            <div><label className="text-[10px] uppercase font-bold text-slate-400">Delivery Weeks</label><input type="number" value={state.terms?.deliveryWeeks} onChange={e => setState(p => ({ ...p, terms: { ...p.terms, deliveryWeeks: e.target.value } }))} className="w-full p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" /></div>
                            <div className="col-span-1 md:col-span-2">
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Payment Milestones</label>
                                {(state.terms?.payment || []).map((ms, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2">
                                        <input value={ms.name} onChange={e => { const n = [...state.terms.payment]; n[idx].name = e.target.value; setState(p => ({ ...p, terms: { ...p.terms, payment: n } })); }} className="flex-1 p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Milestone Name" />
                                        <input type="number" value={ms.percent} onChange={e => { const n = [...state.terms.payment]; n[idx].percent = Number(e.target.value); setState(p => ({ ...p, terms: { ...p.terms, payment: n } })); }} className="w-16 p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="%" />
                                        <button onClick={() => { const n = state.terms.payment.filter((_, i) => i !== idx); setState(p => ({ ...p, terms: { ...p.terms, payment: n } })); }} className="text-red-400"><X size={14} /></button>
                                    </div>
                                ))}
                                <button onClick={() => setState(p => ({ ...p, terms: { ...p.terms, payment: [...(p.terms.payment || []), { name: '', percent: 0 }] } }))} className="text-xs text-teal-600 font-bold">+ Add Milestone</button>
                            </div>

                            {/* New Editable Text Areas */}
                            <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400">Validity</label>
                                    <input value={state.terms?.validity} onChange={e => setState(p => ({ ...p, terms: { ...p.terms, validity: e.target.value } }))} className="w-full p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400">Warranty Terms</label>
                                    <textarea rows={4} value={state.terms?.warranty} onChange={e => setState(p => ({ ...p, terms: { ...p.terms, warranty: e.target.value } }))} className="w-full p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400 mb-2 block">Client Scope of Work</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {Object.entries(state.terms?.scope || {}).map(([key, val]) => (
                                            <div key={key}>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">{key === 'elec' ? 'Electricity' : key === 'net' ? 'Internet' : key === 'soft' ? 'Software' : key === 'perm' ? 'Permissions' : key === 'pc' ? 'Computer' : key}</span>
                                                <textarea rows={2} value={val} onChange={e => setState(p => ({ ...p, terms: { ...p.terms, scope: { ...p.terms.scope, [key]: e.target.value } } }))} className="w-full p-2 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </details>
                </div>
                <div className="h-10"></div>
            </div>

            {/* --- Right Column (Sticky) --- */}
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-5 bg-gradient-to-br from-slate-50 to-white dark:from-slate-700 dark:to-slate-800">
                        {state.screens.length > 1 && allScreensTotal && (
                            <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-600">
                                <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Project Summary</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Screen Types</div>
                                        <div className="font-bold text-blue-800 dark:text-blue-300">{state.screens.length}</div>
                                    </div>
                                    <div className="bg-teal-50 dark:bg-teal-900/20 p-2 rounded">
                                        <div className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">Total Qty</div>
                                        <div className="font-bold text-teal-800 dark:text-teal-300">{allScreensTotal.totalScreenQty}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Margin Strategy</label>
                            <select
                                value={state.pricingMode || 'margin'}
                                onChange={e => {
                                    const newMode = e.target.value;
                                    updateState('pricingMode', newMode);
                                    if (newMode !== 'margin' && calculation) {
                                        let newTarget = 0;
                                        if (newMode === 'screen') newTarget = calculation.matrix.sell.unit;
                                        else if (newMode === 'sqft') newTarget = calculation.matrix.sell.sqft;
                                        else if (newMode === 'sqm') newTarget = calculation.matrix.sell.sqft * 10.7639;
                                        updateState('targetSellPrice', Math.round(newTarget));
                                    }
                                }}
                                className="text-xs border-none bg-transparent font-bold text-teal-600 dark:text-teal-400 focus:ring-0 cursor-pointer outline-none"
                            >
                                <option value="margin">Margin %</option>
                                <option value="sqft">Price / Sq.Ft</option>
                                <option value="sqm">Price / Sq.Mtr</option>
                                <option value="screen">Price / Screen</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 mb-6">
                            <input
                                type="number"
                                value={state.pricingMode === 'margin' ? margin : state.targetSellPrice}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (state.pricingMode === 'margin') updateState('margin', val);
                                    else updateState('targetSellPrice', val);
                                }}
                                className="w-24 text-center text-xl font-bold p-2 border rounded-lg bg-white dark:bg-slate-600 dark:border-slate-500 shadow-sm focus:ring-2 focus:ring-teal-500/50 outline-none dark:text-white"
                            />
                            <span className="text-lg font-bold text-slate-400">{state.pricingMode === 'margin' ? '%' : ''}</span>
                            <div className="flex-1 text-right">
                                <div className="text-[10px] text-slate-400 uppercase font-bold">
                                    {state.screens.length > 1 ? 'Total Profit' : 'Est. Profit'}
                                </div>
                                <div className={`text-sm font-bold ${(allScreensTotal ? allScreensTotal.totalMargin : (calculation?.matrix.margin.total || 0)) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {allScreensTotal
                                        ? formatCurrency(allScreensTotal.totalMargin, 'INR')
                                        : (calculation ? formatCurrency(calculation.matrix.margin.total, 'INR') : '-')}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-600">
                            {state.screens.length > 1 ? (
                                <>
                                    <div className="flex justify-between items-end">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">LED Panels (All)</span>
                                        <span className="font-bold text-slate-800 dark:text-white">
                                            {allScreensTotal ? formatCurrency(allScreensTotal.totalLEDSell, 'INR') : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">Services & Extras</span>
                                        <span className="font-bold text-slate-800 dark:text-white">
                                            {allScreensTotal ? formatCurrency(allScreensTotal.totalServicesSell, 'INR') : '-'}
                                        </span>
                                    </div>
                                    <details className="group">
                                        <summary className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase cursor-pointer hover:underline">
                                            View Screen Breakdown
                                        </summary>
                                        <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-200 dark:border-slate-600">
                                            {allScreensTotal?.calculations.map((calc, index) => (
                                                <div key={index} className="text-xs">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500 dark:text-slate-400">
                                                            Screen #{index + 1}
                                                            <span className="text-[10px] ml-1">
                                                                ({state.screens[index].targetWidth}×{state.screens[index].targetHeight}{unit} ×{calc.screenQty})
                                                            </span>
                                                        </span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">
                                                            {formatCurrency(calc.totalProjectSell, 'INR')}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-between items-end">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">LED Panel Price</span>
                                        <span className="font-bold text-slate-800 dark:text-white">
                                            {calculation ? formatCurrency(calculation.matrix.led.sell * calculation.screenQty, 'INR') : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">Services & Extras</span>
                                        <span className="font-bold text-slate-800 dark:text-white">
                                            {calculation ? formatCurrency((calculation.matrix.sell.total - (calculation.matrix.led.sell * calculation.screenQty)), 'INR') : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end pt-2 mt-2 border-t border-dashed border-slate-200 dark:border-slate-600">
                                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Rate / Sq.Ft</span>
                                        <span className="font-bold text-slate-500 dark:text-slate-400">
                                            {calculation ? formatCurrency(calculation.matrix.sell.sqft, 'INR') : '-'}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-900 p-5 text-white">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-slate-400">Grand Total (Ex. GST)</span>
                            {state.screens.length > 1 && (
                                <span className="text-xs text-teal-400 font-bold">{allScreensTotal?.totalScreenQty || 0} screens</span>
                            )}
                        </div>
                        <div className="flex justify-between items-baseline">
                            <span className="text-3xl font-bold tracking-tight">
                                {allScreensTotal
                                    ? formatCurrency(allScreensTotal.totalProjectSell, 'INR')
                                    : (calculation ? formatCurrency(calculation.totalProjectSell, 'INR') : '-')}
                            </span>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => setShowBOM(true)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors border border-slate-700 py-2">
                                <FileText size={16} className="text-blue-400" /> BOM
                            </button>
                            <button onClick={() => setShowPreview(true)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors border border-slate-700 py-2">
                                <Printer size={16} /> Print
                            </button>
                            {!readOnly && (
                                <button
                                    onClick={() => onSaveQuote(allScreensTotal ? allScreensTotal.totalProjectSell : calculation?.totalProjectSell)}
                                    className="flex-[2] bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg shadow-lg shadow-teal-900/20 transition-all flex justify-center items-center gap-2 py-2"
                                >
                                    <Save size={18} /> Save
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-xl shadow-lg p-6 text-white overflow-hidden relative min-h-[250px] flex items-center justify-center">
                    {calculation ? (
                        <div className="w-full h-full flex items-center justify-center p-4">
                            <ScreenVisualizer cols={calculation.gridCols} rows={calculation.gridRows} module={calculation.moduleType} cabinet={calculation.cabinetType} unit={unit} />
                        </div>
                    ) : (
                        <div className="text-slate-500 flex flex-col items-center"><Monitor size={32} className="mb-2 opacity-50" /><span>Enter dimensions</span></div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuoteCalculator;