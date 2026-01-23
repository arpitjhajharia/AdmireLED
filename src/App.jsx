import React, { useState, useEffect } from 'react';
import { Calculator, Sun, Moon, Box, Archive, FileText, Shield, LogOut, Database, Menu, X, DollarSign } from 'lucide-react';
import { auth, db, appId } from './lib/firebase';
import { calculateBOM, generateId } from './lib/utils';
import { CONFIG } from './lib/config';

// Components
import InventoryManager from './components/InventoryManager';
import InventoryLedger from './components/InventoryLedger';
import SavedQuotesManager from './components/SavedQuotesManager';
import QuoteCalculator from './components/QuoteCalculator';
import UserManager from './components/UserManager';
import BackupManager from './components/BackupManager';
import Login from './components/Login';

const App = () => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [view, setView] = useState('quote');
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Data State
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(CONFIG.DEFAULTS.EXCHANGE_RATE);

  // --- CALCULATOR STATE (Full Original Object) ---
  const initialCalcState = {
    client: '', project: '', unit: 'm',
    screens: [
      {
        id: generateId(), screenQty: 0, targetWidth: 0, targetHeight: 0,
        selectedIndoor: 'true', assemblyMode: 'assembled', sizingMode: 'closest',
        selectedPitch: '', selectedModuleId: '', selectedCabinetId: '',
        selectedCardId: '', selectedSMPSId: '', selectedProcId: '', readyId: '',
        extraComponents: [], overrides: {}, extras: [],
        commercials: {
          processor: { val: 0, unit: 'screen', cost: 0, costType: 'abs' },
          installation: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' },
          structure: { val: 0, unit: 'sqft', cost: 0, costType: 'abs' }
        }
      }
    ],
    activeScreenIndex: 0, selectedIndoor: 'true', assemblyMode: 'assembled',
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
    extraComponents: [], extras: [], overrides: {}, editingRow: null
  };

  const [calcState, setCalcState] = useState(initialCalcState);

  // 1. Auth & Role Init
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const username = u.email ? u.email.split('@')[0].toLowerCase() : 'user';
        let role = 'labour';

        try {
          const roleDoc = await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(u.uid).get();
          if (roleDoc.exists) {
            role = roleDoc.data().role;
          } else if (username === 'admin') {
            role = 'super_admin';
          }
        } catch (err) {
          console.error("Role fetch error:", err);
        }

        setUserRole(role);
        setUser({ ...u, username, role });
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Data Loading
  useEffect(() => {
    if (!user || !db) return;
    const unsubInv = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('inventory').onSnapshot(snap => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubTx = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('transactions').onSnapshot(snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubInv(); unsubTx(); };
  }, [user]);

  // 3. Dark Mode
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); }, [darkMode]);

  // 4. LABOUR REDIRECT: If Labour tries to view Calculator, push them to Saved Quotes
  useEffect(() => {
    if (userRole === 'labour' && view === 'quote') {
      setView('saved');
    }
  }, [userRole, view]);

  const handleLogout = () => {
    auth.signOut();
    setView('quote');
    setUser(null);
    setUserRole(null);
    setIsMenuOpen(false);
  };

  // --- SAVE LOGIC ---
  const handleSaveQuote = async (finalAmount) => {
    if (!calcState.client || !calcState.project) return alert("Please enter Client and Project names.");

    let allScreensData = null;
    if (calcState.screens && calcState.screens.length > 0) {
      const allCalculations = calcState.screens.map((screen) => {
        const screenCalcState = { ...calcState, ...screen };
        return calculateBOM(screenCalcState, inventory, transactions, exchangeRate);
      }).filter(calc => calc !== null);

      if (allCalculations.length > 0) {
        allScreensData = {
          totalProjectCost: allCalculations.reduce((sum, calc) => sum + calc.totalProjectCost, 0),
          totalProjectSell: allCalculations.reduce((sum, calc) => sum + calc.totalProjectSell, 0),
          totalLEDSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.led.sell * calc.screenQty), 0),
          totalServicesSell: allCalculations.reduce((sum, calc) => sum + (calc.matrix.sell.total - (calc.matrix.led.sell * calc.screenQty)), 0),
          totalMargin: 0,
          totalScreenQty: allCalculations.reduce((sum, calc) => sum + Number(calc.screenQty), 0),
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
        createdBy: user.email,
        updatedAt: new Date()
      });
      alert("Quote Saved Successfully!");
    } catch (e) { console.error(e); alert("Error saving quote."); }
  };

  const handleLoadQuote = (quote, isDuplicate) => {
    const newState = { ...initialCalcState, ...quote.calculatorState };
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
    setIsMenuOpen(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>;
  if (!user) return <Login />;

  // --- PERMISSION LOGIC ---
  const safeRole = userRole || 'labour';
  const showUsersTab = safeRole === 'super_admin';
  const isInventoryReadOnly = ['labour', 'supervisor'].includes(safeRole);
  const isLedgerReadOnly = ['labour'].includes(safeRole);
  const isBOMReadOnly = ['labour', 'supervisor'].includes(safeRole);

  // Flag to hide Calculator Tab
  const isLabour = safeRole === 'labour';

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

      {/* HEADER */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/AdmireLED/logo.png" alt="Logo" className="h-10 w-auto" />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg">
            {/* HIDE CALCULATOR FOR LABOUR */}
            {!isLabour && (
              <button onClick={() => setView('quote')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'quote' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Calculator</button>
            )}

            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'inventory' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Components</button>
            <button onClick={() => setView('ledger')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'ledger' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Stock</button>
            <button onClick={() => setView('saved')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'saved' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Quotes</button>

            {showUsersTab && <button onClick={() => setView('admin')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'admin' ? 'bg-white dark:bg-slate-600 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Admin</button>}
          </nav>

          {/* User Controls */}
          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-700">

            {/* Global Exchange Rate Input (Hidden for Labour) */}
            {safeRole !== 'labour' && (
              <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 mr-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">USD:</span>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(Number(e.target.value))}
                  className="w-12 text-xs font-bold text-teal-600 dark:text-teal-400 bg-transparent outline-none text-right"
                />
              </div>
            )}

            <div className="text-right mr-2 hidden lg:block">
              <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase">{safeRole.replace('_', ' ')}</div>
              <div className="text-[10px] text-slate-400">{user.username}</div>
            </div>

            <button onClick={handleLogout} className="hidden md:block p-2 bg-slate-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-lg transition-colors"><LogOut size={18} /></button>

            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Mobile Menu Toggle */}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-slate-600 dark:text-slate-300">
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Dropdown Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-xl absolute w-full z-50 animate-in slide-in-from-top-2">
          <div className="flex flex-col p-2 space-y-1">
            {/* HIDE CALCULATOR FOR LABOUR IN MOBILE MENU */}
            {!isLabour && (
              <button onClick={() => { setView('quote'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'quote' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
                <Calculator size={18} /> Calculator
              </button>
            )}
            <button onClick={() => { setView('inventory'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'inventory' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
              <Box size={18} /> Components
            </button>
            <button onClick={() => { setView('ledger'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'ledger' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
              <Archive size={18} /> Stock Ledger
            </button>
            <button onClick={() => { setView('saved'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'saved' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
              <FileText size={18} /> Quotes
            </button>

            {showUsersTab && (
              <button onClick={() => { setView('admin'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'admin' ? 'bg-purple-50 text-purple-700 dark:bg-slate-700 dark:text-purple-400' : 'text-slate-600 dark:text-slate-400'}`}>
                <Shield size={18} /> Admin
              </button>
            )}

            {/* Mobile Exchange Rate Input */}
            {safeRole !== 'labour' && (
              <div className="p-3 rounded-lg text-sm font-bold flex items-center justify-between text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-3"><DollarSign size={18} /> USD Rate</div>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(Number(e.target.value))}
                  className="w-20 p-1 text-right border rounded bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                />
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-700 my-2 pt-2">
              <button onClick={handleLogout} className="w-full p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <LogOut size={18} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-4 md:p-6">
        {view === 'inventory' && (
          <InventoryManager
            user={user}
            userRole={userRole}
            transactions={transactions}
            readOnly={isInventoryReadOnly}
            exchangeRate={exchangeRate}
          />
        )}

        {view === 'ledger' && (
          <InventoryLedger
            user={user}
            userRole={userRole}
            inventory={inventory}
            transactions={transactions}
            readOnly={isLedgerReadOnly}
          />
        )}

        {view === 'saved' && (
          <SavedQuotesManager
            user={user}
            userRole={userRole}
            inventory={inventory}
            transactions={transactions}
            exchangeRate={exchangeRate}
            onLoadQuote={handleLoadQuote}
            readOnly={isBOMReadOnly}
          />
        )}

        {view === 'admin' && showUsersTab && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <UserManager user={user} />
            <BackupManager />
          </div>
        )}

        {view === 'quote' && (
          <QuoteCalculator
            user={user}
            userRole={userRole}
            inventory={inventory}
            transactions={transactions}
            state={calcState}
            setState={setCalcState}
            exchangeRate={exchangeRate}
            setExchangeRate={setExchangeRate}
            onSaveQuote={handleSaveQuote}
            readOnly={isBOMReadOnly}
          />
        )}
      </main>
    </div>
  );
};

export default App;