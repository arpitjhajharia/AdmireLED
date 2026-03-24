import React, { useState, useEffect } from 'react';
import { Calculator, Sun, Moon, Box, Archive, FileText, Shield, LogOut, Database, Menu, X, DollarSign, LayoutDashboard } from 'lucide-react';
import { auth, db, appId } from './lib/firebase';
import { calculateBOM, generateId } from './lib/utils';
import { getNextQuoteRef } from './lib/quotes';

import { CONFIG } from './lib/config';


// Components
import InventoryManager from './components/InventoryManager';
import InventoryLedger from './components/InventoryLedger';
import SavedQuotesManager from './components/SavedQuotesManager';
import QuoteCalculator from './components/QuoteCalculator';
import UserManager from './components/UserManager';
import ProjectManager from './components/ProjectManager';
import BackupManager from './components/BackupManager';
import GlobalSettings from './components/GlobalSettings';
import Login from './components/Login';
import Home from './components/Home';
import TaskManager from './components/TaskManager';
import ReportingTracker from './components/ReportingTracker';
import CRMManager from './components/CRMManager';
import MiscStockTracker from './components/MiscStockTracker';
import CutListCalculator from './components/CutListCalculator';

// Signage Components
import SignageCalculator from './components/SignageCalculator';
import SignageInventoryManager from './components/SignageInventoryManager';
import SignageQuotesManager from './components/SignageQuotesManager';


