import React, { useState, useEffect, useMemo } from 'react';
import { db, appId } from '../lib/firebase';
import { Package, Trash2, Edit2, Plus, Save, X, Ruler } from 'lucide-react';
import ShapeVisualizer from './ShapeVisualizer';

// ─── Material Densities (kg/mm³) ─────────────────────────────────────────────
// Sources: IS 875, ASTM A36, ASTM A240, IS 6362
const MATERIALS = {
  MS:    { label: 'MS (Mild Steel)',         density: 7.85e-6 }, // 7850 kg/m³
  AL:    { label: 'Aluminium (6061/6063)',   density: 2.70e-6 }, // 2700 kg/m³
  SS304: { label: 'SS 304 (Stainless)',      density: 8.00e-6 }, // 8000 kg/m³
};

// ─── Component Types ──────────────────────────────────────────────────────────
const COMPONENT_TYPES = [
  { value: 'flat_plate',    label: 'Flat Plate / Sheet',            fields: ['length','width','thickness'] },
  { value: 'round_bar',     label: 'Round Bar (Solid)',             fields: ['length','diameter'] },
  { value: 'square_bar',    label: 'Square Bar (Solid)',            fields: ['length','side'] },
  { value: 'rect_bar',      label: 'Rectangular Bar',              fields: ['length','width','height'] },
  { value: 'round_pipe',    label: 'Round Pipe / Tube (CHS)',       fields: ['length','od','wallThick'] },
  { value: 'square_hollow', label: 'Sq. Hollow Section (SHS)',     fields: ['length','side','wallThick'] },
  { value: 'rect_hollow',   label: 'Rect. Hollow Section (RHS)',   fields: ['length','width','height','wallThick'] },
  { value: 'equal_angle',   label: 'Equal Angle (L-Section)',      fields: ['length','leg','thickness'] },
  { value: 'unequal_angle', label: 'Unequal Angle',                fields: ['length','legA','legB','thickness'] },
  { value: 't_section',     label: 'T-Section / T-Beam',           fields: ['length','flangeWidth','totalHeight','flangeThick','webThick'] },
  { value: 'i_beam',        label: 'I-Beam / H-Section',           fields: ['length','totalHeight','flangeWidth','flangeThick','webThick'] },
  { value: 'channel',       label: 'Channel / C-Section',          fields: ['length','totalHeight','flangeWidth','webThick','flangeThick'] },
  { value: 'hex_bar',       label: 'Hexagonal Bar',                fields: ['length','acrossFlats'] },
];

const FIELD_META = {
  length:      { label: 'Length',          unit: 'mm' },
  width:       { label: 'Width',           unit: 'mm' },
  height:      { label: 'Height',          unit: 'mm' },
  thickness:   { label: 'Thickness',       unit: 'mm' },
  diameter:    { label: 'Diameter (OD)',   unit: 'mm' },
  side:        { label: 'Outer Side',      unit: 'mm' },
  od:          { label: 'Outer Diameter',  unit: 'mm' },
  wallThick:   { label: 'Wall Thickness',  unit: 'mm' },
  leg:         { label: 'Leg Length',      unit: 'mm' },
  legA:        { label: 'Leg A',           unit: 'mm' },
  legB:        { label: 'Leg B',           unit: 'mm' },
  flangeWidth: { label: 'Flange Width',    unit: 'mm' },
  totalHeight: { label: 'Total Height',    unit: 'mm' },
  flangeThick: { label: 'Flange Thick.',   unit: 'mm' },
  webThick:    { label: 'Web Thick.',      unit: 'mm' },
  acrossFlats: { label: 'Across Flats (A/F)', unit: 'mm' },
};

