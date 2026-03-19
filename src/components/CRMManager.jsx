import React, { useState, useEffect, useMemo } from 'react';
import { db, appId } from '../lib/firebase';
import {
    Plus, Trash2, X, Save, Search,
    ChevronDown, ChevronUp, ArrowUpDown, MapPin, 
    TrendingUp, Users, BarChart2, Kanban, List, 
    CheckCircle, Star, RefreshCw, Circle
} from 'lucide-react';
import ClientDashboard from './ClientDashboard';

// ─── Constants ──────────────────────────────────────────────────────────────
const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const STAGE_COLORS = {
    Lead:        { bg: 'bg-slate-50',          text: 'text-slate-500',  dot: 'bg-slate-400' },
    Qualified:   { bg: 'bg-blue-50',           text: 'text-blue-600',   dot: 'bg-blue-500'  },
    Proposal:    { bg: 'bg-amber-50',          text: 'text-amber-600',  dot: 'bg-amber-500' },
    Negotiation: { bg: 'bg-purple-50',         text: 'text-purple-600', dot: 'bg-purple-500'},
    Won:         { bg: 'bg-emerald-50',        text: 'text-emerald-600',dot: 'bg-emerald-500'},
    Lost:        { bg: 'bg-red-50',            text: 'text-red-500',    dot: 'bg-red-500'   },
};

const emptyLead = () => ({
    companyName: '', contactName: '', email: '', phone: '', location: '',
    stage: 'Lead', source: '',
    assignedTo: '',
    createdAt: null, updatedAt: null, createdBy: '',
});

