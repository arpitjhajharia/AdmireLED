import React, { useState, useEffect } from 'react';
import { Calculator, Sun, Moon, Box, Archive, FileText, Shield, LogOut } from 'lucide-react';
import { auth, db, appId } from './lib/firebase';
import { calculateBOM, generateId } from './lib/utils';
import { CONFIG } from './lib/config';

// Components
import InventoryManager from './components/InventoryManager';
import InventoryLedger from './components/InventoryLedger';
import SavedQuotesManager from './components/SavedQuotesManager';
import QuoteCalculator from './components/QuoteCalculator';
import UserManager from './components/UserManager';
import Login from './components/Login';

const App = () => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [view, setView] = useState('quote');
  const [loading, setLoading] = useState(true);

  // Existing state
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(CONFIG.DEFAULTS.EXCHANGE_RATE);

  // --- ORIGINAL STATE FROM YOUR FILE ---
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
        selectedSMPSId: '',
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
    selectedSMPSId: '', selectedProcId: '', sizingMode: 'closest', readyId: '',
    margin: 0, targetSellPrice: 0, pricingMode: 'margin',
    commercials: {
      processor: { val: 0, unit: 'screen' },
      installation: { val: 0, unit: 'sqft' },
      structure: { val: 0, unit: 'sqft' }
    },
    terms: {
      price: CONFIG.DEFAULTS.PRICE_BASIS,
      deliveryWeeks: CONFIG.DEFAULTS.DELIVERY_WEEKS,
      payment: CONFIG.DEFAULTS.PAYMENT_TERMS,
      validity: CONFIG.TEXT.VALIDITY,
      warranty: CONFIG.TEXT.WARRANTY,
      scope: {
        structure: CONFIG.TEXT.SCOPE_STRUCTURE,
        elec: CONFIG.TEXT.SCOPE_ELEC,
        net: CONFIG.TEXT.SCOPE_NET,
        soft: CONFIG.TEXT.SCOPE_SOFT,
        perm: CONFIG.TEXT.SCOPE_PERM,
        pc: CONFIG.TEXT.SCOPE_PC
      }
    },
    extraComponents: [],
    extras: [],
    overrides: {},
    editingRow: null
  };

  const [calcState, setCalcState] = useState(initialCalcState);

  // 1. Auth & Role Init (NEW)
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const username = u.email.split('@')[0].toLowerCase();
        setUser({ ...u, username });

        // Fetch Role using UID (Secure)
        const roleDoc = await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(u.uid).get();
        if (roleDoc.exists) {
          setUserRole(roleDoc.data().role);
        } else {
          // Failsafe: 'admin' is super_admin, others default to labour
          if (username === 'admin') setUserRole('super_admin');
          else setUserRole('labour');
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user || !db) return;
    const unsubInv = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory').onSnapshot(snap => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubTx = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('transactions').onSnapshot(snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInv(); unsubTx(); };
  }, [user]);

  // 3. Dark Mode
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); }, [darkMode]);

  const handleLogout = () => auth.signOut();

  // --- ORIGINAL HANDLERS RESTORED EXACTLY ---
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
    // Merge with initial state to ensure new fields (like scope/warranty) exist for old quotes
    const newState = { ...initialCalcState, ...quote.calculatorState };

    // Deep merge terms to preserve new defaults if missing in old quote
    newState.terms = {
      ...initialCalcState.terms,
      ...(quote.calculatorState.terms || {}),
      scope: { ...initialCalcState.terms.scope, ...(quote.calculatorState.terms?.scope || {}) }
    };

    if (isDuplicate) {
      newState.client = newState.client + ' (Copy)';
      newState.project = newState.project + ' (Copy)';
    }
    setCalcState(newState);
    setView('quote');
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>;
  if (!user) return <Login />;

  // --- ROLE BASED PERMISSIONS ---
  const showUsersTab = ['super_admin'].includes(userRole);
  // Calculator: Read Only for Labour & Supervisor
  const isBOMReadOnly = ['labour', 'supervisor'].includes(userRole);
  // Inventory: Read Only for Labour & Supervisor
  const isInventoryReadOnly = ['labour', 'supervisor'].includes(userRole);
  // Ledger: Read Only for Labour (Supervisor CAN write)
  const isLedgerReadOnly = ['labour'].includes(userRole);

  return (
    <div className="min-h-screen no-print pb-20 bg-slate-50 dark:bg-slate-900 transition-colors font-sans text-slate-900 dark:text-slate-100">
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 px-4 md:px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/AdmireLED/logo.png" alt="Logo" className="h-10 w-auto" />
        </div>

        <div className="flex gap-4 items-center">
          <div className="hidden md:flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
            <button onClick={() => setView('quote')} className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${view === 'quote' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Calculator</button>
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'inventory' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Components</button>
            <button onClick={() => setView('ledger')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'ledger' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Stock</button>
            <button onClick={() => setView('saved')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'saved' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Quotes</button>
            {showUsersTab && <button onClick={() => setView('users')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'users' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Users</button>}
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-700">
            <div className="text-right mr-2 hidden lg:block">
              <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase">{userRole?.replace('_', ' ')}</div>
              <div className="text-[10px] text-slate-400">{user.username}</div>
            </div>
            <button onClick={handleLogout} className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-lg transition-colors"><LogOut size={18} /></button>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Tabs */}
      <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-16 z-40 flex shadow-sm overflow-x-auto">
        <button onClick={() => setView('quote')} className={`flex-1 py-3 px-2 text-xs font-bold whitespace-nowrap border-b-2 ${view === 'quote' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500'}`}>Calculator</button>
        <button onClick={() => setView('inventory')} className={`flex-1 py-3 px-2 text-xs font-bold whitespace-nowrap border-b-2 ${view === 'inventory' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500'}`}>Components</button>
        <button onClick={() => setView('ledger')} className={`flex-1 py-3 px-2 text-xs font-bold whitespace-nowrap border-b-2 ${view === 'ledger' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500'}`}>Stock</button>
        <button onClick={() => setView('saved')} className={`flex-1 py-3 px-2 text-xs font-bold whitespace-nowrap border-b-2 ${view === 'saved' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500'}`}>Quotes</button>
        {showUsersTab && <button onClick={() => setView('users')} className={`flex-1 py-3 px-2 text-xs font-bold whitespace-nowrap border-b-2 ${view === 'users' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500'}`}>Users</button>}
      </div>

      <main className="max-w-[1600px] mx-auto p-4 md:p-6">
        {view === 'inventory' && <InventoryManager user={user} transactions={transactions} readOnly={isInventoryReadOnly} exchangeRate={exchangeRate} />}
        {view === 'ledger' && <InventoryLedger user={user} inventory={inventory} transactions={transactions} readOnly={isLedgerReadOnly} />}
        {view === 'saved' && <SavedQuotesManager user={user} inventory={inventory} transactions={transactions} exchangeRate={exchangeRate} onLoadQuote={handleLoadQuote} readOnly={isBOMReadOnly} />}
        {view === 'users' && showUsersTab && <UserManager />}
        {view === 'quote' && (
          <QuoteCalculator
            user={user} inventory={inventory} transactions={transactions}
            state={calcState} setState={setCalcState}
            exchangeRate={exchangeRate} setExchangeRate={setExchangeRate}
            onSaveQuote={handleSaveQuote}
            readOnly={isBOMReadOnly}
          />
        )}
      </main>
    </div>
  );
};

export default App;