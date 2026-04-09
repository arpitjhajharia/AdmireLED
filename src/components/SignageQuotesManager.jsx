import React from 'react';
import { Eye, Printer, Trash2, FileText, Download, Copy, Edit, Box, Monitor, Sun, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';
import SignageQuoteLayout from './SignageQuoteLayout';

const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const day = d.getDate();
    const month = d.toLocaleString('en-IN', { month: 'short' });
    const year = d.getFullYear();
    const time = d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day} ${month} ${year}, ${time}`;
};

const SignageQuotesManager = ({ user, onLoadQuote, readOnly = false }) => {
    const [quotes, setQuotes] = React.useState([]);
    const [viewQuote, setViewQuote] = React.useState(null);
    const [expandedRefs, setExpandedRefs] = React.useState({});
    const [searchTerm, setSearchTerm] = React.useState('');

    React.useEffect(() => {
        if (!user) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_quotes')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snap => {
                setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
        return () => unsub();
    }, [user]);

    // Grouping by Ref for versioning
    const groupedQuotes = React.useMemo(() => {
        const filtered = quotes.filter(q => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (q.project || '').toLowerCase().includes(term) ||
                (q.client || '').toLowerCase().includes(term) ||
                (q.ref || '').toLowerCase().includes(term);
        });

        const groups = {};
        filtered.forEach(q => {
            const ref = q.ref || '—';
            if (!groups[ref]) groups[ref] = [];
            groups[ref].push(q);
        });

        // Sort versions within each group by date descending
        Object.keys(groups).forEach(ref => {
            groups[ref].sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                return dateB - dateA;
            });
        });

        // Create a flat list of parent quotes
        const parents = Object.keys(groups).map(ref => {
            const group = groups[ref];
            return {
                ...group[0], // Latest is the parent shown in main list
                versions: group,
                versionCount: group.length
            };
        });

        // Sort parents by date descending
        return parents.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA;
        });
    }, [quotes, searchTerm]);

    const toggleGroup = (ref) => {
        setExpandedRefs(prev => ({ ...prev, [ref]: !prev[ref] }));
    };

    const getScreens = (quote) => {
        if (quote.state?.screens?.length > 0) return quote.state.screens;
        return [{
            name: 'Board 1',
            width: quote.state?.width || 0,
            height: quote.state?.height || 0,
            screenQty: quote.state?.screenQty || 1
        }];
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this signage quote?")) {
            const qToDel = quotes.find(q => q.id === id);
            if (qToDel && qToDel.clientId) {
                try {
                    // find document in CRM by globalQuoteId and delete it
                    const crmQuotesSnap = await db.collection('artifacts').doc(appId).collection('public').doc('data')
                        .collection('crm_leads').doc(qToDel.clientId).collection('quotes')
                        .where('globalQuoteId', '==', id).get();
                    
                    const batch = db.batch();
                    crmQuotesSnap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                } catch (err) { console.error("Error deleting CRM quote link:", err); }
            }
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_quotes').doc(id).delete();
        }
    };

    return (
        <div className="p-3 md:p-4 animate-in fade-in duration-300">
            {/* ── View/Print Modal ── */}
            {viewQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-slate-900 max-w-4xl w-full h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-t-2xl">
                            <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                                <Eye size={20} className="text-pink-600" /> Signage Quote: {viewQuote.ref}
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={() => setViewQuote(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Close</button>
                                <button onClick={() => {
                                    const originalTitle = document.title;
                                    document.title = `${viewQuote.client}_${viewQuote.project}_SignageQuote`.replace(/[^a-zA-Z0-9_]/g, '_');
                                    window.print();
                                    document.title = originalTitle;
                                }} className="px-4 py-2 bg-pink-600 text-white hover:bg-pink-700 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                                    <Printer size={16} /> Print / PDF
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-100 dark:bg-slate-800 flex justify-center">
                            <div className="bg-white w-[210mm] min-h-[297mm] shadow-lg text-slate-800 print:shadow-none print:w-auto print:min-h-0">
                                <SignageQuoteLayout
                                    state={viewQuote.state}
                                    allScreensTotal={viewQuote.allScreensTotal}
                                    calculation={viewQuote.calculation}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-600 to-rose-600 flex items-center justify-center shadow-sm">
                        <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Signage Quotes
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {groupedQuotes.length} {groupedQuotes.length === 1 ? 'quote' : 'quotes'} total
                        </p>
                    </div>
                </div>

                {/* Search bar */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search project or client…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300 dark:focus:ring-pink-600 focus:border-transparent placeholder:text-slate-400 transition-shadow"
                    />
                </div>
            </div>

            {/* ── Desktop Layout (Data Table) ── */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                            <thead>
                            <tr className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700">
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Ref</th>
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Project</th>
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Client</th>
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Board</th>
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Dimensions</th>
                                <th scope="col" className="px-3 py-2.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Qty</th>
                                <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Estimate Total</th>
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Saved Date</th>
                                <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 transition-all">
                            {groupedQuotes.map((parent, parentIdx) => {
                                const isExpanded = expandedRefs[parent.ref];
                                const hasVersions = parent.versionCount > 1;

                                const renderRow = (quote, isChild = false, vIdx = 0) => {
                                    const screens = getScreens(quote);
                                    const versionNumber = isChild ? (parent.versionCount - vIdx) : parent.versionCount;

                                    return (
                                        <tr key={quote.id} className={`group transition-all duration-100 ${isChild ? 'bg-slate-50/40 dark:bg-slate-900/40' : (parentIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50')} hover:bg-pink-50/50 dark:hover:bg-slate-700/60`}>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    {!isChild && hasVersions && (
                                                        <button onClick={() => toggleGroup(parent.ref)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                                                            {isExpanded ? <ChevronDown size={14} className="text-pink-600" /> : <ChevronRight size={14} className="text-slate-400" />}
                                                        </button>
                                                    )}
                                                    {(!hasVersions || isChild) && !isChild && <div className="w-5" />}
                                                    {isChild && <div className="w-8 border-l border-b border-pink-200 dark:border-pink-900 h-4 ml-2 mr-1" />}
                                                    
                                                    <div className="text-[12px] font-mono font-bold text-slate-500 uppercase flex items-center gap-1">
                                                        {quote.ref || '—'}
                                                        <span className="text-[10px] font-black text-pink-500 ml-1">V{versionNumber}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 max-w-[160px]">
                                                <div className="text-[13px] font-semibold text-slate-800 dark:text-white truncate leading-tight" title={quote.project}>
                                                    {quote.project || 'Untitled'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 max-w-[140px]">
                                                <div className="text-[12px] text-slate-500 dark:text-slate-400 truncate leading-tight" title={quote.client}>
                                                    {quote.client || '—'}
                                                </div>
                                            </td>
                                            {/* Board Column */}
                                            <td className="px-3 py-2 min-w-[120px]">
                                                <div className="flex flex-col gap-1 py-1">
                                                    {screens.map((s, sIdx) => (
                                                        <div key={sIdx} className="flex items-center gap-1.5 text-[11px] leading-tight">
                                                            {screens.length > 1 && <span className="text-[9px] text-slate-400 font-bold w-3">{sIdx + 1}</span>}
                                                            <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[100px]" title={s.name}>{s.name || `Board ${sIdx+1}`}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            {/* Dimensions Column */}
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="flex flex-col gap-1 py-1">
                                                    {screens.map((s, sIdx) => (
                                                        <div key={sIdx} className="text-[11px] leading-tight tabular-nums text-slate-700 dark:text-slate-300">
                                                            {s.width} × {s.height} {quote.state?.unit || 'ft'}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            {/* Qty Column */}
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="flex flex-col gap-1 py-1">
                                                    {screens.map((s, sIdx) => (
                                                        <div key={sIdx} className="text-[11px] leading-tight tabular-nums font-bold text-slate-900 dark:text-white text-center">
                                                            {s.screenQty || 1}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right">
                                                <span className="text-[13px] font-extrabold text-slate-800 dark:text-white tabular-nums tracking-tight">
                                                    {formatCurrency(quote.totalAmount, 'INR')}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                                                    {formatDate(quote.createdAt)}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setViewQuote(quote)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="View"><Eye size={14} /></button>
                                                    {!readOnly && (
                                                        <>
                                                            {onLoadQuote && (
                                                                <>
                                                                    <button onClick={() => onLoadQuote(quote, false)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Edit"><Edit size={14} /></button>
                                                                    <button onClick={() => onLoadQuote(quote, true)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:bg-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="Clone"><Copy size={14} /></button>
                                                                </>
                                                            )}
                                                            <button onClick={() => handleDelete(quote.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Delete"><Trash2 size={14} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                };

                                return (
                                    <React.Fragment key={parent.id}>
                                        {renderRow(parent)}
                                        {isExpanded && hasVersions && parent.versions.slice(1).map((v, vIdx) => (
                                            renderRow(v, true, vIdx + 1)
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {groupedQuotes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-t border-slate-100 dark:border-slate-800">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-4">
                            <FileText className="w-7 h-7 text-slate-300 dark:text-slate-500" />
                        </div>
                        <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mb-1">
                            {searchTerm ? 'No matching signage quotes' : 'No saved signage quotes yet'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SignageQuotesManager;