// ─── Volume Calculation (returns mm³) ────────────────────────────────────────
const calcVolumeMm3 = (type, s) => {
  const π = Math.PI;
  const n = (v) => Number(v) || 0;
  switch (type) {
    case 'flat_plate':
      return n(s.length) * n(s.width) * n(s.thickness);
    case 'round_bar':
      return (π / 4) * n(s.diameter) ** 2 * n(s.length);
    case 'square_bar':
      return n(s.side) ** 2 * n(s.length);
    case 'rect_bar':
      return n(s.width) * n(s.height) * n(s.length);
    case 'round_pipe': {
      const id = n(s.od) - 2 * n(s.wallThick);
      return (π / 4) * (n(s.od) ** 2 - Math.max(id, 0) ** 2) * n(s.length);
    }
    case 'square_hollow': {
      const inner = n(s.side) - 2 * n(s.wallThick);
      return (n(s.side) ** 2 - Math.max(inner, 0) ** 2) * n(s.length);
    }
    case 'rect_hollow': {
      const iw = n(s.width) - 2 * n(s.wallThick);
      const ih = n(s.height) - 2 * n(s.wallThick);
      return (n(s.width) * n(s.height) - Math.max(iw, 0) * Math.max(ih, 0)) * n(s.length);
    }
    case 'equal_angle':
      // Area = (2 × leg × t) − t² (overlap at corner)
      return (2 * n(s.leg) * n(s.thickness) - n(s.thickness) ** 2) * n(s.length);
    case 'unequal_angle':
      // Area = (legA + legB − t) × t
      return ((n(s.legA) + n(s.legB) - n(s.thickness)) * n(s.thickness)) * n(s.length);
    case 't_section':
      // Area = flange_w × flange_t + (H − flange_t) × web_t
      return (n(s.flangeWidth) * n(s.flangeThick) + (n(s.totalHeight) - n(s.flangeThick)) * n(s.webThick)) * n(s.length);
    case 'i_beam':
      // Area = 2 × flange_w × flange_t + (H − 2×flange_t) × web_t
      return (2 * n(s.flangeWidth) * n(s.flangeThick) + (n(s.totalHeight) - 2 * n(s.flangeThick)) * n(s.webThick)) * n(s.length);
    case 'channel':
      // Area = 2 × flange_w × flange_t + (H − 2×flange_t) × web_t
      return (2 * n(s.flangeWidth) * n(s.flangeThick) + (n(s.totalHeight) - 2 * n(s.flangeThick)) * n(s.webThick)) * n(s.length);
    case 'hex_bar':
      // Area = (√3/2) × AF²  where AF = across-flats dimension
      return (Math.sqrt(3) / 2) * n(s.acrossFlats) ** 2 * n(s.length);
    default:
      return 0;
  }
};

export const calcItemWeight = (item) => {
  if (!item?.componentType || !item?.material) return 0;
  const vol = calcVolumeMm3(item.componentType, item.specs || {});
  const density = MATERIALS[item.material]?.density || 0;
  return vol * density; // kg
};

const specsSummary = (type, specs) => {
  const t = COMPONENT_TYPES.find(c => c.value === type);
  if (!t) return '—';
  return t.fields
    .map(f => (specs?.[f] ? `${FIELD_META[f]?.label}: ${specs[f]}` : null))
    .filter(Boolean)
    .join(' | ') || '—';
};

const fmt = (n, d = 2) => (Number(n) || 0).toFixed(d);
const fmtCurr = (n) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const defaultForm = () => ({
  id: null,
  description: '',
  componentType: 'round_pipe',
  material: 'MS',
  specs: {},
  qty: 1,
  ratePerKg: '',
});

