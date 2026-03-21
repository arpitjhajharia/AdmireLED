import React, { useState, useEffect } from 'react';
import { FileText, Search, Trash2, Edit, Eye, Printer, X, Box } from 'lucide-react';
import { db, appId } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';

export default function SignageQuotesManager({ onLoadQuote }) {
    const [quotes, setQuotes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewQuote, setViewQuote] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_quotes')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snap => {
                setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            }, err => {
                console.error("Error fetching signage quotes:", err);
                setLoading(false);
            });
        return () => unsub();
    }, []);

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this signage quote?")) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('signage_quotes').doc(id).delete();
        }
    };

    const filteredQuotes = quotes.filter(q =>
        (q.project || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.ref || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (ts) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="p-3 md:p-4 animate-in fade-in duration-300">
            {/* --- View / Print Modal --- */}
            {viewQuote && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white max-w-4xl w-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <Box size={20} className="text-indigo-600" /> Signage BOM & Quote
                            </h2>
                            <div className="flex gap-2 print:hidden">
                                <button onClick={() => setViewQuote(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Close</button>
                                <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg flex items-center gap-2 shadow-sm">
                                    <Printer size={16} /> Print
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-8 print:p-0">
                            <div className="print-version-container bg-white text-slate-800 font-sans text-xs">
                                <div className="border-b-2 border-slate-800 pb-4 mb-6">
                                    <h1 className="text-2xl font-bold uppercase tracking-wide">Signage Quotation</h1>
                                </div>
                                <div className="grid grid-cols-2 gap-6 mb-6">
                                    <div>
                                        <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mb-2">Project Details</h3>
                                        <div className="grid grid-cols-3 gap-y-1 text-[11px]">
                                            <span className="font-semibold text-slate-500">Ref No:</span> <span className="col-span-2 font-bold">{viewQuote.ref}</span>
                                            <span className="font-semibold text-slate-500">Client:</span> <span className="col-span-2 font-bold">{viewQuote.client}</span>
                                            <span className="font-semibold text-slate-500">Project:</span> <span className="col-span-2 font-bold">{viewQuote.project}</span>
                                            <span className="font-semibold text-slate-500">Sign Type:</span> <span className="col-span-2 capitalize">{viewQuote.calculatorState.signType.replace('_', ' ')}</span>
                                            <span className="font-semibold text-slate-500">Dimensions:</span> <span className="col-span-2 font-bold">{viewQuote.calculatorState.width} × {viewQuote.calculatorState.height} {viewQuote.calculatorState.unit}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] text-slate-500">Date: {formatDate(viewQuote.createdAt)}</p>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mb-2">Bill of Materials</h3>
                                    <table className="w-full border-collapse border border-slate-300 text-[11px]">
                                        <thead className="bg-slate-800 text-white">
                                            <tr>
                                                <th className="p-2 border border-slate-600 text-left">Item Description</th>
                                                <th className="p-2 border border-slate-600 text-center w-20">Qty</th>
                                                <th className="p-2 border border-slate-600 text-right w-24">Rate</th>
                                                <th className="p-2 border border-slate-600 text-right w-28">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {viewQuote.allScreensData.calculations[0].detailedItems.map((item, idx) => (
                                                <tr key={idx} className="border-b border-slate-200">
                                                    <td className="p-2 border-r border-slate-200 font-bold">{item.name} <span className="font-normal text-slate-500 block text-[10px]">{item.spec}</span></td>
                                                    <td className="p-2 border-r border-slate-200 text-center tabular-nums">{Number.isInteger(item.qty) ? item.qty : item.qty.toFixed(2)}</td>
                                                    <td className="p-2 border-r border-slate-200 text-right tabular-nums">{formatCurrency(item.unit, 'INR', false)}</td>
                                                    <td className="p-2 text-right font-semibold tabular-nums">{formatCurrency(item.total, 'INR', false)}</td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-100 font-bold text-sm">
                                                <td colSpan="3" className="p-2 border border-slate-300 text-right uppercase">Grand Total</td>
                                                <td className="p-2 border border-slate-300 text-right text-indigo-700">{formatCurrency(viewQuote.finalAmount, 'INR', false)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Header --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
                        <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">Signage Quotes</h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">{quotes.length} saved quotes</p>
                    </div>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text" placeholder="Search project or client…"
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
            </div>

            {/* --- Table --- */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden bg-white dark:bg-slate-800">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                                <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Date</th>
                                <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Ref</th>
                                <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Project</th>
                                <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Client</th>
                                <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase">Type</th>
                                <th className="px-3 py-2 text-right text-[11px] font-bold text-slate-500 uppercase">Amount</th>
                                <th className="px-3 py-2 text-right text-[11px] font-bold text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredQuotes.map(quote => (
                                <tr key={quote.id} className="hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-3 py-2 text-xs text-slate-500">{formatDate(quote.createdAt)}</td>
                                    <td className="px-3 py-2 text-xs font-mono font-bold text-indigo-600">{quote.ref}</td>
                                    <td className="px-3 py-2 text-xs font-bold text-slate-800 dark:text-white truncate max-w-[200px]">{quote.project}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{quote.client}</td>
                                    <td className="px-3 py-2 text-xs text-slate-500 capitalize">{quote.calculatorState.signType.replace('_', ' ')}</td>
                                    <td className="px-3 py-2 text-xs font-bold text-right text-slate-800 dark:text-white tabular-nums">{formatCurrency(quote.finalAmount, 'INR')}</td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => setViewQuote(quote)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 dark:bg-slate-800 hover:bg-indigo-100" title="View/Print"><Eye size={14} /></button>
                                            <button onClick={() => onLoadQuote(quote.calculatorState)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded bg-slate-50 dark:bg-slate-800 hover:bg-blue-100" title="Edit/Load"><Edit size={14} /></button>
                                            <button onClick={() => handleDelete(quote.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded bg-slate-50 dark:bg-slate-800 hover:bg-red-100" title="Delete"><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredQuotes.length === 0 && !loading && (
                                <tr><td colSpan="7" className="p-8 text-center text-slate-400 text-sm">No signage quotes found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Global Print Styles specific to this component */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-version-container, .print-version-container * { visibility: visible; }
                    .print-version-container { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );
}