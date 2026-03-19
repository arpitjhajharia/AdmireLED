import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, appId } from '../lib/firebase';
import {
    ArrowLeft, Globe, MapPin, Phone, Mail,
    Plus, Edit2, CheckCircle2, MoreVertical, Trash2, X, Save,
    ShoppingBag, FileText, CheckSquare, Landmark,
    Building2, User, ChevronDown, ChevronRight,
    TrendingUp, Clock, AlertCircle, Loader2, Calculator
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────────────

const CONTACT_ROLES = ['Owner', 'Purchase Manager', 'Sales', 'Accounts', 'Site Supervisor', 'Other'];
const QUOTE_STATUSES = ['Draft', 'Sent', 'Revised', 'Approved', 'Expired', 'Rejected'];
const MILESTONE_STATUSES = ['Upcoming', 'Pending', 'Paid'];
const PRIORITY_LABELS = { Urgent: 'bg-red-500', High: 'bg-orange-400', Normal: 'bg-sky-400', Low: 'bg-slate-300' };

const quoteStatusStyle = {
    Draft:    'bg-slate-100 text-slate-500 border border-slate-200',
    Sent:     'bg-blue-50 text-blue-600 border border-blue-100',
    Revised:  'bg-amber-50 text-amber-600 border border-amber-100',
    Approved: 'bg-teal-50 text-teal-600 border border-teal-100',
    Expired:  'bg-slate-100 text-slate-400 border border-slate-200',
    Rejected: 'bg-red-50 text-red-400 border border-red-100',
};

const milestoneStatusStyle = {
    Paid:     'text-teal-600 bg-teal-50 border-teal-100',
    Pending:  'text-amber-600 bg-amber-50 border-amber-100',
    Upcoming: 'text-slate-400 bg-slate-50 border-slate-200',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseRef = () => db.collection('artifacts').doc(appId).collection('public').doc('data');
const leadRef = (leadId) => baseRef().collection('crm_leads').doc(leadId);
const contactsRef = (leadId) => leadRef(leadId).collection('contacts');
const quotesRef = (leadId) => leadRef(leadId).collection('quotes');
const posRef = (leadId) => leadRef(leadId).collection('purchase_orders');
const tasksRef = () => baseRef().collection('tasks');

const fmtDate = (val) => {
    if (!val) return '';
    const d = val.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

const fmtNum = (n) => {
    const v = Number(n);
    if (!n || isNaN(v)) return '';
    return new Intl.NumberFormat('en-IN').format(v);
};

const fmtDateShort = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d) ? dateStr : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const fmt = (n) => {
    const v = Number(n);
    if (!n || isNaN(v)) return '-';
    if (v >= 100000) return '₹' + (v / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L';
    return '₹' + new Intl.NumberFormat('en-IN').format(v);
};

const todayStr = () => new Date().toISOString().split('T')[0];

// ─── Modals ─────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">{title}</h3>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4 pb-10 sm:pb-5">{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</label>
            {children}
        </div>
    );
}

const inputCls = "w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/40 text-slate-800";
const selectCls = `${inputCls} bg-white`;

// ─── Contact Modal ─────────────────────────────────────────────────────────

function ContactModal({ leadId, contact, onClose }) {
    const [form, setForm] = useState({ name: '', role: 'Owner', phone: '', email: '', ...contact });
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!form.name?.trim()) return;
        setSaving(true);
        try {
            const data = { name: form.name.trim(), role: form.role, phone: form.phone?.trim() || '', email: form.email?.trim() || '', updatedAt: new Date() };
            if (contact?.id) {
                await contactsRef(leadId).doc(contact.id).update(data);
            } else {
                await contactsRef(leadId).add({ ...data, createdAt: new Date() });
            }
            onClose();
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <Modal title={contact?.id ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
            <Field label="Name"><input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" /></Field>
            <Field label="Role"><input className={inputCls} value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Owner, Purchase Manager, Accounts…" /></Field>
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98200 xxxxx" /></Field>
            <Field label="Email"><input className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@company.com" /></Field>
            <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                </button>
            </div>
        </Modal>
    );
}

// ─── Quote Modal ────────────────────────────────────────────────────────────

const emptyItem = () => ({ product: '', qty: '', uom: '', rate: '', amount: '' });

function QuoteModal({ leadId, quote, onClose }) {
    const defaultItems = quote?.items?.length ? quote.items : [emptyItem()];
    const [form, setForm] = useState({
        ref: '', status: 'Sent', notes: '', projectName: '', gstPct: '18',
        ...quote,
        items: defaultItems,
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const setItem = (i, k, v) => {
        setForm(f => {
            const items = [...f.items];
            const updated = { ...items[i], [k]: v };
            if (k === 'qty' || k === 'rate') {
                const qty = Number(k === 'qty' ? v : updated.qty) || 0;
                const rate = Number(k === 'rate' ? v : updated.rate) || 0;
                if (qty && rate) updated.amount = parseFloat((qty * rate).toFixed(2));
            }
            items[i] = updated;
            return { ...f, items };
        });
    };
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    const subtotal = form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const gst = Number(form.gstPct) || 0;
    const taxAmount = parseFloat((subtotal * gst / 100).toFixed(2));
    const grandTotal = parseFloat((subtotal + taxAmount).toFixed(2));

    const buildData = () => ({
        ref: form.ref?.trim() || '',
        status: form.status,
        notes: form.notes?.trim() || '',
        projectName: form.projectName?.trim() || '',
        gstPct: gst,
        items: form.items.map(it => ({
            product: it.product?.trim() || '',
            qty: Number(it.qty) || 0,
            uom: it.uom?.trim() || '',
            rate: Number(it.rate) || 0,
            amount: Number(it.amount) || 0,
        })),
        subtotal,
        taxAmount,
        grandTotal,
        amount: grandTotal,
        updatedAt: new Date(),
    });

    const handleSave = async (asNewVersion = false) => {
        if (!form.items.some(it => it.product?.trim())) return;
        setSaving(true);
        try {
            const data = buildData();
            if (quote?.id && !asNewVersion) {
                // Edit original in place
                await quotesRef(leadId).doc(quote.id).update(data);
            } else {
                // New quote OR "Save as Version" — always creates a new doc (same ref = new version)
                await quotesRef(leadId).add({ ...data, date: todayStr(), createdAt: new Date() });
            }
            onClose();
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl sm:my-4 max-h-[95vh] overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm">{quote?.id ? 'Edit Quote' : 'New Quote'}</h3>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Quote Ref"><input className={inputCls} value={form.ref} onChange={e => set('ref', e.target.value)} placeholder="Q-1024 (same ref = new version)" /></Field>
                        <Field label="GST %"><input type="number" className={inputCls} value={form.gstPct} onChange={e => set('gstPct', e.target.value)} placeholder="18" /></Field>
                        <Field label="Status">
                            <select className={selectCls} value={form.status} onChange={e => set('status', e.target.value)}>
                                {QUOTE_STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </Field>
                    </div>
                    <Field label="Project Name"><input className={inputCls} value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="e.g. BKC Billboard Phase 2" /></Field>

                    {/* Line items */}
                    <div className="pt-1">
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Line Items</label>
                            <button onClick={addItem} className="text-[11px] text-violet-600 font-bold flex items-center gap-0.5 hover:underline"><Plus size={10} /> Add Row</button>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap min-w-[140px]">Product / Description</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-14 shrink-0 text-center">Qty</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-14 shrink-0 text-center">UOM</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-20 shrink-0 text-right">Rate</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-20 shrink-0 text-right">Amount</span>
                        </div>
                        <div className="space-y-3">
                            {form.items.map((it, i) => (
                                <div key={i} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 sm:flex-row sm:items-center sm:bg-transparent sm:p-0 sm:border-0 sm:gap-1.5">
                                    <div className="flex-1 min-w-0">
                                        <textarea 
                                            className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-400 focus:outline-none bg-white font-medium resize-none min-h-[34px] leading-tight"
                                            value={it.product} 
                                            onChange={e => setItem(i, 'product', e.target.value)} 
                                            placeholder="Product or service description"
                                            rows={1}
                                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                                        <div className="flex flex-col sm:flex-row gap-1">
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest min-w-[28px]">Qty</span>
                                                <input type="number" className="w-full sm:w-14 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-center" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest min-w-[28px]">UOM</span>
                                                <input className="w-full sm:w-14 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-center uppercase" value={it.uom} onChange={e => setItem(i, 'uom', e.target.value)} placeholder="Nos" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-1">
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest min-w-[28px]">Rate</span>
                                                <input type="number" className="w-full sm:w-20 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-right" value={it.rate} onChange={e => setItem(i, 'rate', e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-violet-50 border border-violet-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-violet-400 uppercase tracking-widest min-w-[28px]">Total</span>
                                                <input type="number" className="w-full sm:w-24 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-right font-bold text-violet-700 bg-white sm:bg-transparent" value={it.amount} readOnly placeholder="0" />
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeItem(i)} className="flex items-center justify-center gap-1.5 w-full sm:w-8 py-1.5 sm:py-0 border border-red-50 sm:border-0 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 transition-all font-bold text-[10px] uppercase sm:normal-case">
                                        <X size={14} /> <span className="sm:hidden">Remove Item</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                        {/* Totals */}
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                            <div className="flex justify-end gap-8">
                                <span className="text-[11px] text-slate-400">Subtotal</span>
                                <span className="text-[11px] tabular-nums text-slate-600 w-28 text-right">₹{fmtNum(subtotal)}</span>
                            </div>
                            <div className="flex justify-end gap-8">
                                <span className="text-[11px] text-slate-400">GST ({gst}%)</span>
                                <span className="text-[11px] tabular-nums text-slate-600 w-28 text-right">₹{fmtNum(taxAmount)}</span>
                            </div>
                            <div className="flex justify-end gap-8 pt-1 border-t border-slate-100">
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Grand Total</span>
                                <span className="text-[11px] font-bold tabular-nums text-slate-800 w-28 text-right">₹{fmtNum(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" /></Field>
                    <div className="flex gap-2 pt-1">
                        <button onClick={onClose} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                        {quote?.id ? (
                            <>
                                <button onClick={() => handleSave(false)} disabled={saving} className="flex-1 py-1.5 rounded-lg border border-violet-300 text-violet-700 text-[11px] font-semibold hover:bg-violet-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-1">
                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Edit Original
                                </button>
                                <button onClick={() => handleSave(true)} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1">
                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Save as Version
                                </button>
                            </>
                        ) : (
                            <button onClick={() => handleSave(false)} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1">
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Quote
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
// ─── PO Modal ────────────────────────────────────────────────────────────────

function POModal({ leadId, po, onClose }) {
    const emptyPoItem = () => ({ product: '', qty: '', uom: '', rate: '', amount: '' });
    const emptyMilestone = () => ({ label: '', pct: '', status: 'Upcoming', date: '', amount: '' });
    const defaultItems = po?.items?.length ? po.items : [emptyPoItem()];
    const defaultMilestones = po?.milestones ? po.milestones : [
        { label: 'Advance', pct: '40', status: 'Upcoming', date: '', amount: '' },
        { label: 'Dispatch', pct: '50', status: 'Upcoming', date: '', amount: '' },
        { label: 'Installation', pct: '10', status: 'Upcoming', date: '', amount: '' },
    ];
    const [form, setForm] = useState({
        poNumber: '', projectName: '', taxPct: '18',
        ...po,
        items: defaultItems,
        milestones: defaultMilestones,
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const setItem = (i, k, v) => {
        setForm(f => {
            const items = [...f.items];
            const updated = { ...items[i], [k]: v };
            if (k === 'qty' || k === 'rate') {
                const qty = Number(k === 'qty' ? v : updated.qty) || 0;
                const rate = Number(k === 'rate' ? v : updated.rate) || 0;
                if (qty && rate) updated.amount = parseFloat((qty * rate).toFixed(2));
            }
            items[i] = updated;
            return { ...f, items };
        });
    };
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyPoItem()] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    const setMs = (i, k, v) => setForm(f => { const ms = [...f.milestones]; ms[i] = { ...ms[i], [k]: v }; return { ...f, milestones: ms }; });
    const addMs = () => setForm(f => ({ ...f, milestones: [...f.milestones, emptyMilestone()] }));
    const removeMs = (i) => setForm(f => ({ ...f, milestones: f.milestones.filter((_, idx) => idx !== i) }));

    const subtotal = form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const gst = Number(form.taxPct) || 0;
    const taxAmount = parseFloat((subtotal * gst / 100).toFixed(2));
    const grandTotal = parseFloat((subtotal + taxAmount).toFixed(2));
    const totalPct = form.milestones.reduce((s, m) => s + (Number(m.pct) || 0), 0);
    const pctValid = totalPct === 100;

    const handleSave = async () => {
        if (!form.items.some(it => it.product?.trim())) return;
        if (!pctValid) return; // guard: milestones must sum to 100%
        setSaving(true);
        try {
            const data = {
                poNumber: form.poNumber?.trim() || '',
                projectName: form.projectName?.trim() || '',
                taxPct: gst,
                items: form.items.map(it => ({
                    product: it.product?.trim() || '',
                    qty: Number(it.qty) || 0,
                    uom: it.uom?.trim() || '',
                    rate: Number(it.rate) || 0,
                    amount: Number(it.amount) || 0,
                })),
                subtotal,
                taxAmount,
                grandTotal,
                total: grandTotal,
                milestones: form.milestones.map(m => ({
                    label: m.label, pct: Number(m.pct) || 0,
                    status: m.status, date: m.date || '',
                    amount: Number(m.amount) || 0,
                })),
                updatedAt: new Date(),
            };
            if (po?.id) {
                await posRef(leadId).doc(po.id).update(data);
            } else {
                await posRef(leadId).add({ ...data, createdAt: new Date() });
            }
            onClose();
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl sm:my-4 max-h-[95vh] overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm">{po?.id ? 'Edit Purchase Order' : 'New Purchase Order'}</h3>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <Field label="PO Number"><input className={inputCls} value={form.poNumber} onChange={e => set('poNumber', e.target.value)} placeholder="PO-882" /></Field>
                        <Field label="GST %"><input type="number" className={inputCls} value={form.taxPct} onChange={e => set('taxPct', e.target.value)} placeholder="18" /></Field>
                        <div />
                    </div>
                    <Field label="Project Name"><input className={inputCls} value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="e.g. BKC Billboard Phase 2" /></Field>

                    {/* Line items */}
                    <div className="pt-1">
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Line Items</label>
                            <button onClick={addItem} className="text-[11px] text-violet-600 font-bold flex items-center gap-0.5 hover:underline"><Plus size={10} /> Add Row</button>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap min-w-[140px]">Description</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-14 shrink-0 text-center">Qty</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-14 shrink-0 text-center">UOM</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-20 shrink-0 text-right">Rate</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 w-20 shrink-0 text-right">Amount</span>
                        </div>
                        <div className="space-y-3">
                            {form.items.map((it, i) => (
                                <div key={i} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 sm:flex-row sm:items-center sm:bg-transparent sm:p-0 sm:border-0 sm:gap-1.5">
                                    <div className="flex-1 min-w-0">
                                        <textarea 
                                            className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-400 focus:outline-none bg-white font-medium resize-none min-h-[34px] leading-tight"
                                            value={it.product} 
                                            onChange={e => setItem(i, 'product', e.target.value)} 
                                            placeholder="PO Description"
                                            rows={1}
                                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                                        <div className="flex flex-col sm:flex-row gap-1">
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest min-w-[28px]">Qty</span>
                                                <input type="number" className="w-full sm:w-14 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-center" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest min-w-[28px]">UOM</span>
                                                <input className="w-full sm:w-14 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-center uppercase" value={it.uom} onChange={e => setItem(i, 'uom', e.target.value)} placeholder="Nos" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-1">
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-slate-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest min-w-[28px]">Rate</span>
                                                <input type="number" className="w-full sm:w-20 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-right" value={it.rate} onChange={e => setItem(i, 'rate', e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-violet-50 border border-violet-100 rounded-lg sm:bg-transparent sm:border-0 sm:p-0">
                                                <span className="sm:hidden text-[9px] font-bold text-violet-400 uppercase tracking-widest min-w-[28px]">Total</span>
                                                <input type="number" className="w-full sm:w-24 px-1 py-1.5 text-[11px] border border-slate-200 rounded-lg text-right font-bold text-violet-700 bg-white sm:bg-transparent" value={it.amount} readOnly placeholder="0" />
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeItem(i)} className="flex items-center justify-center gap-1.5 w-full sm:w-8 py-1.5 sm:py-0 border border-red-50 sm:border-0 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 transition-all font-bold text-[10px] uppercase sm:normal-case">
                                        <X size={14} /> <span className="sm:hidden">Remove Item</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                        {/* Totals */}
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                            <div className="flex justify-end gap-8">
                                <span className="text-[11px] text-slate-400">Subtotal</span>
                                <span className="text-[11px] tabular-nums text-slate-600 w-28 text-right">₹{fmtNum(subtotal)}</span>
                            </div>
                            <div className="flex justify-end gap-8">
                                <span className="text-[11px] text-slate-400">GST ({gst}%)</span>
                                <span className="text-[11px] tabular-nums text-slate-600 w-28 text-right">₹{fmtNum(taxAmount)}</span>
                            </div>
                            <div className="flex justify-end gap-8 pt-1 border-t border-slate-100">
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Grand Total</span>
                                <span className="text-[11px] font-bold tabular-nums text-slate-800 w-28 text-right">₹{fmtNum(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Milestones */}
                    <div className="pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payment Milestones</label>
                            <button onClick={addMs} className="text-[11px] text-violet-600 font-bold flex items-center gap-0.5 hover:underline"><Plus size={10} /> Add</button>
                        </div>
                        <div className="space-y-2 overflow-x-auto pb-2 scrollbar-hide">
                            {form.milestones.map((ms, i) => (
                                <div key={i} className="flex flex-col sm:flex-row gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 min-w-max sm:min-w-0">
                                    <input className="min-w-[120px] px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg" value={ms.label} onChange={e => setMs(i, 'label', e.target.value)} placeholder="Label" />
                                    <div className="flex gap-1.5 items-center">
                                        <input type="number" className="w-14 px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg text-center" value={ms.pct} onChange={e => setMs(i, 'pct', e.target.value)} placeholder="%" />
                                        <div className="w-24 flex items-center px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold tabular-nums text-teal-600 whitespace-nowrap overflow-hidden">
                                            ₹{fmtNum(parseFloat(((Number(ms.pct) || 0) / 100 * grandTotal).toFixed(0)))}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 items-center">
                                        <input type="date" className="w-28 px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg" value={ms.date} onChange={e => setMs(i, 'date', e.target.value)} />
                                        <select className="w-24 px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg bg-white" value={ms.status} onChange={e => setMs(i, 'status', e.target.value)}>
                                            {MILESTONE_STATUSES.map(s => <option key={s}>{s}</option>)}
                                        </select>
                                        <button onClick={() => removeMs(i)} className="p-1 text-slate-300 hover:text-red-400 shrink-0"><X size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* % total validation row */}
                        <div className={`flex items-center justify-between mt-2 px-2 py-1.5 rounded-lg text-[11px] font-bold ${pctValid ? 'bg-teal-50 text-teal-600' : 'bg-red-50 text-red-500'}`}>
                            <span>Total Milestone %</span>
                            <span className="tabular-nums">{totalPct}%{pctValid ? ' ✓' : ' — must equal 100%'}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                        {!pctValid && (
                            <p className="text-[11px] text-red-500 font-semibold text-center">
                                Milestone percentages must add up to exactly 100% (currently {totalPct}%)
                            </p>
                        )}
                        <div className="flex gap-2">
                            <button onClick={onClose} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !pctValid}
                                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1 ${
                                    !pctValid
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60'
                                }`}
                            >
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save PO
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Company Edit Modal ──────────────────────────────────────────────────────

function CompanyModal({ lead, onClose }) {
    const [form, setForm] = useState({
        companyName: lead.companyName || '',
        registeredName: lead.registeredName || '',
        website: lead.website || '',
        city: lead.location || '',
        billingAddress: lead.billingAddress || '',
        taxId: lead.taxId || '',
        bankName: lead.bankName || '',
        bankAccName: lead.bankAccName || '',
        bankAccNo: lead.bankAccNo || '',
        bankIfsc: lead.bankIfsc || '',
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await leadRef(lead.id).update({
                companyName: form.companyName.trim(),
                registeredName: form.registeredName.trim(),
                website: form.website.trim(),
                location: form.city.trim(),
                billingAddress: form.billingAddress.trim(),
                taxId: form.taxId.trim(),
                bankName: form.bankName.trim(),
                bankAccName: form.bankAccName.trim(),
                bankAccNo: form.bankAccNo.trim(),
                bankIfsc: form.bankIfsc.trim(),
                updatedAt: new Date(),
            });
            onClose();
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-4">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm">Edit Company Details</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X size={14} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <Field label="Display Name"><input className={inputCls} value={form.companyName} onChange={e => set('companyName', e.target.value)} /></Field>
                    <Field label="Full Registered Name"><input className={inputCls} value={form.registeredName} onChange={e => set('registeredName', e.target.value)} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="City"><input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
                        <Field label="Website"><input className={inputCls} value={form.website} onChange={e => set('website', e.target.value)} /></Field>
                    </div>
                    <Field label="Billing Address"><textarea className={inputCls} rows={2} value={form.billingAddress} onChange={e => set('billingAddress', e.target.value)} /></Field>
                    <Field label="GST / Tax ID"><input className={inputCls} value={form.taxId} onChange={e => set('taxId', e.target.value)} /></Field>

                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pt-1 border-t border-slate-100">Bank Details</p>
                    <Field label="Bank Name"><input className={inputCls} value={form.bankName} onChange={e => set('bankName', e.target.value)} /></Field>
                    <Field label="Account Name"><input className={inputCls} value={form.bankAccName} onChange={e => set('bankAccName', e.target.value)} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Account Number"><input className={inputCls} value={form.bankAccNo} onChange={e => set('bankAccNo', e.target.value)} /></Field>
                        <Field label="IFSC Code"><input className={inputCls} value={form.bankIfsc} onChange={e => set('bankIfsc', e.target.value)} /></Field>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={onClose} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-1">
                            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Task Modal (lightweight add) ──────────────────────────────────────────

function TaskModal({ leadId, companyName, user, usersList, onClose }) {
    const [form, setForm] = useState({ title: '', description: '', assignedTo: user?.username || '', dueDate: '', priority: 'normal' });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!form.title?.trim()) return;
        setSaving(true);
        try {
            await tasksRef().add({
                title: form.title.trim(),
                description: form.description?.trim() || '',
                assignedTo: form.assignedTo,
                assignedBy: user?.username || '',
                assignedOn: todayStr(),
                dueDate: form.dueDate || '',
                priority: form.priority,
                status: 'open',
                clientId: leadId,
                clientName: companyName,
                project: '',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            onClose();
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <Modal title="Add Task" onClose={onClose}>
            <Field label="Task Title"><input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)} placeholder="What needs to be done?" autoFocus /></Field>
            <Field label="Description (optional)">
                <textarea className={inputCls} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Additional context or details…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Assigned To">
                    <select className={selectCls} value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)}>
                        <option value="">— Select —</option>
                        {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                    </select>
                </Field>
                <Field label="Priority">
                    <select className={selectCls} value={form.priority} onChange={e => set('priority', e.target.value)}>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                    </select>
                </Field>
            </div>
            <Field label="Due Date"><input type="date" className={inputCls} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
            <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-1">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add Task
                </button>
            </div>
        </Modal>
    );
}

// ─── Section Label ──────────────────────────────────────────────────────────

const SecLabel = ({ icon: Icon, label }) => (
    <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
        <Icon size={11} />{label}
    </div>
);

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function ClientDashboard({ lead: initialLead, onBack, user, userRole, onOpenLEDCalculator }) {
    const leadId = initialLead.id;

    // Live lead data (for company fields we edit)
    const [lead, setLead] = useState(initialLead);
    const [contacts, setContacts] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [pos, setPos] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI state
    const [quotesOpen, setQuotesOpen] = useState(false);
    const [hideCompleted, setHideCompleted] = useState(false);
    const [companyOpen, setCompanyOpen] = useState(false);
    const [modal, setModal] = useState(null); // null | { type, data? }
    const openModal = (type, data = null) => setModal({ type, data });
    const closeModal = () => setModal(null);

    // Firestore subscriptions
    useEffect(() => {
        if (!db || !leadId) return;
        let unsubs = [];

        // Live lead doc (for company edits)
        unsubs.push(leadRef(leadId).onSnapshot(snap => {
            if (snap.exists) setLead({ id: snap.id, ...snap.data() });
        }));

        // Contacts
        unsubs.push(contactsRef(leadId).orderBy('createdAt', 'asc').onSnapshot(snap => {
            setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setContacts([])));

        // Quotes (sorted newest first)
        unsubs.push(quotesRef(leadId).orderBy('createdAt', 'desc').onSnapshot(snap => {
            setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, () => { setQuotes([]); setLoading(false); }));

        // Purchase orders
        unsubs.push(posRef(leadId).orderBy('createdAt', 'asc').onSnapshot(snap => {
            setPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setPos([])));

        // Tasks filtered by clientId
        unsubs.push(tasksRef().where('clientId', '==', leadId).onSnapshot(snap => {
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
                if (a.status === 'done' && b.status !== 'done') return 1;
                if (a.status !== 'done' && b.status === 'done') return -1;
                return (a.dueDate || '').localeCompare(b.dueDate || '');
            }));
        }, () => setTasks([])));

        // Users list (for task assignment)
        const unsubUsers = baseRef().collection('user_roles').onSnapshot(snap => {
            setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.username || '').localeCompare(b.username || '')));
        }, () => setUsersList([]));
        unsubs.push(unsubUsers);

        return () => unsubs.forEach(u => u());
    }, [leadId]);

    const toggleTask = useCallback(async (task) => {
        const newStatus = task.status === 'done' ? 'open' : 'done';
        try { await tasksRef().doc(task.id).update({ status: newStatus, updatedAt: new Date() }); }
        catch (e) { console.error(e); }
    }, []);

    const deleteContact = async (cid) => {
        if (!window.confirm('Delete this contact?')) return;
        await contactsRef(leadId).doc(cid).delete();
    };

    const deleteQuote = async (qid) => {
        if (!window.confirm('Delete this quote?')) return;
        const qToDel = quotes.find(q => q.id === qid);
        if (qToDel && qToDel.globalQuoteId) {
            try {
                await db.collection('artifacts').doc(appId).collection('public').doc('data')
                    .collection('quotes').doc(qToDel.globalQuoteId).delete();
            } catch (err) { console.error("Error deleting global quote:", err); }
        }
        await quotesRef(leadId).doc(qid).delete();
    };

    const deletePO = async (pid) => {
        if (!window.confirm('Delete this purchase order?')) return;
        await posRef(leadId).doc(pid).delete();
    };

    // ── Group quotes by ref, auto-version by createdAt ──
    const quoteGroups = useMemo(() => {
        const groups = {};
        // sort all quotes oldest→newest so version index is correct
        const sorted = [...quotes].sort((a, b) => {
            const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return ta - tb;
        });
        sorted.forEach(q => {
            const key = q.ref || q.id;
            if (!groups[key]) groups[key] = [];
            groups[key].push(q);
        });
        // Return array of groups, each sorted so latest is first for display
        return Object.entries(groups).map(([ref, vers]) => ({
            ref,
            // re-tag with auto version label
            versions: vers.map((v, i) => ({ ...v, versionLabel: `v${i + 1}` })).reverse(),
        })).sort((a, b) => {
            // sort groups by latest version's createdAt desc
            const ta = a.versions[0]?.createdAt?.toDate ? a.versions[0].createdAt.toDate() : new Date(0);
            const tb = b.versions[0]?.createdAt?.toDate ? b.versions[0].createdAt.toDate() : new Date(0);
            return tb - ta;
        });
    }, [quotes]);

    const latestQuote = quoteGroups[0]?.versions[0] || null;

    // Track which quote groups have their version history open
    const [openGroups, setOpenGroups] = useState({});
    const toggleGroup = (ref) => setOpenGroups(g => ({ ...g, [ref]: !g[ref] }));

    const QuoteLineItems = ({ q }) => (
        q.items?.length > 0 ? (
            <div className="mx-2 mb-1.5 border border-slate-100 rounded-lg overflow-hidden">
                <div className="grid bg-slate-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100" style={{ gridTemplateColumns: '1fr 40px 40px 72px 84px' }}>
                    <span>Product</span><span className="text-center">Qty</span><span className="text-center">UOM</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
                </div>
                {q.items.map((it, i) => (
                    <div key={i} className="grid px-2 py-2 border-b border-slate-50 last:border-0 text-[11px] items-start" style={{ gridTemplateColumns: '1fr 34px 34px 64px 74px' }}>
                        <span className="text-slate-700 font-medium leading-tight whitespace-normal break-words pr-1">{it.product || '—'}</span>
                        <span className="text-center text-slate-500 tabular-nums">{it.qty || '—'}</span>
                        <span className="text-center text-slate-400 uppercase">{it.uom || '—'}</span>
                        <span className="text-right text-slate-500 tabular-nums">₹{fmtNum(it.rate)}</span>
                        <span className="text-right font-semibold text-slate-700 tabular-nums">₹{fmtNum(it.amount)}</span>
                    </div>
                ))}
                {/* GST + totals */}
                {(q.gstPct > 0 || q.subtotal > 0) && (
                    <div className="border-t border-slate-100 px-2 py-1 space-y-0.5 bg-slate-50/60">
                        {q.subtotal > 0 && (
                            <div className="flex justify-between text-[11px]">
                                <span className="text-slate-400">Subtotal</span>
                                <span className="tabular-nums text-slate-600">₹{fmtNum(q.subtotal)}</span>
                            </div>
                        )}
                        {q.gstPct > 0 && (
                            <div className="flex justify-between text-[11px]">
                                <span className="text-slate-400">GST ({q.gstPct}%)</span>
                                <span className="tabular-nums text-slate-600">₹{fmtNum(q.taxAmount)}</span>
                            </div>
                        )}
                        {q.grandTotal > 0 && (
                            <div className="flex justify-between text-[11px] font-bold pt-0.5 border-t border-slate-100">
                                <span className="text-slate-600 uppercase tracking-wider">Grand Total</span>
                                <span className="tabular-nums text-slate-800">₹{fmtNum(q.grandTotal)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        ) : null
    );
    const paymentPending  = pos.flatMap(p => (p.milestones || []).map(m => ({ ...m, _gt: p.grandTotal || p.total || 0 }))).filter(m => m.status === 'Pending').reduce((s, m)  => s + ((Number(m.pct) || 0) / 100 * m._gt), 0);
    const paymentUpcoming = pos.flatMap(p => (p.milestones || []).map(m => ({ ...m, _gt: p.grandTotal || p.total || 0 }))).filter(m => m.status === 'Upcoming').reduce((s, m) => s + ((Number(m.pct) || 0) / 100 * m._gt), 0);
    const visibleTasks = hideCompleted ? tasks.filter(t => t.status !== 'done') : tasks;
    const completedCount = tasks.filter(t => t.status === 'done').length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={22} className="animate-spin text-violet-500" />
            </div>
        );
    }

    const QuoteRow = ({ q, highlighted }) => (
        <div className={`rounded-lg group ${highlighted ? 'bg-white border border-slate-200 shadow-sm' : 'hover:bg-slate-50 border border-transparent'}`}>
            {/* Summary row */}
            <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-[11px] font-mono font-bold text-slate-400 w-14 shrink-0">{q.ref || '—'}</span>
                <span className="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-bold text-slate-500 shrink-0">{q.version}</span>
                <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{q.date || fmtDate(q.createdAt)}</span>
                {q.projectName && <span className="text-[11px] text-slate-600 font-medium truncate flex-1 ml-1">{q.projectName}</span>}
                {!q.projectName && <span className="flex-1" />}
                <span className="text-[11px] font-semibold text-slate-700 tabular-nums shrink-0">₹{fmtNum(q.amount)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 ${quoteStatusStyle[q.status] || quoteStatusStyle.Sent}`}>{q.status}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openModal('quote', q)} className="text-slate-400 hover:text-violet-500"><Edit2 size={10} /></button>
                    <button onClick={() => deleteQuote(q.id)} className="text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
                </div>
            </div>
            {/* Line items (only on highlighted / latest) */}
            {highlighted && q.items?.length > 0 && (
                <div className="mx-2 mb-1.5 border border-slate-100 rounded-lg overflow-hidden">
                    <div className="grid bg-slate-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100" style={{ gridTemplateColumns: '1fr 40px 40px 72px 84px' }}>
                        <span>Product</span><span className="text-center">Qty</span><span className="text-center">UOM</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
                    </div>
                    {q.items.map((it, i) => (
                        <div key={i} className="grid px-2 py-1 border-b border-slate-50 last:border-0 text-[11px]" style={{ gridTemplateColumns: '1fr 40px 40px 72px 84px' }}>
                            <span className="text-slate-700 truncate">{it.product || '—'}</span>
                            <span className="text-center text-slate-500 tabular-nums">{it.qty || '—'}</span>
                            <span className="text-center text-slate-400">{it.uom || '—'}</span>
                            <span className="text-right text-slate-500 tabular-nums">₹{fmtNum(it.rate)}</span>
                            <span className="text-right font-semibold text-slate-700 tabular-nums">₹{fmtNum(it.amount)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="h-screen flex flex-col bg-slate-100 overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

            {/* ══ HEADER ══ */}
            <div className="shrink-0 bg-white border-b border-slate-200">
                {/* Row 1 */}
                <div className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
                            <ArrowLeft size={16} />
                        </button>
                        <div className="w-px h-4 bg-slate-200 shrink-0" />
                        <div className="min-w-0 flex flex-col">
                            <span className="text-sm font-bold text-slate-800 truncate">{lead.companyName || 'Client'}</span>
                            <div className="flex items-center gap-2">
                                <span className={`px-1 py-0 shadow-sm rounded text-[9px] font-bold uppercase tracking-wider ${
                                    lead.stage === 'Won' ? 'bg-teal-50 text-teal-600' :
                                    lead.stage === 'Lost' ? 'bg-red-50 text-red-400' :
                                    'bg-violet-50 text-violet-600'
                                }`}>{lead.stage}</span>
                                {lead.location && (
                                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                        <MapPin size={9} /> {lead.location}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => openModal('company')} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors">
                            <Edit2 size={11} /> Edit
                        </button>
                        <button onClick={() => openModal('quote')} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white rounded-lg text-[10px] font-bold hover:bg-violet-700 transition-colors shadow-sm">
                            <Plus size={11} /> New Quote
                        </button>
                    </div>
                </div>

                {/* Row 2: Stats */}
                <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                            <TrendingUp size={12} className="text-violet-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-tight">Latest Quote</p>
                            <p className="text-xs font-bold text-slate-800 tabular-nums break-words">{latestQuote ? fmt(latestQuote.amount) : '—'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                            <AlertCircle size={12} className="text-amber-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-tight truncate">Pending</p>
                            <p className="text-xs font-bold text-amber-600 tabular-nums break-words">{fmt(paymentPending)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                            <Clock size={12} className="text-sky-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-tight truncate">Upcoming</p>
                            <p className="text-xs font-bold text-sky-600 tabular-nums break-words">{fmt(paymentUpcoming)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                            <CheckSquare size={12} className="text-slate-400" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-tight">Open Tasks</p>
                            <p className="text-xs font-bold text-slate-700 tabular-nums">{tasks.filter(t => t.status !== 'done').length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ RESPONSIVE BODY ══ */}
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_1.2fr] gap-3 content-start">

                {/* ── COL 1: TASKS ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
                        <div className="flex items-center gap-1.5">
                            <CheckSquare size={11} className="text-violet-500" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Tasks</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">{tasks.length}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setHideCompleted(h => !h)}
                                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded transition-colors ${hideCompleted ? 'bg-violet-100 text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                {hideCompleted ? 'Show all' : `Hide done (${completedCount})`}
                            </button>
                            <button onClick={() => openModal('task')} className="flex items-center gap-0.5 px-1.5 py-1 bg-violet-600 text-white rounded text-[11px] font-bold hover:bg-violet-700 transition-colors">
                                <Plus size={11} /> New
                            </button>
                        </div>
                    </div>
                    <div className="px-3 py-1 border-b border-slate-100 shrink-0 bg-slate-50 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <span className="w-4 shrink-0" />
                        <span className="flex-1 px-3">Task</span>
                        <span className="w-16 text-center">Due</span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {visibleTasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-24 text-[11px] text-slate-400 gap-1">
                                {tasks.length === 0 ? <>No tasks yet.<br />Click + New to add one.</> : 'All done 🎉'}
                            </div>
                        ) : visibleTasks.map(task => {
                            const done = task.status === 'done';
                            const pKey = (task.priority || 'normal').charAt(0).toUpperCase() + (task.priority || 'normal').slice(1);
                            const dotColor = PRIORITY_LABELS[pKey] || 'bg-slate-300';
                            return (
                                <div key={task.id}
                                    className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-50 last:border-0 cursor-pointer group transition-colors ${done ? 'opacity-40' : 'hover:bg-slate-50'}`}
                                    onClick={() => toggleTask(task)}>
                                    <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${done ? 'bg-teal-500 border-teal-500' : 'border-slate-300 group-hover:border-violet-400'}`}>
                                        {done && <CheckCircle2 size={10} className="text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                                            <span className={`text-xs truncate ${done ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>{task.title}</span>
                                        </div>
                                        {task.assignedTo && <span className="text-[10px] text-slate-400 font-medium truncate sm:ml-auto">@{task.assignedTo}</span>}
                                    </div>
                                    <span className="w-16 text-center text-[10px] text-slate-400 tabular-nums shrink-0">{task.dueDate || '—'}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── COL 2: QUOTES ONLY ── */}
                <div className="flex flex-col gap-2.5 overflow-y-auto pr-0.5">

                    {/* Quotes */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 shrink-0">
                        <div className="flex items-center justify-between mb-1.5">
                            <SecLabel icon={FileText} label="Quotes Sent" />
                            <button onClick={() => openModal('quote')} className="text-[11px] text-violet-600 font-bold flex items-center gap-0.5 hover:underline -mt-2">
                                <Plus size={11} /> New
                            </button>
                        </div>
                        {quoteGroups.length === 0 ? (
                            <p className="text-[11px] text-slate-400 py-2">No quotes yet.</p>
                        ) : quoteGroups.map(group => {
                            const latest = group.versions[0];
                            const older = group.versions.slice(1);
                            const isOpen = openGroups[group.ref];
                            return (
                                <div key={group.ref} className="mb-2 last:mb-0">
                                    {/* Latest version — always expanded */}
                                    <div className="rounded-lg border border-slate-200 shadow-sm bg-white">
                                        {/* Header: Ref · Date · Project Name · Status · actions */}
                                        <div className="flex items-center gap-2 px-2 py-1.5 group">
                                            <span className="text-[11px] font-mono font-bold text-violet-500 shrink-0">{latest.ref || '—'}</span>
                                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{fmtDateShort(latest.date)}</span>
                                            <span className="text-[11px] text-slate-600 font-medium truncate flex-1">{latest.projectName || ''}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 ${quoteStatusStyle[latest.status] || quoteStatusStyle.Sent}`}>{latest.status}</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                {latest.calculatorRef ? (
                                                    <button
                                                        title="Open in LED Calculator"
                                                        onClick={() => onOpenLEDCalculator && onOpenLEDCalculator(latest)}
                                                        className="flex items-center gap-0.5 text-[11px] font-bold text-teal-600 hover:text-teal-800 px-1 py-0.5 rounded bg-teal-50 hover:bg-teal-100 transition-colors"
                                                    >
                                                        <Calculator size={9} /> Open in Calculator
                                                    </button>
                                                ) : (
                                                    <button onClick={() => openModal('quote', latest)} className="text-slate-400 hover:text-violet-500"><Edit2 size={10} /></button>
                                                )}
                                                <button onClick={() => deleteQuote(latest.id)} className="text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
                                            </div>
                                        </div>
                                        {/* Line items for latest */}
                                        <QuoteLineItems q={latest} />
                                    </div>

                                    {/* Older versions */}
                                    {older.length > 0 && (
                                        <div className="mt-1">
                                            <button
                                                onClick={() => toggleGroup(group.ref)}
                                                className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-600 font-semibold transition-colors pl-1">
                                                {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                {isOpen ? 'Hide' : 'Show'} {older.length} older version{older.length > 1 ? 's' : ''}
                                            </button>
                                            {isOpen && (
                                                <div className="mt-1 pl-2 border-l-2 border-slate-100 space-y-1.5">
                                                    {older.map(q => (
                                                        <div key={q.id}
                                                            className="rounded-lg border border-slate-100 hover:border-slate-200 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-2 px-2 py-1.5">
                                                                <span className="text-[11px] font-mono font-bold text-slate-500 shrink-0">{q.ref || '—'}</span>
                                                                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{fmtDateShort(q.date)}</span>
                                                                <span className="text-[11px] text-slate-500 whitespace-normal break-words flex-1 leading-tight">{q.projectName || ''}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 ${quoteStatusStyle[q.status] || quoteStatusStyle.Sent}`}>{q.status}</span>
                                                                {q.calculatorRef ? (
                                                                    <button
                                                                        title="Open in LED Calculator"
                                                                        onClick={() => onOpenLEDCalculator && onOpenLEDCalculator(q)}
                                                                        className="text-teal-500 hover:text-teal-700 opacity-0 group-hover:opacity-100"
                                                                    >
                                                                        <Calculator size={10} />
                                                                    </button>
                                                                ) : (
                                                                    <button onClick={() => openModal('quote', q)} className="text-slate-300 hover:text-violet-400 opacity-0 group-hover:opacity-100"><Edit2 size={10} /></button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── COL 3: COMPANY ACCORDION + PO ── */}
                <div className="flex flex-col gap-2.5 overflow-y-auto pr-0.5">

                    {/* Company accordion */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm shrink-0 overflow-hidden">
                        {/* Clickable header */}
                        <button
                            onClick={() => setCompanyOpen(o => !o)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors group"
                        >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <Building2 size={11} className="text-violet-400 shrink-0" />
                                <span className="text-[11px] font-bold text-slate-700 whitespace-normal break-words leading-tight">{lead.companyName || 'Company Details'}</span>
                                {lead.location && <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-0.5 ml-auto"><MapPin size={10} />{lead.location}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <button
                                    onClick={e => { e.stopPropagation(); openModal('company'); }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-violet-500"
                                ><Edit2 size={10} /></button>
                                {companyOpen ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                            </div>
                        </button>

                        {/* Accordion body */}
                        {companyOpen && (
                            <div className="border-t border-slate-100 px-3 py-2.5 space-y-3">
                                {/* Company details */}
                                <div className="space-y-1">
                                    {lead.registeredName && lead.registeredName !== lead.companyName && (
                                        <p className="text-[11px] text-slate-600 font-medium leading-snug">{lead.registeredName}</p>
                                    )}
                                    {lead.billingAddress && <p className="text-[11px] text-slate-500 leading-snug">{lead.billingAddress}</p>}
                                    {lead.website && (
                                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                            <Globe size={11} className="text-violet-400 shrink-0" />
                                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-violet-500 hover:underline truncate">{lead.website}</a>
                                        </div>
                                    )}
                                    {lead.taxId && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                            <span className="font-bold text-slate-400 uppercase tracking-wider shrink-0">GST</span>
                                            <span className="font-mono text-slate-600">{lead.taxId}</span>
                                        </div>
                                    )}
                                    {!lead.registeredName && !lead.billingAddress && !lead.website && !lead.taxId && (
                                        <button onClick={() => openModal('company')} className="text-[11px] text-violet-500 hover:underline">+ Fill company details</button>
                                    )}
                                </div>

                                {/* Bank details */}
                                {(lead.bankName || lead.bankAccNo) && (
                                    <div className="pt-2 border-t border-slate-100 space-y-1">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Landmark size={10} />Bank</p>
                                        {[['Bank', lead.bankName], ['A/C Name', lead.bankAccName], ['A/C', lead.bankAccNo], ['IFSC', lead.bankIfsc]].filter(([, v]) => v).map(([lbl, val]) => (
                                            <div key={lbl} className="flex justify-between items-center gap-2">
                                                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 shrink-0">{lbl}</span>
                                                <span className="text-[11px] font-mono text-slate-700 text-right truncate">{val}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Contacts */}
                                <div className="pt-2 border-t border-slate-100">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><User size={10} />Contacts</p>
                                        <button onClick={() => openModal('contact')} className="text-[11px] text-violet-600 font-bold flex items-center gap-0.5 hover:underline">
                                            <Plus size={10} /> Add
                                        </button>
                                    </div>
                                    {contacts.length === 0 ? (
                                        <p className="text-[11px] text-slate-400">No contacts yet.</p>
                                    ) : contacts.map(c => (
                                        <div key={c.id} className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0 group">
                                            <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                                                <span className="text-[11px] font-bold text-violet-600">{(c.name || '?')[0].toUpperCase()}</span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                                    <p className="text-[11px] font-semibold text-slate-800">{c.name}</p>
                                                    <p className="text-[11px] text-violet-500 font-semibold shrink-0">{c.role}</p>
                                                </div>
                                                {c.phone && <p className="text-[11px] text-slate-400 flex items-center gap-0.5 mt-0.5"><Phone size={11} className="shrink-0" /> {c.phone}</p>}
                                                {c.email && <p className="text-[11px] text-slate-400 flex items-center gap-0.5 mt-0.5"><Mail size={11} className="shrink-0" /> {c.email}</p>}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                                                <button onClick={() => openModal('contact', c)} className="text-slate-400 hover:text-violet-500"><Edit2 size={10} /></button>
                                                <button onClick={() => deleteContact(c.id)} className="text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* PO */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex-1">
                        <div className="flex items-center justify-between mb-2">
                            <SecLabel icon={ShoppingBag} label="Purchase Orders" />
                            <button onClick={() => openModal('po')} className="text-[11px] text-violet-600 font-bold flex items-center gap-0.5 hover:underline -mt-2">
                                <Plus size={11} /> Add PO
                            </button>
                        </div>
                        {pos.length === 0 ? (
                            <p className="text-[11px] text-slate-400 py-2">No purchase orders yet.</p>
                        ) : pos.map(po => (
                            <div key={po.id} className="border border-slate-200 rounded-lg overflow-hidden mb-2 last:mb-0">
                                {/* PO header row */}
                                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-100 group">
                                    <span className="text-[11px] font-mono font-bold text-violet-500 shrink-0">{po.poNumber || '—'}</span>
                                    {po.projectName && <span className="text-[11px] font-medium text-slate-700 flex-1 whitespace-normal break-words leading-tight">{po.projectName}</span>}
                                    {!po.projectName && <span className="flex-1" />}
                                    <span className="text-[11px] font-bold text-teal-600 tabular-nums shrink-0 ml-1">₹{fmtNum(po.grandTotal || po.total)}</span>
                                    {po.taxPct > 0 && <span className="text-[11px] text-slate-400 shrink-0">+{po.taxPct}% GST</span>}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => openModal('po', po)} className="p-0.5 text-slate-400 hover:text-violet-500"><Edit2 size={10} /></button>
                                        <button onClick={() => deletePO(po.id)} className="p-0.5 text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
                                    </div>
                                </div>
                                {/* Line items */}
                                {(po.items || []).length > 0 && (
                                    <>
                                        <div className="grid bg-slate-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100" style={{ gridTemplateColumns: '1fr 40px 40px 64px 64px' }}>
                                            <span>Description</span><span className="text-center">Qty</span><span className="text-center">UOM</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
                                        </div>
                                        {po.items.map((it, i) => (
                                            <div key={i} className="grid px-2 py-2 border-b border-slate-50 last:border-0 text-[11px] items-start" style={{ gridTemplateColumns: '1fr 34px 34px 64px 74px' }}>
                                                <span className="text-slate-700 font-medium leading-tight whitespace-normal break-words pr-1">{it.product || '—'}</span>
                                                <span className="text-center text-slate-500 tabular-nums">{it.qty || '—'}</span>
                                                <span className="text-center text-slate-400 uppercase">{it.uom || '—'}</span>
                                                <span className="text-right text-slate-500 tabular-nums">₹{fmtNum(it.rate)}</span>
                                                <span className="text-right font-semibold text-slate-700 tabular-nums">₹{fmtNum(it.amount)}</span>
                                            </div>
                                        ))}
                                        {(po.subtotal > 0 || po.taxPct > 0) && (
                                            <div className="border-t border-slate-100 px-2 py-1 space-y-0.5 bg-slate-50/60">
                                                {po.subtotal > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-400">Subtotal</span><span className="tabular-nums text-slate-600">₹{fmtNum(po.subtotal)}</span></div>}
                                                {po.taxPct > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-400">GST ({po.taxPct}%)</span><span className="tabular-nums text-slate-600">₹{fmtNum(po.taxAmount)}</span></div>}
                                                {po.grandTotal > 0 && <div className="flex justify-between text-[11px] font-bold pt-0.5 border-t border-slate-100"><span className="text-slate-600 uppercase tracking-wider">Grand Total</span><span className="tabular-nums text-slate-800">₹{fmtNum(po.grandTotal)}</span></div>}
                                            </div>
                                        )}
                                    </>
                                )}
                                {/* Milestones */}
                                {(po.milestones || []).length > 0 && (
                                    <>
                                        <div className="bg-slate-50 px-3 py-1 grid text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 border-t border-slate-100" style={{ gridTemplateColumns: '1fr 56px 72px' }}>
                                            <span>Milestone</span>
                                            <span className="text-center">Due</span>
                                            <span className="text-center">Status</span>
                                        </div>
                                        {po.milestones.map((ms, i) => {
                                            const msAmt = parseFloat(((Number(ms.pct) || 0) / 100 * (po.grandTotal || po.total || 0)).toFixed(0));
                                            const fmtDate = ms.date ? (() => { const d = new Date(ms.date); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); })() : '—';
                                            return (
                                                <div key={i} className="grid items-center px-3 py-1.5 border-b border-slate-50 last:border-0" style={{ gridTemplateColumns: '1fr 56px 72px' }}>
                                                    <span className="text-[11px] text-slate-700 leading-snug">
                                                        {ms.label}
                                                        {ms.pct ? <span className="text-slate-400"> ({ms.pct}% · ₹{fmtNum(msAmt)})</span> : ''}
                                                    </span>
                                                    <span className="text-center text-[11px] text-slate-400 tabular-nums">{fmtDate}</span>
                                                    <div className="flex justify-center">
                                                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${milestoneStatusStyle[ms.status] || milestoneStatusStyle.Upcoming}`}>{ms.status}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ══ MODALS ══ */}
            {modal?.type === 'company' && <CompanyModal lead={lead} onClose={closeModal} />}
            {modal?.type === 'contact' && <ContactModal leadId={leadId} contact={modal.data} onClose={closeModal} />}
            {modal?.type === 'quote' && <QuoteModal leadId={leadId} quote={modal.data} onClose={closeModal} />}
            {modal?.type === 'po' && <POModal leadId={leadId} po={modal.data} onClose={closeModal} />}
            {modal?.type === 'task' && <TaskModal leadId={leadId} companyName={lead.companyName} user={user} usersList={usersList} onClose={closeModal} />}
        </div>
    );
}
