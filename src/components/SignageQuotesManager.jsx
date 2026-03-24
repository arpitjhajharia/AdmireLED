import React from 'react';
import { Eye, Printer, Trash2, FileText, Download, Copy, Edit, Box, Monitor, Sun, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';
// Note: We create a simple Print View internally since the calculation is simple.

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

    const filteredQuotes = React.useMemo(() => {
        return quotes.filter(q => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (q.project || '').toLowerCase().includes(term) ||
                (q.client || '').toLowerCase().includes(term) ||
                (q.ref || '').toLowerCase().includes(term);
        });
    }, [quotes, searchTerm]);

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
                            {/* Simple A4 Print Container */}
                            <div className="bg-white w-[210mm] min-h-[297mm] shadow-lg p-10 text-slate-800 print:shadow-none print:w-auto print:min-h-0">
                                <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
                                    <div>
                                        <h1 className="text-3xl font-black text-slate-900 uppercase">Signage Estimate</h1>
                                        <p className="text-sm font-bold text-slate-500 mt-1">Ref: {viewQuote.ref}</p>
                                    </div>
                                    <div className="text-right text-sm">
                                        <p className="font-bold text-slate-700">Date: {new Date(viewQuote.createdAt?.seconds * 1000).toLocaleDateString('en-IN')}</p>
                                    </div>
                                </div>

                                <div className="flex justify-between mb-8 text-sm">
                                    <div className="w-1/2">
                                        <p className="font-bold text-slate-500 uppercase text-[10px] mb-1">To</p>
                                        <p className="font-bold text-lg">{viewQuote.client}</p>
                                        <p className="text-slate-600">Project: {viewQuote.project}</p>
                                    </div>
                                    <div className="w-1/3 p-3 bg-slate-50 rounded border border-slate-100">
                                        <p className="text-xs font-bold text-slate-500 mb-1">Specifications</p>
                                        <p>Dims: <b>{viewQuote.state.width} x {viewQuote.state.height} {viewQuote.state.unit}</b></p>
                                        <p>Area: <b>{viewQuote.calculation.visualAreaSqFt.toFixed(2)} Sq.Ft</b></p>
                                        <p>Environment: <b>{viewQuote.state.environment}</b></p>
                                    </div>
                                </div>

                                <table className="w-full text-sm mb-6 pb-6 border-b-2 border-slate-200">
                                    <thead>
                                        <tr className="bg-slate-100 text-left font-bold text-slate-700">
                                            <th className="p-2 border border-slate-200">Description</th>
                                            <th className="p-2 border border-slate-200 text-center">Qty / UOM</th>
                                            <th className="p-2 border border-slate-200 text-right">Ext. Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="p-2 border border-slate-200">
                                                <b>Complete Manufactured Signage Solution</b><br/>
                                                <span className="text-[11px] text-slate-500">
                                                    - Structural Frame: {viewQuote.state.frameStyle}<br/>
                                                    - Profile Edge: {viewQuote.state.profiles.baseId ? 'Aluminium Extrusion Base' : 'Custom Base'}
                                                </span>
                                            </td>
                                            <td className="p-2 border border-slate-200 text-center">
                                                1 Set
                                            </td>
                                            <td className="p-2 border border-slate-200 text-right">
                                                {formatCurrency(viewQuote.calculation.totalCostEstimate, 'INR')} (Base)
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>

                                {/* Net Total */}
                                <div className="flex justify-end mt-4">
                                    <div className="w-64 text-right">
                                        <div className="flex justify-between py-2 text-sm">
                                            <span>Subtotal</span>
                                            <span className="font-bold">{formatCurrency(viewQuote.calculation.totalCostEstimate, 'INR')}</span>
                                        </div>
                                        <div className="flex justify-between py-2 text-xl font-black text-slate-900 border-t-2 border-slate-800">
                                            <span>Net Total</span>
                                            <span>{formatCurrency(viewQuote.calculation.finalSellPrice, 'INR')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-16 pt-4 border-t border-slate-200 text-xs text-slate-500 text-center">
                                    <p>This is a system generated estimate for reference purposes. Final invoice may vary based on exact manufacturing requirements.</p>
                                </div>
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
                            {filteredQuotes.length} {filteredQuotes.length === 1 ? 'quote' : 'quotes'} total
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
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Dimensions</th>
                                <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Estimate Total</th>
                                <th scope="col" className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Saved Date</th>
                                <th scope="col" className="px-3 py-2.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 transition-all">
                            {filteredQuotes.map((quote, idx) => (
                                <tr key={quote.id} className={`group transition-all duration-100 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50'} hover:bg-pink-50/50 dark:hover:bg-slate-700/60`}>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="text-[12px] font-mono font-bold text-slate-500 uppercase flex items-center gap-1">
                                            {quote.ref || '—'}
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
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="text-[12px] font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                                            {quote.state?.width} × {quote.state?.height} {quote.state?.unit}
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
                                                            <button onClick={() => onLoadQuote(quote, true)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="Clone"><Copy size={14} /></button>
                                                        </>
                                                    )}
                                                    <button onClick={() => handleDelete(quote.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Delete"><Trash2 size={14} /></button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredQuotes.length === 0 && (
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