const fmtDate = (ts) => {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

// ─── Sub-components ────────────────────────────────────────────────────────

const SortableHeader = ({ label, columnKey, sortConfig, onSort, className = '' }) => {
    const active = sortConfig.key === columnKey;
    return (
        <th
            className={`px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 group transition-colors select-none ${className}`}
            onClick={() => onSort(columnKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                {active
                    ? sortConfig.direction === 'asc' ? <ChevronUp size={10} className="text-purple-500" /> : <ChevronDown size={10} className="text-purple-500" />
                    : <ArrowUpDown size={10} className="opacity-20 group-hover:opacity-100 transition-opacity" />
                }
            </div>
        </th>
    );
};

// ─── Lead Form Modal ────────────────────────────────────────────────────────

const LeadFormModal = ({ lead, onSave, onClose, usersList }) => {
    const [form, setForm] = useState(lead ? { ...lead } : emptyLead());
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!form.companyName.trim() && !form.contactName.trim()) return;
        setSaving(true);
        await onSave(form);
        setSaving(false);
    };

    const inputCls = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 dark:text-white';
    const labelCls = 'block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1';

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 animate-in fade-in duration-150 p-0 sm:p-4">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                        {lead ? 'Edit Lead' : 'New Lead'}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 pb-12 sm:pb-5">
                    <div className="sm:col-span-2">
                        <label className={labelCls}>Company Name</label>
                        <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)}
                            className={inputCls} placeholder="e.g. Acme Tech Solutions" autoFocus />
                    </div>

                    <div>
                        <label className={labelCls}>Contact Person</label>
                        <input type="text" value={form.contactName} onChange={e => set('contactName', e.target.value)}
                            className={inputCls} placeholder="e.g. John Doe" />
                    </div>

                    <div>
                        <label className={labelCls}>Email</label>
                        <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                            className={inputCls} placeholder="john@example.com" />
                    </div>

                    <div>
                        <label className={labelCls}>Phone</label>
                        <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                            className={inputCls} placeholder="+91 98765 00000" />
                    </div>

                    <div>
                        <label className={labelCls}>Location</label>
                        <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
                            className={inputCls} placeholder="City, Country" />
                    </div>

                    <div>
                        <label className={labelCls}>Stage</label>
                        <select value={form.stage} onChange={e => set('stage', e.target.value)} className={inputCls}>
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={labelCls}>Source</label>
                        <select value={form.source} onChange={e => set('source', e.target.value)} className={inputCls}>
                            <option value="">– Select Source –</option>
                            {['Referral', 'Website', 'LinkedIn', 'Exhibition', 'Cold Call', 'Email Campaign', 'Partner', 'Other'].map(s =>
                                <option key={s} value={s}>{s}</option>
                            )}
                        </select>
                    </div>

                    <div className="sm:col-span-2">
                        <label className={labelCls}>Assign To Agent</label>
                        <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} className={inputCls}>
                            <option value="">– Select Agent –</option>
                            {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white dark:bg-slate-800 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-700 sm:bg-slate-50 dark:sm:bg-slate-900/50">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white uppercase tracking-wider">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || (!form.companyName.trim() && !form.contactName.trim())}
                        className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 uppercase tracking-wider shadow-md"
                    >
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        {lead ? 'Save' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Kanban View ─────────────────────────────────────────────────────────────

const KanbanView = ({ leads, onEdit, onStageChange }) => {
    const byStage = useMemo(() => {
        const map = {};
        STAGES.forEach(s => map[s] = []);
        leads.forEach(l => { if (map[l.stage]) map[l.stage].push(l); });
        return map;
    }, [leads]);

    const stagesToShow = STAGES.filter(s => s !== 'Lost' || byStage['Lost']?.length > 0);

    return (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 scroll-smooth">
            {stagesToShow.map(stage => {
                const c = STAGE_COLORS[stage];
                const stageLeads = byStage[stage];
                return (
                    <div key={stage} className="flex-shrink-0 w-[280px] sm:w-64">
                        <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-lg border-b-2 ${c.bg} border-current/10`}>
                            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${c.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                {stage}
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200/50 dark:bg-black/20 text-[9px] text-slate-500">
                                    {stageLeads.length}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 min-h-[400px] bg-slate-50 dark:bg-slate-900/40 rounded-b-lg p-2 border border-slate-200 dark:border-slate-800 border-t-0">
                            {stageLeads.map(lead => (
                                <div key={lead.id} onClick={() => onEdit(lead)}
                                    className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 cursor-pointer hover:border-purple-400 transition-all shadow-sm active:bg-slate-50 dark:active:bg-slate-700/50">
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-2 tracking-tight overflow-hidden text-wrap">{lead.companyName || lead.contactName}</h4>
                                    <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 text-wrap">{lead.contactName || lead.location || '—'}</p>
                                    
                                    <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-slate-50 dark:border-slate-700/50">
                                        <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase">
                                            <MapPin size={10} />{lead.location || 'Local'}
                                        </div>
                                        {lead.assignedTo && (
                                            <div className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                                                {lead.assignedTo}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {stageLeads.length === 0 && (
                                <div className="h-24 border-2 border-dashed border-slate-200/50 dark:border-slate-800/50 rounded-lg flex flex-col items-center justify-center text-[9px] text-slate-300 uppercase font-bold tracking-widest gap-1">
                                    Empty
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const CRMManager = ({ user, userRole, onOpenLEDCalculator }) => {
    const [leads, setLeads] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [loading, setLoading] = useState(true);

    const [viewMode, setViewMode] = useState('list'); 
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStage, setFilterStage] = useState('All');
    const [filterAssignee, setFilterAssignee] = useState('All');
    const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });

    const [editingLead, setEditingLead] = useState(null); 
    const [showForm, setShowForm] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);

    const isAdmin = ['super_admin', 'admin'].includes(userRole);
    const baseRef = () => db.collection('artifacts').doc(appId).collection('public').doc('data');

    useEffect(() => {
        if (!user || !db) return;
        const unsubLeads = baseRef().collection('crm_leads')
            .onSnapshot(snap => {
                setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            }, err => { console.error(err); setLoading(false); });

        const unsubUsers = baseRef().collection('user_roles')
            .onSnapshot(snap => {
                setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.username || '').localeCompare(b.username || '')));
            });
        return () => { unsubLeads(); unsubUsers(); };
    }, [user]);

    const handleSaveLead = async (form) => {
        const data = {
            companyName: form.companyName?.trim() || '',
            contactName: form.contactName?.trim() || '',
            email: form.email?.trim() || '',
            phone: form.phone?.trim() || '',
            location: form.location?.trim() || '',
            stage: form.stage || 'Lead',
            source: form.source || '',
            assignedTo: form.assignedTo || '',
            updatedAt: new Date(),
        };
        const ref = baseRef().collection('crm_leads');
        if (editingLead?.id) {
            await ref.doc(editingLead.id).update(data);
        } else {
            data.createdAt = new Date();
            data.createdBy = user.username || user.email;
            await ref.add(data);
        }
        setShowForm(false);
        setEditingLead(null);
    };

    const handleDeleteLead = async (id) => {
        if (!window.confirm('Delete this lead?')) return;
        await baseRef().collection('crm_leads').doc(id).delete();
    };

    const handleStageChange = async (leadId, newStage) => {
        await baseRef().collection('crm_leads').doc(leadId).update({ stage: newStage, updatedAt: new Date() });
    };

    const handleSort = (key) => {
        setSortConfig(c => ({ key, direction: c.key === key && c.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const filteredLeads = useMemo(() => {
        let result = [...leads];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(l =>
                (l.companyName || '').toLowerCase().includes(q) ||
                (l.contactName || '').toLowerCase().includes(q) ||
                (l.email || '').toLowerCase().includes(q) ||
                (l.location || '').toLowerCase().includes(q)
            );
        }
        if (filterStage !== 'All') result = result.filter(l => l.stage === filterStage);
        if (filterAssignee !== 'All') result = result.filter(l => l.assignedTo === filterAssignee);
        result.sort((a, b) => {
            let av = a[sortConfig.key], bv = b[sortConfig.key];
            if (av === undefined || av === null) av = '';
            if (bv === undefined || bv === null) bv = '';
            if (sortConfig.key === 'updatedAt' || sortConfig.key === 'createdAt') {
                av = av?.toMillis?.() || 0;
                bv = bv?.toMillis?.() || 0;
            } else {
                av = String(av).toLowerCase();
                bv = String(bv).toLowerCase();
            }
            if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
            if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [leads, searchQuery, filterStage, filterAssignee, sortConfig]);

    const analytics = useMemo(() => {
        const total = leads.length;
        const pipeline = leads.filter(l => !['Won', 'Lost'].includes(l.stage)).length;
        const won = leads.filter(l => l.stage === 'Won').length;
        const lost = leads.filter(l => l.stage === 'Lost').length;
        const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;
        const byStage = {};
        STAGES.forEach(s => { byStage[s] = leads.filter(l => l.stage === s).length; });
        return { total, pipeline, won, winRate, byStage };
    }, [leads]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-32 gap-4">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-purple-600 rounded-full animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading...</p>
        </div>
    );

    return (
        <div className="animate-in fade-in duration-300 pb-12">
            {/* ── Header ── */}
            {!showDashboard && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <Users size={16} className="text-purple-600" /> CRM
                        </h2>
                        <button onClick={() => { setEditingLead(null); setShowForm(true); setShowDashboard(false); }}
                            className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm">
                            <Plus size={14} /> New
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            {[{ id: 'list', icon: List, label: 'Table' }, { id: 'kanban', icon: Kanban, label: 'Board' }, { id: 'analytics', icon: BarChart2, label: 'Stats' }].map(v => (
                                <button key={v.id} onClick={() => { setViewMode(v.id); setShowDashboard(false); }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === v.id && !showDashboard ? 'bg-white dark:bg-slate-600 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <v.icon size={12} />{v.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => { setEditingLead(null); setShowForm(true); setShowDashboard(false); }}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm">
                            <Plus size={14} /> New Lead
                        </button>
                    </div>
                </div>
            )}

            {/* ── Dashboard (Detailed Lead View) ── */}
            {showDashboard && editingLead && (
                <ClientDashboard
                    lead={editingLead}
                    user={user}
                    userRole={userRole}
                    onBack={() => setShowDashboard(false)}
                    onOpenLEDCalculator={onOpenLEDCalculator}
                />
            )}

            {!showDashboard && (
                <>
                    {/* ── Details Panel (Alternative to Cards) ── */}
                    {viewMode === 'analytics' ? (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                                {[
                                    { label: 'Total', value: analytics.total },
                                    { label: 'Pipeline', value: analytics.pipeline },
                                    { label: 'Won', value: analytics.won },
                                    { label: 'Win Rate', value: `${analytics.winRate}%` },
                                ].map(s => (
                                    <div key={s.label}>
                                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{s.label}</p>
                                        <p className="text-xl font-bold text-slate-800 dark:text-white leading-none">{s.value}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stage Distribution</h3>
                                {STAGES.map(stage => {
                                    const count = analytics.byStage[stage] || 0;
                                    const pct = analytics.total > 0 ? (count / analytics.total) * 100 : 0;
                                    const c = STAGE_COLORS[stage];
                                    return (
                                        <div key={stage} className="space-y-1">
                                            <div className="flex justify-between items-end">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${c.text}`}>{stage}</span>
                                                <span className="text-xs font-bold text-slate-400">{count}</span>
                                            </div>
                                            <div className="bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full rounded-full ${c.dot.replace('bg-', 'bg-')}`} style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* Only show very compact stats grid in other views */
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-6 gap-y-2 py-2 border-b border-slate-200 dark:border-slate-700 mb-4 px-1">
                            {[
                                { label: 'Total', value: analytics.total, color: 'text-slate-600' },
                                { label: 'Pipeline', value: analytics.pipeline, color: 'text-blue-600' },
                                { label: 'Won', value: analytics.won, color: 'text-emerald-600' },
                                { label: 'Win Rate', value: `${analytics.winRate}%`, color: 'text-amber-600' },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{s.label}:</span>
                                    <span className={`text-xs font-bold ${s.color}`}>{s.value}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'kanban' && <KanbanView leads={filteredLeads} onEdit={(l) => { setEditingLead(l); setShowDashboard(true); }} onStageChange={handleStageChange} />}

                    {viewMode === 'list' && (
                        <>
                            {/* Toolbar */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                                        placeholder="Search by company or contact..."
                                    />
                                </div>
                                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                                    <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none">
                                        <option value="All">All Stages</option>
                                        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
                                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none">
                                        <option value="All">All Agents</option>
                                        {usersList.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                                <div className="overflow-hidden">
                                    <table className="w-full table-fixed sm:table-auto border-collapse">
                                        <thead className="hidden sm:table-header-group">
                                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                                <SortableHeader label="Company" columnKey="companyName" sortConfig={sortConfig} onSort={handleSort} />
                                                <SortableHeader label="Contact" columnKey="contactName" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell" />
                                                <SortableHeader label="Added" columnKey="createdAt" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell" />
                                                <SortableHeader label="Stage" columnKey="stage" sortConfig={sortConfig} onSort={handleSort} />
                                                <SortableHeader label="Source" columnKey="source" sortConfig={sortConfig} onSort={handleSort} className="hidden xl:table-cell" />
                                                <SortableHeader label="Agent" columnKey="assignedTo" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell" />
                                                <th className="px-3 py-2 w-8" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                            {filteredLeads.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-xs italic">
                                                        No results found.
                                                    </td>
                                                </tr>
                                            )}
                                            {filteredLeads.map((lead, idx) => (
                                                <tr key={lead.id} onClick={() => { setEditingLead(lead); setShowDashboard(true); }}
                                                    className={`group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors flex flex-col sm:table-row ${idx % 2 === 0 ? '' : 'bg-slate-50/30 dark:bg-slate-800/20'}`}>
                                                    <td className="px-3 py-2 w-full sm:w-auto">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                                                                {(lead.companyName || lead.contactName || '?')[0].toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-bold text-slate-800 dark:text-white text-wrap break-words">{lead.companyName || '—'}</p>
                                                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                                    {lead.location && <p className="text-[9px] text-slate-400 text-wrap break-words">{lead.location}</p>}
                                                                    <p className="sm:hidden text-[9px] text-slate-500 font-medium text-wrapbreak-words">• {lead.contactName || '—'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-1 sm:py-2 hidden md:table-cell">
                                                        <p className="text-xs text-slate-700 dark:text-slate-300 text-wrap break-words">{lead.contactName || '—'}</p>
                                                    </td>
                                                    <td className="px-3 py-1 sm:py-2 hidden lg:table-cell">
                                                        <span className="text-[10px] text-slate-400 tabular-nums">{fmtDate(lead.createdAt)}</span>
                                                    </td>
                                                    <td className="px-3 py-2 sm:table-cell w-full sm:w-auto">
                                                        <div className="flex sm:block items-center justify-between gap-4">
                                                            <span className="sm:hidden text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stage</span>
                                                            <div className="relative inline-block w-full max-w-[120px]" onClick={e => e.stopPropagation()}>
                                                                <select
                                                                    value={lead.stage}
                                                                    onChange={e => handleStageChange(lead.id, e.target.value)}
                                                                    className={`appearance-none cursor-pointer w-full px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider focus:outline-none border shadow-sm ${STAGE_COLORS[lead.stage]?.bg} ${STAGE_COLORS[lead.stage]?.text} border-current/10`}
                                                                >
                                                                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                                                </select>
                                                                <ChevronDown size={10} className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 ${STAGE_COLORS[lead.stage]?.text}`} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-1 sm:py-2 hidden xl:table-cell text-[10px] text-slate-500 uppercase tracking-wider">
                                                        {lead.source || '—'}
                                                    </td>
                                                    <td className="px-3 py-1 sm:py-2 hidden md:table-cell text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tighter">
                                                        {lead.assignedTo || '—'}
                                                    </td>
                                                    <td className="px-3 py-1 sm:py-2 sm:table-cell w-full sm:w-auto mt-1 sm:mt-0 pb-3 sm:pb-2">
                                                        <div className="flex items-center justify-end sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {(isAdmin || lead.assignedTo === user.username || lead.createdBy === user.username) && (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                                                                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 sm:p-2 rounded-lg text-red-500 sm:text-slate-300 hover:text-red-500 border border-red-100 sm:border-transparent hover:bg-red-50 dark:hover:bg-red-900/40 transition-all font-bold text-[10px] uppercase sm:normal-case"
                                                                    title="Delete">
                                                                    <Trash2 size={12} /> <span className="sm:hidden">Delete</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ── Modal ── */}
            {showForm && (
                <LeadFormModal
                    lead={editingLead}
                    usersList={usersList}
                    onSave={handleSaveLead}
                    onClose={() => { setShowForm(false); setEditingLead(null); }}
                />
            )}
        </div>
    );
};

export default CRMManager;
