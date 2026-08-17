/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Database, 
  FolderMinus, 
  Package, 
  PackageCheck,
  ShieldAlert,
  LogOut,
  RefreshCw,
  User,
  Info,
  Boxes,
  Layers,
  FileText,
  Download,
  Users,
  Settings,
  HardDriveDownload
} from 'lucide-react';

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './lib/firebase';

import { BaseProduct, TriageUnit, DailyInflowRecord } from './types';
import { 
  subscribeBaseProducts,
  subscribeTriageUnits,
  subscribeDailyInflows,
  saveBaseProduct,
  saveBatchBaseProducts,
  deleteBaseProduct,
  saveTriageUnit,
  deleteTriageUnit,
  checkoutTriageUnit,
  saveDailyInflow,
  saveBatchDailyInflows,
  deleteDailyInflow,
  resetDatabaseToDefaults,
  createAuditLog,
  ensureUserProfileExists
} from './lib/dbService';

import Dashboard from './components/Dashboard';
import BaseCatalog from './components/BaseCatalog';
import RmaEntry from './components/RmaEntry';
import PhysicalStock from './components/PhysicalStock';
import LogsAudit from './components/LogsAudit';
import Login from './components/Login';
import ProductMovements from './components/ProductMovements';
import ResetDatabaseModal from './components/ResetDatabaseModal';
import SettingsModal from './components/SettingsModal';
import BackupModal from './components/BackupModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rma' | 'catalog' | 'stock' | 'logs' | 'movement'>('dashboard');
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'operator' | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Database states
  const [products, setProducts] = useState<BaseProduct[]>([]);
  const [triageUnits, setTriageUnits] = useState<TriageUnit[]>([]);
  const [dailyInflows, setDailyInflows] = useState<DailyInflowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Cross-component communication & modals
  const [selectedTriageUnit, setSelectedTriageUnit] = useState<TriageUnit | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);

  // System Settings: Spreadsheet Import Visibility Toggle
  const [enableSpreadsheetImport, setEnableSpreadsheetImport] = useState<boolean>(() => {
    const saved = localStorage.getItem('rmaflow_enable_spreadsheet_import');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleSpreadsheetImport = (enabled: boolean) => {
    setEnableSpreadsheetImport(enabled);
    localStorage.setItem('rmaflow_enable_spreadsheet_import', String(enabled));
  };

  // Listen for Authentication state
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setIsAuthLoading(true);

      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (currentUser) {
        setUser(currentUser);

        // Auto-heal / Ensure Firestore user document exists
        await ensureUserProfileExists(currentUser);

        // Listen to custom user profile from Firestore users collection in real-time
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, async (userSnap) => {
          if (userSnap.exists()) {
            const userData = userSnap.data();
            let role = userData.role || 'operator';
            
            // Bootstrapped Admin: Include User email from runtime as an admin
            if (currentUser.email === 'alessandro.away6@gmail.com' && userData.role !== 'admin') {
              role = 'admin';
              try {
                await updateDoc(userDocRef, { role: 'admin' });
              } catch (e) {
                console.error('Failed to auto-upgrade to admin:', e);
              }
            }
            
            setUserRole(role);
            setUserName(userData.name || currentUser.displayName || 'Operador Corporativo');
          } else {
            // Fallback create profile in Firestore
            const fallbackProfile = await ensureUserProfileExists(currentUser);
            if (fallbackProfile) {
              setUserRole(fallbackProfile.role);
              setUserName(fallbackProfile.name);
            }
          }
          setIsAuthLoading(false);
        }, (err) => {
          console.error('Error in user profile subscription:', err);
          setUserRole(currentUser.email === 'alessandro.away6@gmail.com' ? 'admin' : 'operator'); // safe fallback
          setUserName(currentUser.displayName || 'Operador Corporativo');
          setIsAuthLoading(false);
        });
      } else {
        setUser(null);
        setUserRole(null);
        setUserName('');
        setIsAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  // Listen for real-time Firestore database collections when authenticated
  useEffect(() => {
    if (!user) return;

    setIsLoading(true);
    setSyncError(null);
    
    // Fail-safe timeout so UI never hangs in loading state if network or Firestore is slow
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    // Subscribe to products in real-time
    const unsubscribeProducts = subscribeBaseProducts((fetchedProducts) => {
      setProducts(fetchedProducts);
      setIsLoading(false);
    }, (err) => {
      console.error('Error syncing products:', err);
      setSyncError(err?.message || String(err));
      setIsLoading(false);
    });

    // Subscribe to triage units in real-time
    const unsubscribeTriage = subscribeTriageUnits((fetchedUnits) => {
      setTriageUnits(fetchedUnits);
      setIsLoading(false);
    }, (err) => {
      console.error('Error syncing triage units:', err);
      setSyncError(err?.message || String(err));
      setIsLoading(false);
    });

    // Subscribe to daily inflows in real-time
    const unsubscribeDailyInflows = subscribeDailyInflows((fetchedInflows) => {
      setDailyInflows(fetchedInflows);
      setIsLoading(false);
    }, (err) => {
      console.error('Error syncing daily inflows:', err);
      setIsLoading(false);
    });

    return () => {
      clearTimeout(loadingTimeout);
      unsubscribeProducts();
      unsubscribeTriage();
      unsubscribeDailyInflows();
    };
  }, [user]);

  // Daily Inflow actions
  const handleSaveDailyInflow = async (record: DailyInflowRecord) => {
    await saveDailyInflow(record);
  };

  const handleSaveBatchDailyInflows = async (records: DailyInflowRecord[]) => {
    return await saveBatchDailyInflows(records);
  };

  const handleDeleteDailyInflow = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Acesso negado: Apenas administradores podem apagar lançamentos do fluxo de entradas.');
      return;
    }
    await deleteDailyInflow(id);
  };

  // Catálogo de Base actions
  const handleSaveProduct = async (product: BaseProduct) => {
    await saveBaseProduct(product);
  };

  const handleSaveBatchProducts = async (productsToSave: BaseProduct[]) => {
    return await saveBatchBaseProducts(productsToSave, products);
  };

  const handleDeleteProduct = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Apenas administradores possuem privilégios para excluir produtos do catálogo.');
      return;
    }
    await deleteBaseProduct(id);
  };

  // Triage actions
  const handleSaveTriage = async (unit: TriageUnit) => {
    await saveTriageUnit(unit);
  };

  const handleDeleteTriage = async (id: string) => {
    if (userRole !== 'admin') {
      alert('Acesso negado: Apenas administradores podem apagar permanentemente registros de triagem.');
      return;
    }
    await deleteTriageUnit(id);
  };

  const handleCheckoutTriage = async (id: string) => {
    await checkoutTriageUnit(id);
  };

  // Reset database back to default seed via secure password confirmation modal
  const handleResetData = () => {
    setIsResetModalOpen(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserRole(null);
      setUserName('');
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  // Navigate to detailed unit specs from Dashboard
  const handleViewUnitDetails = (unit: TriageUnit) => {
    setSelectedTriageUnit(unit);
    setActiveTab('stock');
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4" id="auth-loading-screen">
        <svg className="animate-spin h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-slate-400 text-sm font-semibold tracking-wider">Verificando credenciais corporativas seguras...</p>
      </div>
    );
  }

  // Render Login screen if not authenticated
  if (!user) {
    return <Login onLoginSuccess={() => setActiveTab('dashboard')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="app-root">
      
      {/* Top Main Navigation Bar */}
      <header className="bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-40 shadow-md" id="main-header">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            
            {/* Logo and title (Clickable to access Dashboard) */}
            <button
              onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
              className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer group hover:opacity-90 transition-opacity shrink-0"
              title="Ir para o Dashboard"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-sky-500 to-sky-600 rounded-lg shadow-md shadow-sky-500/20 text-white flex items-center justify-center group-hover:scale-105 transition-all duration-200">
                <Boxes className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1 leading-none">
                  Stocck <span className="text-sky-400 font-bold group-hover:text-sky-300 transition-colors">RMA</span>
                </h1>
                <p className="text-[10px] text-slate-400 tracking-wider uppercase font-bold mt-0.5">Gestão e Triagem</p>
              </div>
            </button>

            {/* Desktop Navigation Tabs (Sleek Segmented Pill) */}
            <nav className="hidden lg:flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 shadow-inner shrink-0" id="desktop-navigation">
              <button
                onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs xl:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-dashboard"
              >
                <TrendingUp className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => { setActiveTab('rma'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs xl:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'rma' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/10' : 'border border-transparent text-slate-400 hover:text-rose-300 hover:bg-slate-800/60'
                }`}
                id="nav-rma"
              >
                <FolderMinus className={`w-4 h-4 shrink-0 ${activeTab === 'rma' ? 'text-rose-400' : 'text-slate-400'}`} />
                <span>Entrada de RMA</span>
              </button>

              <button
                onClick={() => { setActiveTab('catalog'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs xl:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'catalog' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-catalog"
              >
                <Database className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Catálogo de Base</span>
              </button>

              <button
                onClick={() => { setActiveTab('stock'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs xl:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'stock' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-stock"
              >
                <Package className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Estoque Físico</span>
              </button>

              <button
                onClick={() => { setActiveTab('movement'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs xl:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'movement' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-movement"
              >
                <Boxes className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Fluxo de Entradas</span>
              </button>

              <button
                onClick={() => { setActiveTab('logs'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs xl:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'logs' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-logs"
              >
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Auditoria & Logs</span>
              </button>
            </nav>

            {/* Authenticated user profile, actions, and logout */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Backup & Restore Action Button */}
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 hover:text-white rounded-xl border border-indigo-500/30 hover:border-indigo-500/50 transition-all cursor-pointer text-xs font-bold shadow-sm whitespace-nowrap"
                title="Backup & Restauração de Dados"
                id="btn-open-backup-header"
              >
                <HardDriveDownload className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="hidden xl:inline">Backup</span>
              </button>

              {/* Settings Button */}
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer text-xs font-bold shadow-sm group whitespace-nowrap"
                title="Configurações do Sistema"
                id="btn-open-settings"
              >
                <Settings className="w-4 h-4 text-sky-400 group-hover:rotate-45 transition-transform duration-300 shrink-0" />
                <span className="hidden xl:inline">Configurações</span>
              </button>

              {/* PRD Download for QA & Testing */}
              <a
                href="./PRD_RMA_FLOW.md"
                download="PRD_RMA_FLOW.md"
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm whitespace-nowrap"
                title="Baixar o arquivo PRD completo (.MD) para testes"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>PRD</span>
              </a>

              {/* Secure logout */}
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 hover:border-rose-500/30 transition-all cursor-pointer text-xs font-bold shadow-sm whitespace-nowrap"
                title="Sair da conta atual"
                id="btn-logout"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Tabs (Secondary top bar) */}
      <div className="lg:hidden bg-slate-900 border-b border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none py-2.5 px-4 flex gap-1.5 shadow-inner items-center" id="mobile-navigation">
        <button
          onClick={() => setIsBackupModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0 hover:text-white"
          title="Backup e Restauração"
          id="mobile-btn-backup"
        >
          <HardDriveDownload className="w-4 h-4 text-indigo-400" />
          <span>Backup</span>
        </button>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0 hover:text-white"
          title="Configurações"
          id="mobile-btn-settings"
        >
          <Settings className="w-4 h-4 text-sky-400" />
          <span>Configurações</span>
        </button>
        <a
          href="./PRD_RMA_FLOW.md"
          download="PRD_RMA_FLOW.md"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>PRD</span>
        </a>
        <button
          onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => { setActiveTab('rma'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'rma' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <FolderMinus className={`w-4 h-4 ${activeTab === 'rma' ? 'text-rose-400' : 'text-slate-400'}`} />
          <span>Entrada RMA</span>
        </button>
        <button
          onClick={() => { setActiveTab('catalog'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'catalog' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Catálogo Base</span>
        </button>
        <button
          onClick={() => { setActiveTab('stock'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'stock' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Estoque Físico</span>
        </button>
        <button
          onClick={() => { setActiveTab('movement'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'movement' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Fluxo Entradas</span>
        </button>
        <button
          onClick={() => { setActiveTab('logs'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'logs' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Auditoria</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0 hover:bg-rose-500/20"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>

      {/* Main Container Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" id="main-content">
        {syncError ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 max-w-md mx-auto text-center space-y-4 bg-slate-900 border border-rose-500/30 rounded-2xl shadow-xl" id="sync-error-state">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
              <ShieldAlert className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold text-white">Falha na Sincronização em Tempo Real</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ocorreu um erro de permissão ou conexão ao se comunicar com o banco de dados Firestore remoto.
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-mono text-rose-400 max-w-full overflow-x-auto w-full break-all">
              {syncError}
            </div>
            <p className="text-[11px] text-slate-500">
              Isso pode ocorrer se as regras do Firestore não estiverem prontas ou se houver um atraso na propagação das políticas.
            </p>
            <div className="flex gap-2.5 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg text-xs transition-all cursor-pointer"
              >
                Recarregar Página
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={handleResetData}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold rounded-lg text-xs transition-all cursor-pointer"
                >
                  Forçar Reset / Seed
                </button>
              )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4" id="app-loading-state">
            <svg className="animate-spin h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-slate-400 text-sm font-semibold tracking-wider font-mono">Carregando sincronização de dados remotos em tempo real...</p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-200">
            {activeTab === 'dashboard' && (
              <Dashboard 
                units={triageUnits}
                products={products}
                onViewUnit={handleViewUnitDetails}
                onNavigateToStock={() => setActiveTab('stock')}
                onResetData={handleResetData}
              />
            )}

            {activeTab === 'catalog' && (
              <BaseCatalog 
                products={products}
                onSaveProduct={handleSaveProduct}
                onSaveBatchProducts={handleSaveBatchProducts}
                onDeleteProduct={handleDeleteProduct}
                userRole={userRole}
                enableSpreadsheetImport={enableSpreadsheetImport}
              />
            )}

            {activeTab === 'rma' && (
              <RmaEntry 
                products={products}
                units={triageUnits}
                onSaveTriage={handleSaveTriage}
                onNavigateToStock={() => setActiveTab('stock')}
              />
            )}

            {activeTab === 'stock' && (
              <PhysicalStock 
                units={triageUnits}
                products={products}
                onUpdateUnit={handleSaveTriage}
                onDeleteUnit={handleDeleteTriage}
                onCheckoutUnit={handleCheckoutTriage}
                initialSelectedUnit={selectedTriageUnit}
                onClearSelectedUnit={() => setSelectedTriageUnit(null)}
                onSaveTriage={handleSaveTriage}
                enableSpreadsheetImport={enableSpreadsheetImport}
              />
            )}

            {activeTab === 'logs' && (
              <LogsAudit 
                userRole={userRole} 
                onResetData={handleResetData}
                productsCount={products.length}
                triageUnitsCount={triageUnits.length}
                dailyInflowsCount={dailyInflows.length}
              />
            )}

            {activeTab === 'movement' && (
              <ProductMovements 
                products={products}
                units={triageUnits}
                dailyInflows={dailyInflows}
                onSaveDailyInflow={handleSaveDailyInflow}
                onSaveBatchDailyInflows={handleSaveBatchDailyInflows}
                onDeleteDailyInflow={handleDeleteDailyInflow}
                onSaveTriage={handleSaveTriage}
                userRole={userRole}
                enableSpreadsheetImport={enableSpreadsheetImport}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="bg-slate-900/50 border-t border-slate-800 py-6 mt-16 text-center text-sm text-slate-400" id="main-footer">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>RMA Flow v2.0.0 (Web) • Sistema de Triagem Logística & Rastreabilidade</span>
          <div className="flex gap-4">
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <Info className="w-3.5 h-3.5" />
              Sincronizado com Firebase Cloud DB (Firestore)
            </span>
          </div>
        </div>
      </footer>

      {/* System Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        enableSpreadsheetImport={enableSpreadsheetImport}
        onToggleSpreadsheetImport={handleToggleSpreadsheetImport}
        onOpenBackupModal={(tab) => {
          setIsBackupModalOpen(true);
        }}
        userRole={userRole}
        userEmail={user?.email || ''}
      />

      {/* Local System Backup & Restoration Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        userEmail={user?.email || ''}
        userName={userName}
        userRole={userRole}
        currentCounts={{
          products: products.length,
          triageUnits: triageUnits.length,
          dailyInflows: dailyInflows.length
        }}
        onRestoreSuccess={() => {
          setActiveTab('dashboard');
        }}
      />

      {/* Database Reset Password Confirmation Modal */}
      <ResetDatabaseModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        userEmail={user?.email || ''}
        userRole={userRole}
        onSuccess={() => {
          setActiveTab('dashboard');
        }}
      />
    </div>
  );
}
