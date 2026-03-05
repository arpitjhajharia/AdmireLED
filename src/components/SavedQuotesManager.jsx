import React from 'react';
import { Eye, Printer, Trash2, FileText, Download, Copy, Edit, Box, Monitor, Sun, Search } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, calculateBOM } from '../lib/utils';
import PrintLayout from './PrintLayout';
import BOMLayout from './BOMLayout';

const SavedQuotesManager = ({ user, inventory, transactions, exchangeRate, onLoadQuote, readOnly = false }) => {
    const [quotes, setQuotes] = React.useState([]);
    const [viewQuote, setViewQuote] = React.useState(null);
    const [searchTerm, setSearchTerm] = React.useState('');

    React.useEffect(() => {
        if (!user) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes')
            .orderBy('updatedAt', 'desc')
            .onSnapshot(snap => {
                setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
        return () => unsub();
    }, [user]);

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this quote?")) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes').doc(id).delete();
        }
    };

    const handleView = (quote) => {
        let dataToView = null;

        if (quote.allScreensData) {
            dataToView = {
                allScreensData: quote.allScreensData,
                client: quote.client,
                project: quote.project
            };
        } else {
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

                    dataToView = {
                        allScreensData: calculatedData,
                        client: quote.client,
                        project: quote.project
                    };
                }
            } else {
                const result = calculateBOM(state, inventory, transactions, exchangeRate);
                if (result) {
                    dataToView = { data: result, client: quote.client, project: quote.project };
                }
            }
        }

        if (dataToView) {
            setViewQuote(dataToView);
        } else {
            alert("Could not load quote data.");
        }
    };

    const handleDownloadExcel = (quote) => {
        if (readOnly) return;

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

    // Format the date nicely
    const formatDate = (timestamp) => {
        if (!timestamp?.seconds) return '—';
        const d = new Date(timestamp.seconds * 1000);
        const day = d.getDate();
        const month = d.toLocaleString('en-IN', { month: 'short' });
        const year = d.getFullYear();
        const time = d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `${day} ${month} ${year}, ${time}`;
    };

    // Filter quotes by search
    const filteredQuotes = quotes.filter(q => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (q.project || '').toLowerCase().includes(term) ||
            (q.client || '').toLowerCase().includes(term);
    });

    return (
        <div className="p-3 md:p-4">
            {/* ── View/Print Modal (unchanged logic) ── */}
            {viewQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white max-w-4xl w-full h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-2xl">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                {readOnly ? <Box size={20} className="text-teal-600" /> : <Eye size={20} className="text-slate-500" />}
                                {readOnly ? 'Bill of Materials (BOM)' : 'View Saved Quote'}
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={() => setViewQuote(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Close</button>
                                <button onClick={() => {
                                    const originalTitle = document.title;
                                    document.title = `${viewQuote.client}_${viewQuote.project}_${readOnly ? 'BOM' : 'Quote'}`.replace(/[^a-zA-Z0-9_]/g, '_');
                                    window.print();
                                    document.title = originalTitle;
                                }} className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                                    <Printer size={16} /> Print / PDF
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-200">
                            {readOnly ? (
                                <BOMLayout
                                    data={viewQuote.data ? { ...viewQuote.data, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                    allScreensData={viewQuote.allScreensData ? {
                                        ...viewQuote.allScreensData,
                                        clientName: viewQuote.client,
                                        projectName: viewQuote.project,
                                        screenConfigs: viewQuote.allScreensData.screenConfigs?.map(s => ({ ...s, unit: s.unit || 'm' }))
                                    } : null}
                                    inventory={inventory}
                                    transactions={transactions}
                                />
                            ) : (
                                <PrintLayout
                                    data={viewQuote.data ? { ...viewQuote.data, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                    allScreensData={viewQuote.allScreensData ? { ...viewQuote.allScreensData, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                    currency='INR'
                                    exchangeRate={exchangeRate}
                                />
                            )}
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

            {/* ── Quote Cards Grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredQuotes.map(quote => {
                    const state = quote.calculatorState || {};
                    const isIndoor = state.selectedIndoor === 'true';
                    const screenCount = quote.allScreensData?.calculations?.length || 1;

                    return (
                        <div
                            key={quote.id}
                            className={`quote-card-animate group bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] transition-all duration-200 ease-out overflow-hidden flex flex-col border-t-2 ${isIndoor ? 'border-t-blue-400' : 'border-t-amber-400'}`}
                        >
                            {/* Card Body */}
                            <div className="p-3 flex-1 flex flex-col">
                                {/* Top row: Project + Badge */}
                                <div className="flex justify-between items-start gap-2 mb-0.5">
                                    <h3
                                        className="font-bold text-[15px] text-slate-800 dark:text-white leading-snug line-clamp-1 tracking-[-0.01em]"
                                        title={quote.project}
                                    >
                                        {quote.project || 'Untitled'}
                                    </h3>
                                    <span className={`
                                        flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-bold uppercase tracking-wider
                                        ${isIndoor
                                            ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60'
                                            : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60'
                                        }
                                    `}>
                                        {isIndoor ? <Monitor size={10} /> : <Sun size={10} />}
                                        {isIndoor ? 'Indoor' : 'Outdoor'}
                                    </span>
                                </div>

                                {/* Client + Date on one line */}
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                        {quote.client || 'No Client'}
                                    </p>
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                        {formatDate(quote.updatedAt)}
                                    </p>
                                </div>

                                {/* Screen Details */}
                                <div className="space-y-1 mb-2 flex-1">
                                    {quote.allScreensData?.calculations ? (
                                        quote.allScreensData.calculations.map((calc, idx) => (
                                            <div key={idx} className="flex justify-between items-center gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="flex-shrink-0 w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                        {calc.finalWidth}×{calc.finalHeight}m
                                                        <span className="text-slate-400 dark:text-slate-500 ml-1">
                                                            / {(Number(calc.finalWidth) * 3.28084).toFixed(1)}×{(Number(calc.finalHeight) * 3.28084).toFixed(1)}ft
                                                        </span>
                                                        <span className="text-slate-400 dark:text-slate-500"> ×{calc.screenQty}</span>
                                                    </span>
                                                </div>
                                                {!readOnly && (
                                                    <span className="flex-shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                                                        {formatCurrency(calc.totalProjectSell, 'INR', true)}
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex justify-between items-center gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">1</span>
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400">Single Screen</span>
                                            </div>
                                            {!readOnly && (
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                                                    {formatCurrency(quote.finalAmount, 'INR', true)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Total Estimate */}
                                {!readOnly && (
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 mt-auto">
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                Estimate
                                            </span>
                                            <span className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white price-shimmer tabular-nums">
                                                {formatCurrency(quote.finalAmount, 'INR')}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action Bar */}
                            <div className={`
                                flex items-center justify-evenly px-2 py-1.5
                                border-t border-slate-100 dark:border-slate-700/60
                                bg-slate-50/60 dark:bg-slate-800/80
                            `}>
                                {/* View */}
                                <button
                                    onClick={() => handleView(quote)}
                                    className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 shadow-none hover:shadow-sm"
                                    title={readOnly ? 'View BOM' : 'View'}
                                >
                                    {readOnly ? <Box size={16} /> : <Eye size={16} />}
                                </button>

                                {!readOnly && (
                                    <>
                                        {/* Edit */}
                                        <button
                                            onClick={() => onLoadQuote(quote, false)}
                                            className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-none hover:shadow-sm"
                                            title="Edit"
                                        >
                                            <Edit size={16} />
                                        </button>

                                        {/* Excel */}
                                        <button
                                            onClick={() => handleDownloadExcel(quote)}
                                            className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 shadow-none hover:shadow-sm"
                                            title="Download Excel"
                                        >
                                            <Download size={16} />
                                        </button>

                                        {/* Clone */}
                                        <button
                                            onClick={() => onLoadQuote(quote, true)}
                                            className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 shadow-none hover:shadow-sm"
                                            title="Clone"
                                        >
                                            <Copy size={16} />
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={() => handleDelete(quote.id)}
                                            className="quote-action-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shadow-none hover:shadow-sm"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Empty State */}
                {filteredQuotes.length === 0 && (
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
        </div>
    );
};

export default SavedQuotesManager;