// ─── Main Component ───────────────────────────────────────────────────────────
const StructuralPlanner = ({ user, perms = {} }) => {
  const canEdit   = perms['structural.addEdit'];
  const canDelete = perms['structural.delete'];
  const canSave   = perms['structural.save'];

  const [items, setItems]               = useState([]);
  const [projectName, setProjectName]   = useState('');
  const [savedProjects, setSavedProjects] = useState([]);
  const [activeTab, setActiveTab]       = useState('calculator');
  const [showModal, setShowModal]       = useState(false);
  const [form, setForm]                 = useState(defaultForm());
  const [editingId, setEditingId]       = useState(null);

  // Firebase: load saved projects
  useEffect(() => {
    const unsub = db
      .collection('artifacts').doc(appId)
      .collection('public').doc('data')
      .collection('structural_projects')
      .orderBy('updatedAt', 'desc')
      .onSnapshot(snap => {
        setSavedProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {
        // Fallback if index not ready: load without ordering
        db.collection('artifacts').doc(appId)
          .collection('public').doc('data')
          .collection('structural_projects')
          .onSnapshot(snap => {
            setSavedProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          });
      });
    return () => unsub();
  }, []);

  // Totals
  const totals = useMemo(() => items.reduce((acc, item) => {
    const uw = calcItemWeight(item);
    const qty = Number(item.qty) || 0;
    acc.totalWeight += uw * qty;
    acc.totalCost   += uw * Number(item.ratePerKg || 0) * qty;
    return acc;
  }, { totalWeight: 0, totalCost: 0 }), [items]);

  // Live preview for modal
  const modalPreview = useMemo(() => {
    const uw  = calcItemWeight(form);
    const qty = Number(form.qty) || 0;
    const uc  = uw * Number(form.ratePerKg || 0);
    return { unitWeight: uw, unitCost: uc, totalWeight: uw * qty, totalCost: uc * qty };
  }, [form]);

  const currentType = COMPONENT_TYPES.find(t => t.value === form.componentType);

  const openAdd = () => { setForm(defaultForm()); setEditingId(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ ...item }); setEditingId(item.id); setShowModal(true); };

  const saveItem = () => {
    if (!form.description.trim()) { alert('Please enter a description.'); return; }
    if (editingId) {
      setItems(prev => prev.map(i => i.id === editingId ? { ...form, id: editingId } : i));
    } else {
      setItems(prev => [...prev, { ...form, id: Date.now().toString() }]);
    }
    setShowModal(false);
  };

  const deleteItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const saveProject = async () => {
    if (!projectName.trim()) { alert('Please enter a project name.'); return; }
    try {
      await db.collection('artifacts').doc(appId)
        .collection('public').doc('data')
        .collection('structural_projects')
        .add({ name: projectName.trim(), items, createdBy: user?.uid || '', createdAt: new Date(), updatedAt: new Date() });
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  };

  const loadProject = (project) => {
    if (items.length > 0 && !window.confirm('Replace current BOM with this project?')) return;
    setItems(project.items || []);
    setProjectName(project.name || '');
    setActiveTab('calculator');
  };

  const deleteProject = async (id) => {
    if (!window.confirm('Delete this saved project?')) return;
    await db.collection('artifacts').doc(appId)
      .collection('public').doc('data')
      .collection('structural_projects').doc(id).delete();
  };

  const clearBOM = () => {
    if (items.length === 0) return;
    if (window.confirm('Clear all items from the current BOM?')) { setItems([]); setProjectName(''); }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Ruler size={20} className="text-cyan-500" />
          <h2 className="text-base sm:text-xl font-bold text-slate-800 dark:text-slate-100">Structural Planner</h2>
          <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">MS / Aluminium / SS304</span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('calculator')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg font-medium transition-colors ${activeTab === 'calculator' ? 'bg-cyan-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
          >
            Calculator
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg font-medium transition-colors ${activeTab === 'saved' ? 'bg-cyan-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
          >
            Saved ({savedProjects.length})
          </button>
        </div>
      </div>

      {/* ── Calculator Tab ── */}
      {activeTab === 'calculator' && (
        <>
          {/* Project bar */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Project / BOM name..."
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400"
            />
            {canSave && (
              <button
                onClick={saveProject}
                className="flex items-center gap-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                <Save size={14} /> Save
              </button>
            )}
            {canEdit && (
              <button
                onClick={openAdd}
                className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                <Plus size={14} /> Add Item
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={clearBOM}
                className="flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-sm rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {/* Material density reference */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(MATERIALS).map(([k, v]) => (
              <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                {v.label}: {(v.density * 1e6).toFixed(2)} g/cm³
              </span>
            ))}
          </div>

          {/* Empty state */}
          {items.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500">
              <Package size={44} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No items in BOM</p>
              <p className="text-xs">Click "Add Item" to add pipes, angles, sheets, beams and more.</p>
            </div>
          ) : (
            <>
              {/* BOM table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <table className="w-full text-xs sm:text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wide">
                      <th className="px-2 sm:px-3 py-2.5 text-left">#</th>
                      <th className="px-2 sm:px-3 py-2.5 text-left">Description</th>
                      <th className="px-2 sm:px-3 py-2.5 text-left">Type</th>
                      <th className="px-2 sm:px-3 py-2.5 text-left">Mat.</th>
                      <th className="px-2 sm:px-3 py-2.5 text-left hidden lg:table-cell">Key Specs</th>
                      <th className="px-2 sm:px-3 py-2.5 text-right">Qty</th>
                      <th className="px-2 sm:px-3 py-2.5 text-right">Rate/kg</th>
                      <th className="px-2 sm:px-3 py-2.5 text-right">Unit Wt (kg)</th>
                      <th className="px-2 sm:px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-2 sm:px-3 py-2.5 text-right">Total Wt (kg)</th>
                      <th className="px-2 sm:px-3 py-2.5 text-right">Total Cost</th>
                      <th className="px-2 sm:px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const uw  = calcItemWeight(item);
                      const qty = Number(item.qty) || 0;
                      const uc  = uw * Number(item.ratePerKg || 0);
                      const typeMeta = COMPONENT_TYPES.find(t => t.value === item.componentType);
                      return (
                        <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-2 sm:px-3 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-2 sm:px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 max-w-[140px] truncate">{item.description}</td>
                          <td className="px-2 sm:px-3 py-2 text-slate-500 dark:text-slate-400 text-[11px]">{typeMeta?.label || item.componentType}</td>
                          <td className="px-2 sm:px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.material === 'MS'    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                              item.material === 'AL'    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                                                          'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}>
                              {item.material}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-[11px] text-slate-400 hidden lg:table-cell max-w-[200px] truncate">
                            {specsSummary(item.componentType, item.specs)}
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right text-slate-700 dark:text-slate-300">{qty}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-slate-600 dark:text-slate-400">{item.ratePerKg ? fmtCurr(item.ratePerKg) : '—'}</td>
                          <td className="px-2 sm:px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-200">{fmt(uw, 3)}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-slate-700 dark:text-slate-300">{uc > 0 ? fmtCurr(uc) : '—'}</td>
                          <td className="px-2 sm:px-3 py-2 text-right font-mono font-semibold text-cyan-700 dark:text-cyan-300">{fmt(uw * qty, 2)}</td>
                          <td className="px-2 sm:px-3 py-2 text-right font-semibold text-teal-700 dark:text-teal-400">{uc > 0 ? fmtCurr(uc * qty) : '—'}</td>
                          <td className="px-2 sm:px-3 py-2">
                            <div className="flex gap-0.5 justify-end">
                              {canEdit && (
                                <button onClick={() => openEdit(item)} className="p-1.5 text-slate-400 hover:text-blue-500 rounded transition-colors" title="Edit">
                                  <Edit2 size={13} />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={() => deleteItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors" title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-500">
                      <td colSpan={9} className="px-2 sm:px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                        Grand Total
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-right font-bold font-mono text-cyan-700 dark:text-cyan-300 text-sm">
                        {fmt(totals.totalWeight, 2)} kg
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-right font-bold text-teal-700 dark:text-teal-300 text-sm">
                        {totals.totalCost > 0 ? fmtCurr(totals.totalCost) : '—'}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Summary cards */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="Line Items"    value={items.length} />
                <SummaryCard label="Total Units"   value={items.reduce((a, i) => a + (Number(i.qty) || 0), 0)} />
                <SummaryCard label="Total Weight"  value={`${fmt(totals.totalWeight, 2)} kg`}  accent="text-cyan-600 dark:text-cyan-400" />
                <SummaryCard label="Total Cost"    value={totals.totalCost > 0 ? fmtCurr(totals.totalCost) : '—'} accent="text-teal-600 dark:text-teal-400" />
              </div>
            </>
          )}
        </>
      )}

      {/* ── Saved Projects Tab ── */}
      {activeTab === 'saved' && (
        <SavedProjectsView
          projects={savedProjects}
          onLoad={loadProject}
          onDelete={deleteProject}
          canDelete={canDelete}
        />
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <ItemModal
          form={form}
          setForm={setForm}
          onSave={saveItem}
          onClose={() => setShowModal(false)}
          isEdit={!!editingId}
          preview={modalPreview}
          currentType={currentType}
        />
      )}
    </div>
  );
};

// ─── Summary Card ─────────────────────────────────────────────────────────────
const SummaryCard = ({ label, value, accent = 'text-slate-800 dark:text-slate-100' }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4">
    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">{label}</p>
    <p className={`text-lg sm:text-2xl font-bold ${accent}`}>{value}</p>
  </div>
);

// ─── Saved Projects View ──────────────────────────────────────────────────────
const SavedProjectsView = ({ projects, onLoad, onDelete, canDelete }) => {
  if (projects.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400 dark:text-slate-500">
        <Save size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No saved projects yet.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map(p => {
        const tw = (p.items || []).reduce((a, i) => a + calcItemWeight(i) * (Number(i.qty) || 0), 0);
        const tc = (p.items || []).reduce((a, i) => a + calcItemWeight(i) * Number(i.ratePerKg || 0) * (Number(i.qty) || 0), 0);
        const saved = p.updatedAt?.toDate ? p.updatedAt.toDate() : (p.updatedAt ? new Date(p.updatedAt) : null);
        return (
          <div key={p.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{p.name}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {(p.items || []).length} items · {tw.toFixed(1)} kg{tc > 0 ? ` · ${fmtCurr(tc)}` : ''}
              </p>
              {saved && <p className="text-[10px] text-slate-400 mt-0.5">{saved.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
            </div>
            <div className="flex gap-2 mt-auto">
              <button onClick={() => onLoad(p)} className="flex-1 text-xs py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors">
                Load
              </button>
              {canDelete && (
                <button onClick={() => onDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg border border-slate-200 dark:border-slate-600 hover:border-red-300">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Item Modal ───────────────────────────────────────────────────────────────
const ItemModal = ({ form, setForm, onSave, onClose, isEdit, preview, currentType }) => {
  const setSpec  = (field, val) => setForm(f => ({ ...f, specs: { ...f.specs, [field]: val } }));
  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleTypeChange = (newType) => {
    // Reset specs when type changes to avoid stale values misleading the calculation
    setForm(f => ({ ...f, componentType: newType, specs: {} }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">{isEdit ? 'Edit Component' : 'Add Component'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Description *</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="e.g. Main Frame, Cross Brace, Base Plate..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Type + Material */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Component Type</label>
              <select
                value={form.componentType}
                onChange={e => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {COMPONENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Material</label>
              <select
                value={form.material}
                onChange={e => setField('material', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {Object.entries(MATERIALS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} — {(v.density * 1e6).toFixed(2)} g/cm³</option>
                ))}
              </select>
            </div>
          </div>

          {/* Shape visualizer */}
          {currentType && (
            <ShapeVisualizer componentType={form.componentType} specs={form.specs} />
          )}

          {/* Dynamic dimension fields */}
          {currentType && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Dimensions <span className="font-normal text-slate-400">(all in mm)</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {currentType.fields.map(f => (
                  <div key={f}>
                    <label className="block text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">
                      {FIELD_META[f]?.label}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.specs[f] ?? ''}
                      onChange={e => setSpec(f, e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Qty + Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Quantity (units)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.qty}
                onChange={e => setField('qty', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Rate per kg (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.ratePerKg}
                onChange={e => setField('ratePerKg', e.target.value)}
                placeholder="e.g. 85"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Live preview */}
          {preview.unitWeight > 0 && (
            <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700 rounded-xl p-3">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-cyan-600 dark:text-cyan-400 mb-2">Live Preview</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Unit Weight:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{fmt(preview.unitWeight, 4)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Unit Cost:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{preview.unitCost > 0 ? fmtCurr(preview.unitCost) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Weight:</span>
                  <span className="font-bold text-cyan-700 dark:text-cyan-300">{fmt(preview.totalWeight, 3)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Cost:</span>
                  <span className="font-bold text-teal-700 dark:text-teal-300">{preview.totalCost > 0 ? fmtCurr(preview.totalCost) : '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button onClick={onSave} className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors">
            {isEdit ? 'Update Item' : 'Add to BOM'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StructuralPlanner;
