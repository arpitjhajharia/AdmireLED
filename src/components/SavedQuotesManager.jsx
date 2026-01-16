import React from 'react';
import { Eye, Printer, Trash2, FileText, Download, Copy, Edit } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency, calculateBOM } from '../lib/utils'; // Importing the logic we just moved
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
        // 1. Try using pre-calculated multi-screen data (New Format)
        if (quote.allScreensData) {
            setViewQuote({
                allScreensData: quote.allScreensData,
                client: quote.client,
                project: quote.project
            });
            return;
        }

        // 2. Legacy/Fallback: Re-calculate on the fly
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
                    totalScreenQty: allCalculations.reduce((sum, calc) => sum + calc.screenQty, 0),
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

        // 3. Last Resort: Single Screen Legacy
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
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
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

            <div className="grid gap-4">
                {quotes.map(quote => {
                    const state = quote.calculatorState || {};
                    const unit = state.unit || 'm';
                    const pitch = state.selectedPitch || 'N/A';
                    const isIndoor = state.selectedIndoor === 'true';

                    return (
                        <div key={quote.id} className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-700/50 dark:border-slate-600 flex justify-between items-center">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-slate-800 dark:text-white">{quote.project || 'Untitled Project'}</h3>
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${isIndoor ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                                        {isIndoor ? 'Indoor' : 'Outdoor'}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">P{pitch}</span>
                                </div>
                                <p className="text-sm text-slate-500 mb-2">{quote.client || 'No Client'} • {new Date(quote.updatedAt?.seconds * 1000).toLocaleDateString()}</p>

                                <div className="flex gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                                    <span className="bg-white dark:bg-slate-800 border dark:border-slate-600 px-2 py-1 rounded">Size: {state.targetWidth} x {state.targetHeight} {unit}</span>
                                    <span className="bg-white dark:bg-slate-800 border dark:border-slate-600 px-2 py-1 rounded">Qty: {state.screenQty || 1}</span>
                                    <span className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-800 px-2 py-1 rounded font-bold">{formatCurrency(quote.finalAmount, 'INR')}</span>
                                </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                                <button onClick={() => handleView(quote)} className="px-3 py-2 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 flex items-center gap-1"><Eye size={14} /> View</button>
                                <button onClick={() => handleDownloadExcel(quote)} className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center gap-1"><Download size={14} /> Excel</button>
                                <button onClick={() => onLoadQuote(quote, false)} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1"><Edit size={14} /> Edit</button>
                                <button onClick={() => onLoadQuote(quote, true)} className="px-3 py-2 bg-slate-600 text-white rounded text-sm hover:bg-slate-700 flex items-center gap-1"><Copy size={14} /> Clone</button>
                                <button onClick={() => handleDelete(quote.id)} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    );
                })}
                {quotes.length === 0 && <p className="text-center text-slate-400 py-10">No saved quotes found.</p>}
            </div>
        </div>
    );
};

export default SavedQuotesManager;