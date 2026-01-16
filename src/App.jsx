import React, { useState, useEffect } from 'react';
import { Calculator, Sun, Moon } from 'lucide-react';
import { auth, db, appId } from './lib/firebase';
import { calculateBOM, generateId, formatCurrency } from './lib/utils';
import { CONFIG } from './lib/config';

// Components
import InventoryManager from './components/InventoryManager';
import InventoryLedger from './components/InventoryLedger';
import SavedQuotesManager from './components/SavedQuotesManager';
import QuoteCalculator from './components/QuoteCalculator';

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('quote');
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(CONFIG.DEFAULTS.EXCHANGE_RATE);

  // Initial Calculator State
  const initialCalcState = {
    client: '', project: '', unit: 'm',
    screens: [
      {
        id: generateId(),
        screenQty: 0,
        targetWidth: 0,
        targetHeight: 0,
        selectedIndoor: 'true',
        assemblyMode: 'assembled',
        selectedPitch: '',
        selectedModuleId: '',
        selectedCabinetId: '',
        selectedCardId: '',
        selectedPSUId: '',
        selectedProcId: '',
        sizingMode: 'closest',
        readyId: '',
        extraComponents: [],
        overrides: {},
        editingRow: null,
        extras: [],
        commercials: {
          processor: { val: 0, unit: 'screen', cost: 0, costType: 'abs' },
          installation: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' },
          structure: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' }
        }
      }
    ],
    activeScreenIndex: 0,
    selectedIndoor: 'true', assemblyMode: 'assembled', selectedPitch: '',
    selectedModuleId: '', selectedCabinetId: '', selectedCardId: '',
    selectedPSUId: '', selectedProcId: '', sizingMode: 'closest', readyId: '',
    margin: 0, targetSellPrice: 0, pricingMode: 'margin',
    commercials: {
      processor: { val: 0, unit: 'screen' },
      installation: { val: 0, unit: 'sqft' },
      structure: { val: 0, unit: 'sqft' }
    },
    terms: {
      price: CONFIG.DEFAULTS.PRICE_BASIS,
      deliveryWeeks: CONFIG.DEFAULTS.DELIVERY_WEEKS,
      payment: CONFIG.DEFAULTS.PAYMENT_TERMS
    },
    extraComponents: [],
    extras: [],
    overrides: {},
    editingRow: null
  };

  const [calcState, setCalcState] = useState(initialCalcState);

  // 1. Auth Init
  useEffect(() => {
    auth.onAuthStateChanged(setUser);
    auth.signInAnonymously().catch(console.error);
  }, []);

  // 2. Dark Mode Toggle
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // 3. Data Sync (Inventory & Transactions)
  useEffect(() => {
    if (!user || !db) return;
    const unsubInv = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory')
      .onSnapshot(snap => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubTx = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('transactions')
      .onSnapshot(snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInv(); unsubTx(); };
  }, [user]);

  // Handlers
  const handleSaveQuote = async (finalAmount) => {
    if (!calcState.client || !calcState.project) return alert("Please enter Client and Project names.");

    // Calculate all screens data locally before saving
    let allScreensData = null;

    if (calcState.screens && calcState.screens.length > 0) {
      const allCalculations = calcState.screens.map((screen) => {
        const screenCalcState = {
          ...calcState,
          ...screen
        };
        return calculateBOM(screenCalcState, inventory, transactions, exchangeRate);
      }).filter(calc => calc !== null);

      if (allCalculations.length > 0) {
        allScreensData = {
          totalProjectCost: allCalculations.reduce((sum, calc) => sum + calc.totalProjectCost, 0),
          totalProjectSell: allCalculations.reduce((sum, calc) => sum + calc.totalProjectSell, 0),
          totalLEDSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.led.sell * calc.screenQty), 0),
          totalServicesSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.sell.total - (calc.matrix.led.sell * calc.screenQty)), 0),
          totalMargin: 0,
          totalScreenQty: allCalculations.reduce((sum, calc) => sum + calc.screenQty, 0),
          calculations: allCalculations,
          screenConfigs: calcState.screens
        };
        allScreensData.totalMargin = allScreensData.totalProjectSell - allScreensData.totalProjectCost;
      }
    }

    try {
      await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes').add({
        client: calcState.client,
        project: calcState.project,
        calculatorState: calcState,
        finalAmount: finalAmount || 0,
        screenCount: calcState.screens.length,
        totalScreenQty: allScreensData?.totalScreenQty || 0,
        allScreensData: allScreensData,
        updatedAt: new Date()
      });
      alert("Quote Saved Successfully!");
    } catch (e) { console.error(e); alert("Error saving quote."); }
  };

  const handleLoadQuote = (quote, isDuplicate) => {
    const newState = { ...quote.calculatorState };
    if (isDuplicate) {
      newState.client = newState.client + ' (Copy)';
      newState.project = newState.project + ' (Copy)';
    }
    setCalcState(newState);
    setView('quote');
  };

  if (!user) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>;

  return (
    <div className="min-h-screen no-print pb-20 bg-slate-50 dark:bg-slate-900 transition-colors font-sans">
      {/* Main Header */}
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 px-4 md:px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-10 w-auto" />
          <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">ADMIRE <span className="text-teal-600 dark:text-teal-400 font-medium">SIGN</span></span>
        </div>

        <div className="flex gap-4 items-center">
          {/* Desktop Navigation */}
          <div className="hidden md:flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
            <button onClick={() => setView('quote')} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${view === 'quote' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Calculator</button>
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'inventory' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Components</button>
            <button onClick={() => setView('ledger')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'ledger' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Stock</button>
            <button onClick={() => setView('saved')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'saved' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Quotes</button>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-700">
            <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded px-2 py-1" title="Exchange rate for USD items">
              <span className="text-[10px] text-slate-500 font-bold mr-1">$1=</span>
              <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))} className="w-8 bg-transparent text-xs outline-none font-bold dark:text-white" />
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation Tabs (NEW) */}
      <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-16 z-40 flex shadow-sm">
        <button onClick={() => setView('quote')} className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${view === 'quote' ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Calculator
        </button>
        <button onClick={() => setView('inventory')} className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${view === 'inventory' ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Components
        </button>
        <button onClick={() => setView('ledger')} className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${view === 'ledger' ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Stock
        </button>
        <button onClick={() => setView('saved')} className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${view === 'saved' ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
          Quotes
        </button>
      </div>

      <main className="max-w-[1600px] mx-auto p-4 md:p-6">
        {view === 'inventory' && <InventoryManager user={user} transactions={transactions} />}
        {view === 'ledger' && <InventoryLedger user={user} inventory={inventory} transactions={transactions} />}
        {view === 'saved' && <SavedQuotesManager user={user} inventory={inventory} transactions={transactions} exchangeRate={exchangeRate} onLoadQuote={handleLoadQuote} />}
        {view === 'quote' && (
          <QuoteCalculator
            user={user}
            inventory={inventory}
            transactions={transactions}
            state={calcState}
            setState={setCalcState}
            exchangeRate={exchangeRate}
            setExchangeRate={setExchangeRate}
            onSaveQuote={handleSaveQuote}
          />
        )}
      </main>

    </div>
  );
};

export default App;