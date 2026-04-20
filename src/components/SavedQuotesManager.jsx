import React from 'react';
import { Eye, Printer, Trash2, FileText, Download, Copy, Edit, Box, Monitor, Sun, Search, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, calculateBOM, generateId } from '../lib/utils';
import PrintLayout from './PrintLayout';
import BOMLayout from './BOMLayout';

// --- HELPER FUNCTIONS ---
const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const day = d.getDate();
    const month = d.toLocaleString('en-IN', { month: 'short' });
    const year = d.getFullYear();
    const time = d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day} ${month} ${year}, ${time}`;
};

// --- SUB-COMPONENTS (Moved outside to avoid "Cannot create components during render") ---

const QuoteRow = ({ quote, group, isLatest, isExpanded, onToggle, rowIdx, perms, onHandleView, onHandleBOMView, onLoadQuote, handleDownloadExcel, handleDelete }) => {
    const state = quote.calculatorState || {};
    const isIndoor = state.selectedIndoor === 'true';
    const pitch = quote.allScreensData?.screenConfigs?.[0]?.selectedPitch || state.selectedPitch;
    const calcs = quote.allScreensData?.calculations;
    const versionNum = group.all.length - group.all.indexOf(quote);

    return (
        <tr
            className={`group transition-all duration-100 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50'} hover:bg-blue-50/50 dark:hover:bg-slate-700/60 ${!isLatest ? 'bg-slate-50 dark:bg-slate-900/40 opacity-90' : ''}`}
        >
            {/* Ref & Expand */}
            <td className="px-3 py-1 whitespace-nowrap">
                <div className="flex items-center gap-2">
                    {isLatest && group.older.length > 0 && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggle(group.ref); }}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            {isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                        </button>
                    )}
                    {!isLatest && <div className="w-5" />}
                    <div className="flex flex-col">
                        <div className="text-[12px] font-mono font-bold text-slate-500 uppercase flex items-center gap-1">
                            {quote.ref || '—'}
                            <span className={`text-[10px] px-1 rounded ${isLatest ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                                v{versionNum}
                            </span>
                        </div>
                    </div>
                </div>
            </td>
            {/* Project */}
            <td className="px-3 py-1 max-w-[160px]">
                <div className="text-[13px] font-semibold text-slate-800 dark:text-white truncate leading-tight" title={quote.project}>
                    {quote.project || 'Untitled'}
                </div>
            </td>

            {/* Client */}
            <td className="px-3 py-1 max-w-[140px]">
                <div className="text-[12px] text-slate-500 dark:text-slate-400 truncate leading-tight" title={quote.client}>
                    {quote.client || '—'}
                </div>
            </td>

            <td className="px-3 py-1 whitespace-nowrap">
                <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-bold uppercase tracking-wide ${isIndoor ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                    {isIndoor ? <Monitor size={10} /> : <Sun size={10} />}
                    {isIndoor ? 'In' : 'Out'}
                </span>
            </td>

            <td className="px-3 py-1 whitespace-nowrap">
                {pitch ? <span className="inline-flex items-center px-1 py-px rounded text-[10px] font-bold tracking-wide bg-violet-50 text-violet-600 ring-1 ring-violet-200/60 dark:bg-violet-900/20 dark:text-violet-400">P{pitch}</span> : <span className="text-[12px] text-slate-400 italic">—</span>}
            </td>

            <td className="px-3 py-1 align-top">
                <div className="space-y-0.5">
                    {calcs ? calcs.map((calc, idx) => (
                        <div key={idx} className="flex items-center gap-1 h-[20px]">
                            {calcs.length > 1 && <span className="flex-shrink-0 w-3.5 h-3.5 rounded-sm bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500">{idx + 1}</span>}
                            <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                                {(Number(calc.finalWidth) * 3.28084).toFixed(1)}×{(Number(calc.finalHeight) * 3.28084).toFixed(1)}
                            </span>
                        </div>
                    )) : <span className="text-[12px] text-slate-400 italic">Single screen</span>}
                </div>
            </td>

            <td className="px-3 py-1 align-top">
                <div className="space-y-0.5">
                    {calcs ? calcs.map((calc, idx) => (
                        <div key={idx} className="flex items-center h-[20px]">
                            <span className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">{calc.finalWidth}×{calc.finalHeight}</span>
                        </div>
                    )) : <span className="text-[12px] text-slate-400 italic">—</span>}
                </div>
            </td>

            <td className="px-3 py-1 align-top text-center border-r border-slate-100 dark:border-slate-800">
                <div className="space-y-0.5 w-full">
                    {calcs ? calcs.map((calc, idx) => (
                        <div key={idx} className="flex items-center justify-center h-[20px]">
                            <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">{calc.screenQty}</span>
                        </div>
                    )) : <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300 tabular-nums italic">1</span>}
                </div>
            </td>

            {!perms['savedQuotes.hideAmounts'] && (
                <td className="px-3 py-1 whitespace-nowrap text-right">
                    <span className="text-[13px] font-extrabold text-slate-800 dark:text-white tabular-nums tracking-tight">
                        {formatCurrency(quote.finalAmount, 'INR')}
                    </span>
                </td>
            )}

            <td className="px-3 py-1 whitespace-nowrap">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    {formatDate(quote.updatedAt)}
                </div>
            </td>

            <td className="px-3 py-1 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!perms['savedQuotes.hideAmounts'] && (
                        <button onClick={() => onHandleView(quote)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="View Quote"><Eye size={14} /></button>
                    )}
                    <button onClick={() => onHandleBOMView(quote)} className="p-1.5 text-teal-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg" title="View BOM"><Box size={14} /></button>
                    {perms['savedQuotes.load'] && (
                        <button onClick={() => onLoadQuote(quote, false)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Edit"><Edit size={14} /></button>
                    )}
                    {perms['savedQuotes.downloadBOM'] && (
                        <button onClick={() => handleDownloadExcel(quote)} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg" title="Download BOM"><Download size={14} /></button>
                    )}
                    {perms['savedQuotes.clone'] && (
                        <button onClick={() => onLoadQuote(quote, true)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="Clone"><Copy size={14} /></button>
                    )}
                    {perms['savedQuotes.delete'] && (
                        <button onClick={() => handleDelete(quote.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Delete"><Trash2 size={14} /></button>
                    )}
                </div>
            </td>
        </tr>
    );
};

const QuoteCard = ({ quote, group, isLatest, isExpanded, onToggle, perms, onHandleView, onHandleBOMView, onLoadQuote, handleDownloadExcel, handleDelete }) => {
    const state = quote.calculatorState || {};
    const isIndoor = state.selectedIndoor === 'true';
    const pitch = quote.allScreensData?.screenConfigs?.[0]?.selectedPitch || state.selectedPitch;
    const versionNum = group.all.length - group.all.indexOf(quote);

    return (
        <div className={`quote-card-animate group bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-all duration-200 ease-out overflow-hidden flex flex-col border-t-2 ${isIndoor ? 'border-t-blue-400' : 'border-t-amber-400'} ${!isLatest ? 'bg-slate-50 dark:bg-slate-900/40 opacity-90 scale-[0.98] -mt-1 origin-top' : ''}`}>
            <div className="p-3 flex-1 flex flex-col">
                <div className="flex justify-between items-start gap-2 mb-0.5">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[15px] text-slate-800 dark:text-white leading-snug line-clamp-1 tracking-[-0.01em]" title={quote.project}>
                            {quote.project || 'Untitled'}
                            <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded font-mono font-bold bg-purple-50 text-purple-600 dark:bg-purple-900/20">v{versionNum}</span>
                        </h3>
                        {quote.ref && (
                            <p className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 dark:bg-slate-900/40 px-1 rounded border border-slate-100 dark:border-slate-700 w-fit mt-0.5 uppercase">
                                {quote.ref}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-bold uppercase tracking-wider ${isIndoor ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60' : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60'}`}>
                            {isIndoor ? <Monitor size={10} /> : <Sun size={10} />}
                            {isIndoor ? 'Indoor' : 'Outdoor'}
                        </span>
                        {pitch && (
                            <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-bold tracking-wider bg-violet-50 text-violet-600 ring-1 ring-violet-200/60 dark:bg-violet-900/20 dark:text-violet-400 dark:ring-violet-700/40">
                                P{pitch}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{quote.client || 'No Client'}</p>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{formatDate(quote.updatedAt)}</p>
                </div>

                {/* Expand Older Versions Button (Mobile) */}
                {isLatest && group.older.length > 0 && (
                    <button 
                        onClick={() => onToggle(group.ref)}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 mb-2 transition-colors"
                    >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {group.older.length} Older Version{group.older.length > 1 ? 's' : ''}
                    </button>
                )}

                <div className="space-y-1 mb-2 flex-1">
                    {quote.allScreensData?.calculations ? (
                        quote.allScreensData.calculations.map((calc, idx) => (
                            <div key={idx} className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">{idx + 1}</span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                        {(Number(calc.finalWidth) * 3.28084).toFixed(1)}×{(Number(calc.finalHeight) * 3.28084).toFixed(1)}ft
                                        <span className="text-slate-400 dark:text-slate-500 ml-1">/ {calc.finalWidth}×{calc.finalHeight}m</span>
                                        <span className="text-slate-400 dark:text-slate-500"> ×{calc.screenQty}</span>
                                    </span>
                                </div>
                                {!perms['savedQuotes.hideAmounts'] && <span className="flex-shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(calc.totalProjectSell, 'INR', true)}</span>}
                            </div>
                        ))
                    ) : (
                        <div className="flex justify-between items-center gap-2">
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">1</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">Single Screen</span>
                            </div>
                            {!perms['savedQuotes.hideAmounts'] && <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(quote.finalAmount, 'INR', true)}</span>}
                        </div>
                    )}
                </div>

                {!perms['savedQuotes.hideAmounts'] && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 mt-auto">
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimate</span>
                            <span className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white price-shimmer tabular-nums">{formatCurrency(quote.finalAmount, 'INR')}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className={`flex items-center justify-evenly px-2 py-1.5 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/80`}>
                {!perms['savedQuotes.hideAmounts'] && <button onClick={() => onHandleView(quote)} className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700" title="View Quote"><Eye size={16} /></button>}
                <button onClick={() => onHandleBOMView(quote)} className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-teal-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20" title="View BOM"><Box size={16} /></button>
                {perms['savedQuotes.load'] && <button onClick={() => onLoadQuote(quote, false)} className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Edit"><Edit size={16} /></button>}
                {perms['savedQuotes.downloadBOM'] && <button onClick={() => handleDownloadExcel(quote)} className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Download Excel"><Download size={16} /></button>}
                {perms['savedQuotes.clone'] && <button onClick={() => onLoadQuote(quote, true)} className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700" title="Clone"><Copy size={16} /></button>}
                {perms['savedQuotes.delete'] && <button onClick={() => handleDelete(quote.id)} className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 size={16} /></button>}
            </div>
        </div>
    );
};

const SavedQuotesManager = ({ user, inventory, transactions, exchangeRate, onLoadQuote, perms = {} }) => {
    const [quotes, setQuotes] = React.useState([]);
    const [viewQuote, setViewQuote] = React.useState(null);
    const [viewBOMQuote, setViewBOMQuote] = React.useState(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [expandedGroups, setExpandedGroups] = React.useState(new Set());
    const [allQuoteImages, setAllQuoteImages] = React.useState([]);

    React.useEffect(() => {
        if (!user || !db) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quote_images')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snap => {
                setAllQuoteImages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }, err => console.error('quote_images fetch error:', err));
        return () => unsub();
    }, [user]);

    const toggleGroup = (ref) => {
        const next = new Set(expandedGroups);
        if (next.has(ref)) next.delete(ref);
        else next.add(ref);
        setExpandedGroups(next);
    };

    const groupedQuotes = React.useMemo(() => {
        const groups = {};
        // Use full quotes here if searching is applied to the group level, or filteredQuotes
        // Let's filter first then group.
        const filtered = quotes.filter(q => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (q.project || '').toLowerCase().includes(term) ||
                (q.client || '').toLowerCase().includes(term) ||
                (q.ref || '').toLowerCase().includes(term);
        });

        filtered.forEach(q => {
            const key = (q.ref || q.project || 'Untitled');
            if (!groups[key]) groups[key] = [];
            groups[key].push(q);
        });

        return Object.entries(groups).map(([ref, versions]) => {
            const sorted = [...versions].sort((a,b) => {
                const at = a.updatedAt?.seconds || 0;
                const bt = b.updatedAt?.seconds || 0;
                return bt - at;
            });
            return {
                ref,
                latest: sorted[0],
                older: sorted.slice(1),
                all: sorted
            };
        }).sort((a,b) => {
            const at = a.latest.updatedAt?.seconds || 0;
            const bt = b.latest.updatedAt?.seconds || 0;
            return bt - at;
        });
    }, [quotes, searchTerm]);

    React.useEffect(() => {
        if (!user) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes')
            .orderBy('updatedAt', 'desc')
            .onSnapshot(snap => {
                setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
        return () => unsub();
    }, [user]);

    // Internal helpers removed (moved outside)

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this quote?")) {
            const qToDel = quotes.find(q => q.id === id);
            if (qToDel && qToDel.crmQuoteId && qToDel.clientId) {
                try {
                    await db.collection('artifacts').doc(appId).collection('public').doc('data')
                        .collection('crm_leads').doc(qToDel.clientId).collection('quotes').doc(qToDel.crmQuoteId).delete();
                } catch (err) { console.error("Error deleting CRM quote version:", err); }
            }
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes').doc(id).delete();
        }
    };

    const resolveQuoteData = (quote) => {
        const refImageIds = quote.calculatorState?.refImages || [];
        const resolvedRefImages = refImageIds
            .map(id => allQuoteImages.find(img => img.id === id))
            .filter(Boolean);

        // Terms from calculatorState is always the source of truth for display
        const stateTerms = quote.calculatorState?.terms || {};

        if (quote.allScreensData) {
            // Inject stateTerms into each calculation so PrintLayout always shows correct scope/terms
            const enrichedCalcs = (quote.allScreensData.calculations || []).map(calc => ({
                ...calc,
                terms: { ...(calc.terms || {}), ...stateTerms, scope: { ...(calc.terms?.scope || {}), ...(stateTerms.scope || {}) } }
            }));
            const enrichedAllScreensData = { ...quote.allScreensData, calculations: enrichedCalcs };
            return { allScreensData: enrichedAllScreensData, client: quote.client, project: quote.project, refImages: resolvedRefImages };
        }

        const state = quote.calculatorState;
        if (state.screens && state.screens.length > 0) {
            const allCalculations = state.screens.map((screen) => {
                const screenCalcState = { ...state, ...screen };
                return calculateBOM(screenCalcState, inventory, transactions, exchangeRate);
            }).filter(calc => calc !== null);

            if (allCalculations.length > 0) {
                const calculatedData = {
                    totalProjectCost: allCalculations.reduce((sum, calc) => sum + calc.totalProjectCost, 0),
                    totalProjectSell: allCalculations.reduce((sum, calc) => sum + calc.totalProjectSell, 0),
                    totalLEDSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.led.sell * calc.screenQty), 0),
                    totalServicesSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.sell.total - (calc.matrix.led.sell * calc.screenQty)), 0),
                    totalMargin: 0,
                    totalScreenQty: allCalculations.reduce((sum, calc) => sum + Number(calc.screenQty), 0),
                    calculations: allCalculations,
                    screenConfigs: state.screens
                };
                calculatedData.totalMargin = calculatedData.totalProjectSell - calculatedData.totalProjectCost;
                return { allScreensData: calculatedData, client: quote.client, project: quote.project, refImages: resolvedRefImages };
            }
        } else {
            const result = calculateBOM(state, inventory, transactions, exchangeRate);
            if (result) return { data: result, client: quote.client, project: quote.project, refImages: resolvedRefImages };
        }

        return null;
    };

    const handleView = (quote) => {
        const data = resolveQuoteData(quote);
        if (data) setViewQuote(data);
        else alert("Could not load quote data.");
    };

    const handleBOMView = (quote) => {
        const data = resolveQuoteData(quote);
        if (data) setViewBOMQuote(data);
        else alert("Could not load quote data.");
    };

    const handleDownloadExcel = (quote) => {
        if (!perms['savedQuotes.downloadBOM']) return;

        let calculations = [];
        let grandTotalSell = 0;
        let grandTotalCost = 0;

        if (quote.allScreensData && quote.allScreensData.calculations) {
            calculations = quote.allScreensData.calculations;
            grandTotalSell = quote.allScreensData.totalProjectSell;
            grandTotalCost = quote.allScreensData.totalProjectCost;
        } else {
            const state = quote.calculatorState;
            if (state && state.screens && state.screens.length > 0) {
                calculations = state.screens.map(screen => {
                    const screenState = { ...state, ...screen };
                    return calculateBOM(screenState, inventory, transactions, exchangeRate);
                }).filter(c => c !== null);
            } else {
                const result = calculateBOM(state, inventory, transactions, exchangeRate);
                if (result) calculations = [result];
            }
            if (calculations.length > 0) {
                grandTotalCost = calculations.reduce((acc, c) => acc + c.totalProjectCost, 0);
                grandTotalSell = calculations.reduce((acc, c) => acc + c.totalProjectSell, 0);
            }
        }

        if (calculations.length === 0) return alert("Calculation failed. Inventory items might be missing.");

        const safeProject = (quote.project || '').replace(/,/g, ' ');
        const safeClient = (quote.client || '').replace(/,/g, ' ');

        let csv = `Project,${safeProject}\nClient,${safeClient}\nDate,${new Date().toLocaleDateString()}\n\n`;

        calculations.forEach((calc, index) => {
            csv += `SCREEN CONFIGURATION #${index + 1}\n`;
            csv += `Dimensions,${calc.finalWidth}m x ${calc.finalHeight}m\n`;
            csv += `Quantity,${calc.screenQty}\n`;
            csv += `\nBill of Materials (Config #${index + 1})\nComponent,Specification,Qty/Scrn,Total Qty,Rate,Total Amount\n`;

            calc.detailedItems.forEach(item => {
                const name = (item.name || '').replace(/"/g, '""');
                const spec = (item.spec || '').replace(/"/g, '""');
                const totalQty = item.qty * calc.screenQty;
                const totalAmt = item.total * calc.screenQty;
                csv += `"${name}","${spec}",${item.qty},${totalQty},${item.unit.toFixed(2)},${totalAmt.toFixed(2)}\n`;
            });

            csv += `\nSubtotal (Cost),${calc.totalProjectCost.toFixed(2)}\n`;
            csv += `Subtotal (Sell),${calc.totalProjectSell.toFixed(2)}\n`;
            csv += `\n--------------------------------\n\n`;
        });

        csv += `PROJECT SUMMARY\n`;
        csv += `Grand Total Cost,${grandTotalCost.toFixed(2)}\n`;
        csv += `Grand Total Sell,${grandTotalSell.toFixed(2)}\n`;
        csv += `Net Margin,${(grandTotalSell - grandTotalCost).toFixed(2)}\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeClient.replace(/[^a-z0-9]/gi, '_')}_${safeProject.replace(/[^a-z0-9]/gi, '_')}_BOM.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // Filter quotes by search - Handled in groupedQuotes Memo now


    return (
        <div className="p-3 md:p-4">
            {/* ── View Quote Modal ── */}
            {viewQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white max-w-4xl w-full h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-2xl">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Eye size={20} className="text-slate-500" /> View Saved Quote
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={() => setViewQuote(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Close</button>
                                <button onClick={() => {
                                    const originalTitle = document.title;
                                    document.title = `${viewQuote.client}_${viewQuote.project}_Quote`.replace(/[^a-zA-Z0-9_]/g, '_');
                                    window.print();
                                    document.title = originalTitle;
                                }} className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                                    <Printer size={16} /> Print / PDF
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-200">
                            <PrintLayout
                                data={viewQuote.data ? { ...viewQuote.data, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                allScreensData={viewQuote.allScreensData ? { ...viewQuote.allScreensData, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                currency='INR'
                                exchangeRate={exchangeRate}
                                refImages={viewQuote.refImages || []}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── View BOM Modal ── */}
            {viewBOMQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white max-w-4xl w-full h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-2xl">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Box size={20} className="text-teal-600" /> Bill of Materials (BOM)
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={() => setViewBOMQuote(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Close</button>
                                <button onClick={() => {
                                    const originalTitle = document.title;
                                    document.title = `${viewBOMQuote.client}_${viewBOMQuote.project}_BOM`.replace(/[^a-zA-Z0-9_]/g, '_');
                                    window.print();
                                    document.title = originalTitle;
                                }} className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                                    <Printer size={16} /> Print / PDF
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-200">
                            <BOMLayout
                                data={viewBOMQuote.data ? { ...viewBOMQuote.data, clientName: viewBOMQuote.client, projectName: viewBOMQuote.project } : null}
                                allScreensData={viewBOMQuote.allScreensData ? {
                                    ...viewBOMQuote.allScreensData,
                                    clientName: viewBOMQuote.client,
                                    projectName: viewBOMQuote.project,
                                    screenConfigs: viewBOMQuote.allScreensData.screenConfigs?.map(s => ({ ...s, unit: s.unit || 'm' }))
                                } : null}
                                inventory={inventory}
                                transactions={transactions}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-sm">
                        <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Saved Quotes
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'} total
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
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 focus:border-transparent placeholder:text-slate-400 transition-shadow"
                    />
                </div>
            </div>

            {/* ── Mobile Layout (Card Grid) ── */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
                {groupedQuotes.map(group => {
                    const isExpanded = expandedGroups.has(group.ref);
                    return (
                        <React.Fragment key={group.ref}>
                            <QuoteCard 
                                group={group} 
                                quote={group.latest} 
                                isLatest={true} 
                                isExpanded={isExpanded} 
                                onToggle={toggleGroup} 
                                perms={perms}
                                onHandleView={handleView}
                                onHandleBOMView={handleBOMView}
                                onLoadQuote={onLoadQuote}
                                handleDownloadExcel={handleDownloadExcel}
                                handleDelete={handleDelete}
                            />
                            {isExpanded && group.older.map(v => (
                                <QuoteCard 
                                    key={v.id}
                                    group={group}
                                    quote={v}
                                    isLatest={false}
                                    perms={perms}
                                    onHandleView={handleView}
                                    onHandleBOMView={handleBOMView}
                                    onLoadQuote={onLoadQuote}
                                    handleDownloadExcel={handleDownloadExcel}
                                    handleDelete={handleDelete}
                                />
                            ))}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* ── Desktop Layout (Data Table) ── */}
            <div className="hidden md:block rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700">
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Ref</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Project</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Client</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Type</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Pitch</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Size (ft)</th>
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Size (m)</th>
                                <th scope="col" className="px-3 py-1.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Qty</th>
                                {!perms['savedQuotes.hideAmounts'] && <th scope="col" className="px-3 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Estimate</th>}
                                <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Saved</th>
                                <th scope="col" className="px-3 py-1.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-[0.08em] whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {groupedQuotes.map((group, groupIdx) => {
                                const isExpanded = expandedGroups.has(group.ref);
                                return (
                                    <React.Fragment key={group.ref}>
                                        <QuoteRow
                                            group={group}
                                            quote={group.latest}
                                            isLatest={true}
                                            isExpanded={isExpanded}
                                            onToggle={toggleGroup}
                                            rowIdx={groupIdx}
                                            perms={perms}
                                            onHandleView={handleView}
                                            onHandleBOMView={handleBOMView}
                                            onLoadQuote={onLoadQuote}
                                            handleDownloadExcel={handleDownloadExcel}
                                            handleDelete={handleDelete}
                                        />
                                        {isExpanded && group.older.map((v, vIdx) => (
                                            <QuoteRow
                                                key={v.id}
                                                group={group}
                                                quote={v}
                                                isLatest={false}
                                                rowIdx={vIdx}
                                                perms={perms}
                                                onHandleView={handleView}
                                                onHandleBOMView={handleBOMView}
                                                onLoadQuote={onLoadQuote}
                                                handleDownloadExcel={handleDownloadExcel}
                                                handleDelete={handleDelete}
                                            />
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer row count */}
                {groupedQuotes.length > 0 && (
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                            {groupedQuotes.length === quotes.length
                                ? `${quotes.length} ${quotes.length === 1 ? 'quote' : 'quotes'}`
                                : `${groupedQuotes.length} groups with ${quotes.length} versions`
                            }
                        </span>
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 transition-colors">
                                Clear filter
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Empty State */}
            {groupedQuotes.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-4">
                        <FileText className="w-7 h-7 text-slate-300 dark:text-slate-500" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mb-1">
                        {searchTerm ? 'No matching quotes' : 'No saved quotes yet'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
                        {searchTerm
                            ? `No quotes match "${searchTerm}". Try a different search term.`
                            : 'Quotes you save from the calculator will appear here.'
                        }
                    </p>
                </div>
            )}
        </div>
    );
};

export default SavedQuotesManager;