import React from 'react';
import { Eye, Printer, Trash2, FileText, Download, Copy, Edit } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, calculateBOM } from '../lib/utils';
import PrintLayout from './PrintLayout';

const SavedQuotesManager = ({ user, inventory, transactions, exchangeRate, onLoadQuote }) => {
    const [quotes, setQuotes] = React.useState([]);
    const [viewQuote, setViewQuote] = React.useState(null);

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
        if (quote.allScreensData) {
            setViewQuote({
                allScreensData: quote.allScreensData,
                client: quote.client,
                project: quote.project
            });
            return;
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

                setViewQuote({
                    allScreensData: calculatedData,
                    client: quote.client,
                    project: quote.project
                });
                return;
            }
        }

        const result = calculateBOM(state, inventory, transactions, exchangeRate);
        if (result) {
            setViewQuote({ data: result, client: quote.client, project: quote.project });
        } else {
            alert("Could not calculate quote. Inventory items might be missing.");
        }
    };

    const handleDownloadExcel = (quote) => {
        const result = calculateBOM(quote.calculatorState, inventory, transactions, exchangeRate);
        if (!result) return alert("Calculation failed.");

        let csv = `Project,${quote.project}\nClient,${quote.client}\nDate,${new Date().toLocaleDateString()}\n\n`;
        csv += `Bill of Materials\nComponent,Specification,Qty,Rate,Total\n`;

        result.detailedItems.forEach(item => {
            csv += `"${item.name}","${item.spec}",${item.qty * result.screenQty},${item.unit},${item.total * result.screenQty}\n`;
        });

        csv += `\nFinancials\n`;
        csv += `Total Cost,${result.totalProjectCost}\n`;
        csv += `Selling Price,${result.totalProjectSell}\n`;
        csv += `Margin,${result.matrix.margin.total}\n`;

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${quote.project}_Quote.csv`;
        a.click();
    };

    return (
        <div className="p-4 md:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            {viewQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex justify-center items-center p-4">
                    <div className="bg-white max-w-4xl w-full h-[90vh] rounded-lg shadow-2xl flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-100 rounded-t-lg">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Eye size={20} /> View Saved Quote</h2>
                            <div className="flex gap-2">
                                <button onClick={() => setViewQuote(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded">Close</button>
                                <button onClick={() => window.print()} className="px-4 py-2 bg-teal-600 text-white hover:bg-teal-700 rounded flex items-center gap-2"><Printer size={16} /> Print / PDF</button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-200">
                            <PrintLayout
                                data={viewQuote.data ? { ...viewQuote.data, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                allScreensData={viewQuote.allScreensData ? { ...viewQuote.allScreensData, clientName: viewQuote.client, projectName: viewQuote.project } : null}
                                currency='INR'
                                exchangeRate={exchangeRate}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                    <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Saved Quotes
                </h2>
            </div>

            {/* Mobile Responsive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {quotes.map(quote => {
                    const state = quote.calculatorState || {};
                    const unit = state.unit || 'm';
                    const pitch = state.selectedPitch || 'N/A';
                    const isIndoor = state.selectedIndoor === 'true';

                    return (
                        <div key={quote.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                            {/* Card Body */}
                            <div className="p-4 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-white line-clamp-1" title={quote.project}>
                                            {quote.project || 'Untitled'}
                                        </h3>
                                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                            {quote.client || 'No Client'}
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isIndoor ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {isIndoor ? 'Indoor' : 'Outdoor'}
                                    </span>
                                </div>

                                <div className="text-xs text-slate-400 mb-4">
                                    {new Date(quote.updatedAt?.seconds * 1000).toLocaleDateString()}
                                </div>

                                {/* Screen Breakdown List */}
                                <div className="bg-slate-50 dark:bg-slate-700/30 p-2 rounded-lg mb-4 space-y-1.5 flex-1">
                                    {quote.allScreensData?.calculations ? (
                                        quote.allScreensData.calculations.map((calc, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-100 dark:border-slate-600 last:border-0 pb-1 last:pb-0">
                                                <span className="text-slate-600 dark:text-slate-300 font-medium">
                                                    Screen #{idx + 1} <span className="text-slate-400 font-normal">({calc.finalWidth}x{calc.finalHeight}m ×{calc.screenQty})</span>
                                                </span>
                                                <span className="font-bold text-slate-800 dark:text-white">
                                                    {formatCurrency(calc.totalProjectSell, 'INR', true)}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        // Fallback for quotes saved before multi-screen update
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                                                Screen #1 <span className="text-slate-400 font-normal">(P{pitch} ×{state.screenQty || 1})</span>
                                            </span>
                                            <span className="font-bold text-slate-800 dark:text-white">
                                                {formatCurrency(quote.finalAmount, 'INR', true)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Total Footer */}
                                <div className="flex justify-between items-end pt-2 border-t border-slate-100 dark:border-slate-700 mt-auto">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Total Estimate</span>
                                    <span className="text-xl font-bold text-teal-600 dark:text-teal-400">
                                        {formatCurrency(quote.finalAmount, 'INR')}
                                    </span>
                                </div>
                            </div>

                            {/* Action Buttons Grid */}
                            <div className="grid grid-cols-5 border-t border-slate-100 dark:border-slate-700 divide-x divide-slate-100 dark:divide-slate-700 bg-slate-50 dark:bg-slate-800">
                                <button onClick={() => handleView(quote)} className="py-3 flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors" title="View">
                                    <Eye size={16} /> <span className="hidden sm:inline">View</span>
                                </button>
                                <button onClick={() => onLoadQuote(quote, false)} className="py-3 flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Edit">
                                    <Edit size={16} /> <span className="hidden sm:inline">Edit</span>
                                </button>
                                <button onClick={() => handleDownloadExcel(quote)} className="py-3 flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400 hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Excel">
                                    <Download size={16} /> <span className="hidden sm:inline">Excel</span>
                                </button>
                                <button onClick={() => onLoadQuote(quote, true)} className="py-3 flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500 hover:bg-white dark:hover:bg-slate-700 transition-colors" title="Clone">
                                    <Copy size={16} /> <span className="hidden sm:inline">Clone</span>
                                </button>
                                <button onClick={() => handleDelete(quote.id)} className="py-3 flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
                                    <Trash2 size={16} /> <span className="hidden sm:inline">Del</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
                {quotes.length === 0 && <p className="text-center text-slate-400 py-10 col-span-full">No saved quotes found.</p>}
            </div>
        </div>
    );
};

export default SavedQuotesManager;