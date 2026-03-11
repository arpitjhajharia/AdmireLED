import React, { useState, useEffect } from 'react';
import { db, appId } from '../lib/firebase';
import { DollarSign, Save, Loader } from 'lucide-react';
import { CONFIG } from '../lib/config';

const GlobalSettings = () => {
    const [exchangeRate, setExchangeRate] = useState(CONFIG.DEFAULTS.EXCHANGE_RATE);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('settings').doc('global')
            .onSnapshot(doc => {
                if (doc.exists) {
                    setExchangeRate(doc.data().exchangeRate || CONFIG.DEFAULTS.EXCHANGE_RATE);
                }
            });
        return () => unsub();
    }, []);

    const handleSave = async () => {
        if (!exchangeRate || isNaN(exchangeRate)) return alert('Please enter a valid exchange rate');
        setLoading(true);
        setMessage('');
        try {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('settings').doc('global').set({
                exchangeRate: Number(exchangeRate),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            setMessage('Saved successfully!');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error(error);
            setMessage('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-3 md:p-4 mt-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-700 to-green-500 flex items-center justify-center shadow-sm">
                        <DollarSign className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Global Settings
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            App-wide Configurations
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <div className="max-w-md">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                        USD Exchange Rate (Global Default)
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        This rate is used globally by default. Users can still change it locally for their session or a specific quote.
                    </p>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 font-bold">₹</span>
                            <input
                                type="number"
                                value={exchangeRate}
                                onChange={e => setExchangeRate(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
                        >
                            {loading ? <Loader className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                    {message && (
                        <p className={`mt-2 text-xs font-bold ${message.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                            {message}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GlobalSettings;