const App = () => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [activeModule, setActiveModule] = useState('home');

    // Signage Application Load State
    const [signageLoadedState, setSignageLoadedState] = useState(null);
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
    client: '', project: '', ref: '', clientId: '', unit: 'ft',
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
  const [lastSavedState, setLastSavedState] = useState(null);

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

  // 4. Global Settings (Exchange Rate)
  useEffect(() => {
    if (!db) return;
    const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('settings').doc('global')
      .onSnapshot(doc => {
        if (doc.exists && doc.data().exchangeRate) {
          setExchangeRate(doc.data().exchangeRate);
        }
      });
    return () => unsub();
  }, [user]);

  // 5. LABOUR REDIRECT: If Labour tries to view Calculator, push them to Saved Quotes
  useEffect(() => {
    if (userRole === 'labour' && view === 'quote') {
      // Defer to next tick to avoid synchronous setState warning
      Promise.resolve().then(() => setView('saved'));
    }
  }, [userRole, view]);

  const handleLogout = () => {
    auth.signOut();
    setView('quote');
    setActiveModule('home');
    setUser(null);
    setUserRole(null);
    setIsMenuOpen(false);
  };

  // --- SANITIZER: Firestore rejects undefined values ---
  const sanitizeForFirestore = (obj) => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      clean[key] = value === undefined ? null : sanitizeForFirestore(value);
    }
    return clean;
  };

  // --- SAVE LOGIC ---
  const handleSaveQuote = async (finalAmount, linkedClientId = '') => {
    if (!calcState.client && !linkedClientId) return alert("Please enter Client and Project names.");
    if (!calcState.project) return alert("Please enter a Project name.");

    // Check if anything has changed (ignoring auto-appended -COPY and (Copy))
    // Check if anything has changed (ignoring auto-appended -COPY and (Copy))
    let currentRef = calcState.ref;

    // Auto-generate ref if missing or if it has -COPY suffix
    if (!currentRef || currentRef.includes('-COPY')) {
      try {
        currentRef = await getNextQuoteRef();
        // Upate state immediately so we don't re-generate next time
        setCalcState(prev => ({ ...prev, ref: currentRef }));
      } catch (err) {
        console.error("Error generating quote ref:", err);
        // Fallback or alert? Let's just alert and stop for now if we can't get a ref.
        return alert("Could not generate quote reference. Please try again.");
      }
    }

    if (lastSavedState) {

      const s1 = JSON.parse(lastSavedState);
      const s2 = { ...calcState };

      // Strip auto-suffixes for comparison
      if (s2.ref && s2.ref === s1.ref + '-COPY') s2.ref = s1.ref;
      if (s2.client && s2.client === s1.client + ' (Copy)') s2.client = s1.client;
      if (s2.project && s2.project === s1.project + ' (Copy)') s2.project = s1.project;

      if (JSON.stringify(s1) === JSON.stringify(s2)) {
        alert("No changes detected since the quote was loaded. Version not saved.");
        return;
      }
    }

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
      const globalQuoteRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes').doc();
      let crmQuoteRef = null;

      if (linkedClientId) {
        crmQuoteRef = db.collection('artifacts').doc(appId).collection('public').doc('data')
          .collection('crm_leads').doc(linkedClientId).collection('quotes').doc();
      }

      const quoteData = sanitizeForFirestore({
        client: calcState.client,
        project: calcState.project,
        ref: currentRef,
        calculatorState: { ...calcState, ref: currentRef },

        finalAmount: Math.round(finalAmount || 0),
        screenCount: calcState.screens.length,
        totalScreenQty: allScreensData?.totalScreenQty || 0,
        allScreensData: allScreensData,
        // CRM cross-link fields
        clientId: linkedClientId || '',
        clientName: calcState.client || '',
        crmQuoteId: crmQuoteRef ? crmQuoteRef.id : '',
        createdBy: user.email,
        updatedAt: new Date()
      });

      // 1. Always save to the global quotes collection
      await globalQuoteRef.set(quoteData);

      // Update last saved state after success
      setLastSavedState(JSON.stringify(calcState));

      // 2. If linked to a CRM client, also write into that client's quotes subcollection
      //    so it shows up natively in ClientDashboard
      if (crmQuoteRef && linkedClientId) {
        const crmQuoteData = sanitizeForFirestore({
          ref: currentRef || calcState.project,        // Prefer explicit ref

          projectName: calcState.project,
          version: 'v1',
          date: new Date().toISOString().split('T')[0],
          amount: Math.round(finalAmount || 0),
          status: 'Sent',
          items: allScreensData
            ? allScreensData.screenConfigs.map((s, i) => ({
              product: `Screen #${i + 1} — ${s.targetWidth}×${s.targetHeight} ${calcState.unit}`,
              qty: Number(s.screenQty) || 0,
              uom: 'Nos',
              rate: Math.round(allScreensData.calculations[i]?.matrix?.sell?.unit || 0),
              amount: Math.round(allScreensData.calculations[i]?.totalProjectSell || 0),
            }))
            : [],
          subtotal: Math.round(finalAmount || 0),
          gstPct: 0,
          taxAmount: 0,
          grandTotal: Math.round(finalAmount || 0),
          calculatorRef: true,           // marks this as generated from the Calculator
          globalQuoteId: globalQuoteRef.id,
          calculatorState: { ...calcState, ref: currentRef },     // Save full state for easy restoration

          createdBy: user.email,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await crmQuoteRef.set(crmQuoteData);
      }

      alert("Quote Saved Successfully!" + (linkedClientId ? "\nAlso linked to CRM Client." : ""));
    } catch (e) {
      console.error("Save quote error:", e);
      alert("Error saving quote: " + (e.message || e.code || "Unknown error"));
    }
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
      if (newState.ref) newState.ref = newState.ref + '-COPY';
    }

    // Store original state for comparison (before -COPY)
    setLastSavedState(JSON.stringify(newState));

    setCalcState(newState);
    setView('quote');
    setIsMenuOpen(false);
  };

  // ── Open a CRM LED quote in the Calculator ──
  const handleOpenLEDCalculatorFromCRM = async (crmQuote) => {
    let fullState = crmQuote.calculatorState;

    // If not in CRM quote directly, try fetching via globalQuoteId
    if (!fullState && crmQuote.globalQuoteId) {
      try {
        const globalDoc = await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quotes').doc(crmQuote.globalQuoteId).get();
        if (globalDoc.exists) {
          fullState = globalDoc.data().calculatorState;
        }
      } catch (e) {
        console.error("Error fetching global quote details:", e);
      }
    }

    if (fullState) {
      const newState = { ...initialCalcState, ...fullState };
      newState.terms = {
        ...initialCalcState.terms,
        ...(fullState.terms || {}),
        scope: { ...initialCalcState.terms.scope, ...(fullState.terms?.scope || {}) }
      };
      setCalcState(newState);
      setLastSavedState(JSON.stringify(newState));
    } else {
      // Fallback: pre-fill client/project/ref from quote metadata
      const fallbackState = {
        ...initialCalcState,
        ref: crmQuote.ref || '',
        client: crmQuote.clientName || '',
        project: crmQuote.projectName || crmQuote.ref || '',
      };
      setCalcState(fallbackState);
      setLastSavedState(JSON.stringify(fallbackState));
    }
    setActiveModule('led');
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
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveModule('home')}>
            <img src="/Admire/logo.png" alt="Logo" className="h-10 w-auto" />
            {activeModule === 'led' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400">
                LED Calc
              </span>
            )}
            {activeModule === 'tasks' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
                Tasks
              </span>
            )}
            {activeModule === 'reports' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400">
                BOQ
              </span>
            )}
            {activeModule === 'crm' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400">
                CRM
              </span>
            )}
            {activeModule === 'admin' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400">
                Admin
              </span>
            )}
            {activeModule === 'misc_stock' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-400">
                Misc Stock
              </span>
            )}
            {activeModule === 'cut_list' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                Cut List
              </span>
            )}
            {activeModule === 'signage' && (
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-400">
                Signage Calc
              </span>
            )}
          </div>

          {/* Desktop Navigation */}
          {activeModule === 'led' && (
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg">
              {/* HIDE CALCULATOR FOR LABOUR */}
              {!isLabour && (
                <button onClick={() => setView('quote')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'quote' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Calculator</button>
              )}

              <button onClick={() => setView('inventory')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'inventory' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Components</button>
              <button onClick={() => setView('ledger')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'ledger' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Stock</button>
              <button onClick={() => setView('saved')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'saved' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Quotes</button>
            </nav>
          )}

          {activeModule === 'signage' && (
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg">
              {!isLabour && (
                <button onClick={() => setView('quote')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'quote' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Calculator</button>
              )}
              <button onClick={() => setView('inventory')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'inventory' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Components</button>
              <button onClick={() => setView('saved')} className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${view === 'saved' ? 'bg-white dark:bg-slate-600 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}>Quotes</button>
            </nav>
          )}

          {/* User Controls */}
          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-700">

            {/* Global Exchange Rate (Moved to Admin Tab) */}

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
            {activeModule === 'home' && (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400 text-center">
                Select a module from the home page.
              </div>
            )}

            {activeModule === 'led' && (
              <>
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
              </>
            )}

            {activeModule === 'signage' && (
              <>
                {!isLabour && (
                  <button onClick={() => { setView('quote'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'quote' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    <LayoutDashboard size={18} /> Calculator
                  </button>
                )}
                <button onClick={() => { setView('inventory'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'inventory' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  <Box size={18} /> Components
                </button>
                <button onClick={() => { setView('saved'); setIsMenuOpen(false); }} className={`p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 ${view === 'saved' ? 'bg-teal-50 text-teal-700 dark:bg-slate-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  <FileText size={18} /> Quotes
                </button>
              </>
            )}

            {/* Mobile Exchange Rate Input (Moved to Admin Tab) */}

            <div className="border-t border-slate-100 dark:border-slate-700 my-2 pt-2">
              <button onClick={handleLogout} className="w-full p-3 rounded-lg text-sm font-bold text-left flex items-center gap-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <LogOut size={18} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-4 md:p-6">
        {activeModule === 'home' && (
          <Home
            onSelectModule={(mod) => {
              setActiveModule(mod);
              if (mod === 'led' || mod === 'signage') setView('quote');
            }}
            darkMode={darkMode}
            showAdmin={showUsersTab}
          />
        )}

        {activeModule === 'led' && (
          <>
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
          </>
        )}

        {activeModule === 'signage' && (
          <>
            {view === 'inventory' && (
              <SignageInventoryManager
                user={user}
                userRole={userRole}
                readOnly={isInventoryReadOnly}
              />
            )}
            {view === 'saved' && (
              <SignageQuotesManager
                user={user}
                userRole={userRole}
                readOnly={isBOMReadOnly}
                onLoadQuote={(quote, isClone) => {
                    setSignageLoadedState(isClone ? { ...quote.state, ref: '' } : quote.state);
                    setView('quote');
                }}
              />
            )}
            {view === 'quote' && (
              <SignageCalculator
                user={user}
                userRole={userRole}
                readOnly={isBOMReadOnly}
                loadedState={signageLoadedState}
              />
            )}
          </>
        )}

        {activeModule === 'tasks' && (
          <TaskManager user={user} userRole={userRole} />
        )}

        {activeModule === 'reports' && (
          <ReportingTracker user={user} userRole={userRole} />
        )}

        {activeModule === 'crm' && (
          <CRMManager user={user} userRole={userRole} onOpenLEDCalculator={handleOpenLEDCalculatorFromCRM} />
        )}

        {activeModule === 'misc_stock' && (
          <MiscStockTracker user={user} userRole={userRole} />
        )}

        {activeModule === 'cut_list' && (
          <CutListCalculator />
        )}

        {activeModule === 'admin' && showUsersTab && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 animate-in fade-in duration-300">
            <div className="flex flex-col gap-4">
              <GlobalSettings />
              <BackupManager />
            </div>
            <div className="flex flex-col gap-4">
              <ProjectManager user={user} />
            </div>
            <div className="flex flex-col gap-4">
              <UserManager user={user} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;