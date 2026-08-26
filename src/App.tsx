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
  HardDriveDownload,
  Clock,
  Zap
} from 'lucide-react';

import { BaseProduct, TriageUnit, DailyInflowRecord, PendingItem, PendingStatusType, DestinationSectorType } from './types';
import { 
  getInitialBaseProducts,
  getMoreBaseProducts,
  getInitialTriageUnits,
  getInitialPendingItems,
  getInitialDailyInflows,
  saveBaseProduct,
  saveBatchBaseProducts,
  deleteBaseProduct,
  saveTriageUnit,
  deleteTriageUnit,
  checkoutTriageUnit,
  saveDailyInflow,
  saveBatchDailyInflows,
  deleteDailyInflow,
  savePendingItem,
  deletePendingItem,
  updatePendingItemStatus,
  transferPendingItemToStock,
  // Removido imports obsoletos (createAuditLog, ensureUserProfileExists, resetDatabaseToDefaults)
  purgeExistingAuditLogs
} from './lib/dbService';
import {
  getCachedBaseProducts,
  getCachedTriageUnits,
  getCachedDailyInflows,
  getCachedPendingItems
} from './lib/syncCacheService';

import Dashboard from './components/Dashboard';
import BaseCatalog from './components/BaseCatalog';
import RmaEntry from './components/RmaEntry';
import PhysicalStock from './components/PhysicalStock';
import PendingItems from './components/PendingItems';
import Login from './components/Login';
import ProductMovements from './components/ProductMovements';
import SettingsModal from './components/SettingsModal';
import BackupModal from './components/BackupModal';
import DatabaseSwitcherModal from './components/DatabaseSwitcherModal';
import { checkAndRunScheduledBackups } from './lib/backupService';
import { getSupabaseClient } from './lib/supabase';
import { subscribeToSupabaseAuth, signOutSupabase } from './lib/supabaseAuth';
import { ThemeMode, getSavedTheme, applyTheme } from './lib/theme';
import { initSystemIntegrationsSync } from './lib/integrationsConfigService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rma' | 'catalog' | 'stock' | 'pending' | 'movement'>('dashboard');
  
  // Theme state (Dark / Light)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getSavedTheme());

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  const handleSelectTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  };
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'operator' | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Database states initialized instantly from local cache (0ms blocking time)
  const [products, setProducts] = useState<BaseProduct[]>(() => getCachedBaseProducts());
  const [triageUnits, setTriageUnits] = useState<TriageUnit[]>(() => getCachedTriageUnits());
  const [dailyInflows, setDailyInflows] = useState<DailyInflowRecord[]>(() => getCachedDailyInflows());
  const [pendingItems, setPendingItems] = useState<PendingItem[]>(() => getCachedPendingItems());
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const hasCachedData = getCachedBaseProducts().length > 0 || getCachedTriageUnits().length > 0;
    return !hasCachedData;
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  // Cross-component communication & modals
  const [selectedTriageUnit, setSelectedTriageUnit] = useState<TriageUnit | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isDbSwitcherModalOpen, setIsDbSwitcherModalOpen] = useState<boolean>(false);

  // System Settings: Spreadsheet Import Visibility Toggle
  const [enableSpreadsheetImport, setEnableSpreadsheetImport] = useState<boolean>(() => {
    const saved = localStorage.getItem('rmaflow_enable_spreadsheet_import');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleSpreadsheetImport = (enabled: boolean) => {
    setEnableSpreadsheetImport(enabled);
    localStorage.setItem('rmaflow_enable_spreadsheet_import', String(enabled));
  };

  // Listen for Authentication state with Supabase Auth
  useEffect(() => {
    setIsAuthLoading(true);

    const unsubscribeAuth = subscribeToSupabaseAuth(async (currentUser, profile) => {
      if (currentUser) {
        setUser(currentUser);

        if (profile) {
          setUserRole(profile.role);
          setUserName(profile.name);
        } else {
          const isMasterAdmin = currentUser.email === 'alessandro.away6@gmail.com';
          setUserRole(isMasterAdmin ? 'admin' : 'operator');
          setUserName(currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'Operador Corporativo');
        }
        setIsAuthLoading(false);
      } else {
        setUser(null);
        setUserRole(null);
        setUserName('');
        setIsAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Database pagination & loading states
  const [productsLastDoc, setProductsLastDoc] = useState<any | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState<boolean>(false);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState<boolean>(false);
  const lastLoadedUserIdRef = React.useRef<string | null>(null);

  // Initial Data Fetching from Database
  const loadInitialData = async () => {
    try {
      setSyncError(null);
      
      // Clean up legacy logs in background
      purgeExistingAuditLogs().catch(() => {});

      const [prodRes, triageRes, pendingList, inflowList] = await Promise.all([
        getInitialBaseProducts(2500),
        getInitialTriageUnits(2500),
        getInitialPendingItems(1000),
        getInitialDailyInflows(1000)
      ]);

      if (prodRes && Array.isArray(prodRes.data)) {
        setProducts(prodRes.data);
        setProductsLastDoc(prodRes.lastDoc);
        setHasMoreProducts(prodRes.hasMore);
      }

      if (triageRes && Array.isArray(triageRes.data)) {
        setTriageUnits(triageRes.data);
      }
      if (Array.isArray(pendingList)) {
        setPendingItems(pendingList);
      }
      if (Array.isArray(inflowList)) {
        setDailyInflows(inflowList);
      }
    } catch (err: any) {
      console.error('Error loading initial database data:', err);
      const cachedProds = getCachedBaseProducts();
      const cachedTriages = getCachedTriageUnits();
      if (cachedProds.length > 0) setProducts(cachedProds);
      if (cachedTriages.length > 0) setTriageUnits(cachedTriages);

      // Only show error screen if we have absolutely no data to show
      if (cachedProds.length === 0 && cachedTriages.length === 0) {
        setSyncError(err?.message || String(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      lastLoadedUserIdRef.current = null;
      return;
    }
    // Only load initial data when user first logs in or user ID actually changes, not on window focus/tab switch
    if (lastLoadedUserIdRef.current !== user.id) {
      lastLoadedUserIdRef.current = user.id;
      loadInitialData();
    }
  }, [user?.id]);

  // Load More Base Products via startAfter() pagination
  const handleLoadMoreProducts = async () => {
    if (!productsLastDoc || isLoadingMoreProducts || !hasMoreProducts) return;
    setIsLoadingMoreProducts(true);
    try {
      const res = await getMoreBaseProducts(productsLastDoc, 2500);
      setProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newItems = res.data.filter(p => !existingIds.has(p.id));
        return [...prev, ...newItems];
      });
      setProductsLastDoc(res.lastDoc);
      setHasMoreProducts(res.hasMore);
    } catch (err) {
      console.error('Error loading more products:', err);
    } finally {
      setIsLoadingMoreProducts(false);
    }
  };

  // Initialize Cross-Device System Integrations & Metrics Sync (Supabase PAT, Cloudinary, Saved Metrics)
  useEffect(() => {
    initSystemIntegrationsSync(user?.email).catch((err) => {
      console.warn('System integrations background sync note:', err);
    });
  }, [user?.email]);

  // Auto-backup scheduler background runner
  useEffect(() => {
    if (!user) return;

    const checkSchedule = async () => {
      try {
        await checkAndRunScheduledBackups({
          email: user.email || undefined,
          name: userName || user.displayName || undefined,
          role: userRole || 'operator'
        });
      } catch (e) {
        console.warn('Auto backup scheduler background tick error:', e);
      }
    };

    // Initial check after 4 seconds of session start
    const initTimer = setTimeout(checkSchedule, 4000);
    // Recurring check every 45 seconds
    const interval = setInterval(checkSchedule, 45000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [user?.id, userName, userRole]);

  // Pending Items actions (Optimized local state updates)
  const handleSavePendingItem = async (item: PendingItem) => {
    const saved = await savePendingItem(item);
    setPendingItems(prev => {
      const index = prev.findIndex(p => p.id === saved.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleDeletePendingItem = async (id: string) => {
    const cleanId = (id || '').trim();
    if (!cleanId) return;
    const target = pendingItems.find(p => p.id === cleanId);
    await deletePendingItem(cleanId, target?.sku, target?.productName);
    setPendingItems(prev => prev.filter(p => p.id !== cleanId));
  };

  const handleUpdatePendingStatus = async (id: string, status: PendingStatusType) => {
    await updatePendingItemStatus(id, status);
    const now = new Date().toISOString();
    setPendingItems(prev => prev.map(p => p.id === id ? { 
      ...p, 
      status, 
      updatedAt: now,
      ...(status === 'Resolvido' ? { resolvedAt: now } : {})
    } : p));
  };

  const handleTransferPendingToStock = async (
    item: PendingItem,
    destination: DestinationSectorType,
    details?: {
      deviceStatus?: string;
      packageStatus?: string;
      accessoriesInclusion?: string;
      notes?: string;
    }
  ) => {
    const createdUnit = await transferPendingItemToStock(item, destination, details);
    const now = new Date().toISOString();
    setPendingItems(prev => prev.map(p => p.id === item.id ? { 
      ...p, 
      status: 'Resolvido', 
      transferredToStock: true, 
      transferredUnitId: createdUnit.id, 
      resolvedAt: now 
    } : p));
    setTriageUnits(prev => [createdUnit, ...prev]);
    return createdUnit;
  };

  // Daily Inflow actions
  const handleSaveDailyInflow = async (record: DailyInflowRecord) => {
    await saveDailyInflow(record);
    setDailyInflows(prev => {
      const index = prev.findIndex(r => r.id === record.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = record;
        return next;
      }
      return [...prev, record].sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  const handleSaveBatchDailyInflows = async (records: DailyInflowRecord[]) => {
    const result = await saveBatchDailyInflows(records);
    setDailyInflows(prev => {
      const map = new Map<string, DailyInflowRecord>(prev.map(r => [r.id, r]));
      records.forEach(r => map.set(r.id, r));
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    });
    return result;
  };

  const handleDeleteDailyInflow = async (id: string) => {
    const cleanId = (id || '').trim();
    if (!cleanId) return;
    await deleteDailyInflow(cleanId);
    setDailyInflows(prev => prev.filter(r => r.id !== cleanId));
  };

  // Catálogo de Base actions (Zero-Read Post-Write Optimization)
  const handleSaveProduct = async (product: BaseProduct) => {
    const saved = await saveBaseProduct(product);
    setProducts(prev => {
      const index = prev.findIndex(p => p.id === saved.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleSaveBatchProducts = async (productsToSave: BaseProduct[]) => {
    const res = await saveBatchBaseProducts(productsToSave, products);
    if (res.savedProducts && res.savedProducts.length > 0) {
      setProducts(prev => {
        const map = new Map<string, BaseProduct>(prev.map(p => [p.id, p]));
        res.savedProducts.forEach(sp => map.set(sp.id, sp));
        return Array.from(map.values());
      });
    }
    return { added: res.added, updated: res.updated };
  };

  const handleDeleteProduct = async (id: string) => {
    const cleanId = (id || '').trim();
    if (!cleanId) return;
    const target = products.find(p => p.id === cleanId);
    await deleteBaseProduct(cleanId, target?.sku, target?.name);
    setProducts(prev => prev.filter(p => p.id !== cleanId));
  };

  // Triage actions
  const handleSaveTriage = async (unit: TriageUnit) => {
    const saved = await saveTriageUnit(unit);
    setTriageUnits(prev => {
      const index = prev.findIndex(u => u.id === saved.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleDeleteTriage = async (id: string) => {
    const cleanId = (id || '').trim();
    if (!cleanId) return;
    const target = triageUnits.find(u => u.id === cleanId);
    await deleteTriageUnit(cleanId, target?.trackingCode, target?.baseProductName);
    setTriageUnits(prev => prev.filter(u => u.id !== cleanId));
  };

  const handleCheckoutTriage = async (id: string) => {
    const target = triageUnits.find(u => u.id === id);
    await checkoutTriageUnit(id, target?.trackingCode, target?.destinationSector);
    setTriageUnits(prev => prev.map(u => u.id === id ? { ...u, status: 'Baixado', checkoutDate: new Date().toISOString() } : u));
  };

  const handleLogout = async () => {
    try {
      await signOutSupabase();
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
      <header className="bg-slate-900/95 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40 shadow-lg w-full" id="main-header">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-2 lg:gap-3 xl:gap-4">
            
            {/* Logo and title (Clickable to access Dashboard) */}
            <button
              onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
              className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer group hover:opacity-90 transition-opacity shrink-0 py-1"
              title="Ir para o Dashboard"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl shadow-md shadow-sky-500/20 text-white flex items-center justify-center group-hover:scale-105 transition-all duration-200">
                <Boxes className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1 leading-none">
                  Stocck <span className="text-sky-400 font-bold group-hover:text-sky-300 transition-colors">RMA</span>
                </h1>
                <p className="text-[10px] text-slate-400 tracking-wider uppercase font-bold mt-0.5">Gestão e Triagem</p>
              </div>
            </button>

            {/* Desktop Navigation Tabs (Sleek Segmented Pill) */}
            <nav className="hidden xl:flex items-center gap-1 bg-slate-950/80 p-1 rounded-2xl border border-slate-800 shadow-inner" id="desktop-navigation">
              <button
                onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-dashboard"
              >
                <TrendingUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => { setActiveTab('rma'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'rma' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/10' : 'border border-transparent text-slate-400 hover:text-rose-300 hover:bg-slate-800/60'
                }`}
                id="nav-rma"
              >
                <FolderMinus className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'rma' ? 'text-rose-400' : 'text-slate-400'}`} />
                <span>Entrada de RMA</span>
              </button>

              <button
                onClick={() => { setActiveTab('catalog'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'catalog' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-catalog"
              >
                <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Catálogo de Base</span>
              </button>

              <button
                onClick={() => { setActiveTab('stock'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'stock' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-stock"
              >
                <Package className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Estoque Físico</span>
              </button>

              <button
                onClick={() => { setActiveTab('pending'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'pending' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-pending"
              >
                <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Pendências</span>
                {pendingItems.filter(p => p.status !== 'Resolvido').length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold ml-0.5">
                    {pendingItems.filter(p => p.status !== 'Resolvido').length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setActiveTab('movement'); setSelectedTriageUnit(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === 'movement' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                id="nav-movement"
              >
                <Boxes className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Fluxo de Entradas</span>
              </button>
            </nav>

            {/* Authenticated user profile, actions, and logout */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Supabase Database Status Monitor Button */}
              <button
                type="button"
                onClick={() => setIsDbSwitcherModalOpen(true)}
                className="h-9 flex items-center gap-2 px-2.5 sm:px-3 rounded-xl border bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-500/40 hover:border-emerald-500/70 transition-all cursor-pointer text-xs font-bold shadow-sm whitespace-nowrap"
                title="Banco de Dados: Supabase (PostgreSQL) - Clique para ver métricas e status"
                id="btn-open-db-switcher-header"
              >
                <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-400 animate-pulse" />
                <Database className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="hidden md:inline font-bold">
                  Supabase DB
                </span>
              </button>

              {/* Backup & Restore Action Button */}
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(true)}
                className="h-9 flex items-center gap-1.5 px-2.5 sm:px-3 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 hover:text-white rounded-xl border border-indigo-500/30 hover:border-indigo-500/50 transition-all cursor-pointer text-xs font-bold shadow-sm whitespace-nowrap"
                title="Backup & Restauração de Dados"
                id="btn-open-backup-header"
              >
                <HardDriveDownload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="hidden md:inline">Backup</span>
              </button>

              {/* Settings Button */}
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-9 flex items-center gap-1.5 px-2.5 sm:px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer text-xs font-bold shadow-sm group whitespace-nowrap"
                title="Configurações do Sistema"
                id="btn-open-settings"
              >
                <Settings className="w-3.5 h-3.5 text-sky-400 group-hover:rotate-45 transition-transform duration-300 shrink-0" />
                <span className="hidden md:inline">Configurações</span>
              </button>

              {/* PRD Download for QA & Testing */}
              <a
                href="./PRD_RMA_FLOW.md"
                download="PRD_RMA_FLOW.md"
                className="h-9 hidden lg:flex items-center gap-1.5 px-2.5 sm:px-3 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm whitespace-nowrap"
                title="Baixar o arquivo PRD completo (.MD) para testes"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>PRD</span>
              </a>

              {/* Secure logout */}
              <button 
                onClick={handleLogout}
                className="h-9 flex items-center gap-1.5 px-2.5 sm:px-3 bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 hover:border-rose-500/30 transition-all cursor-pointer text-xs font-bold shadow-sm whitespace-nowrap"
                title="Sair da conta atual"
                id="btn-logout"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Secondary Navigation Tabs (for screens under XL) */}
      <div className="xl:hidden bg-slate-900 border-b border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none py-2 px-3 sm:px-4 flex gap-1.5 shadow-inner items-center" id="mobile-navigation">
        <button
          onClick={() => setIsDbSwitcherModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          title="Status do Supabase DB"
          id="mobile-btn-db-switcher"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Supabase DB</span>
        </button>

        <button
          onClick={() => setIsBackupModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0 hover:text-white"
          title="Backup e Restauração"
          id="mobile-btn-backup"
        >
          <HardDriveDownload className="w-3.5 h-3.5 text-indigo-400" />
          <span>Backup</span>
        </button>

        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0 hover:text-white"
          title="Configurações"
          id="mobile-btn-settings"
        >
          <Settings className="w-3.5 h-3.5 text-sky-400" />
          <span>Configurações</span>
        </button>

        <a
          href="./PRD_RMA_FLOW.md"
          download="PRD_RMA_FLOW.md"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>PRD</span>
        </a>

        <div className="w-px h-5 bg-slate-800 mx-1 shrink-0" />

        <button
          onClick={() => { setActiveTab('dashboard'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => { setActiveTab('rma'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'rma' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <FolderMinus className={`w-3.5 h-3.5 ${activeTab === 'rma' ? 'text-rose-400' : 'text-slate-400'}`} />
          <span>Entrada RMA</span>
        </button>

        <button
          onClick={() => { setActiveTab('catalog'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'catalog' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-sky-400" />
          <span>Catálogo Base</span>
        </button>

        <button
          onClick={() => { setActiveTab('stock'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'stock' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-sky-400" />
          <span>Estoque Físico</span>
        </button>

        <button
          onClick={() => { setActiveTab('pending'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'pending' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Clock className={`w-3.5 h-3.5 ${activeTab === 'pending' ? 'text-sky-400' : 'text-slate-400'}`} />
          <span>Pendências</span>
          {pendingItems.filter(p => p.status !== 'Resolvido').length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold ml-0.5">
              {pendingItems.filter(p => p.status !== 'Resolvido').length}
            </span>
          )}
        </button>

        <button
          onClick={() => { setActiveTab('movement'); setSelectedTriageUnit(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'movement' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Boxes className="w-3.5 h-3.5 text-sky-400" />
          <span>Fluxo Entradas</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0 hover:bg-rose-500/20"
        >
          <LogOut className="w-3.5 h-3.5" />
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
            <h3 className="text-lg font-bold text-white">
              {syncError.toLowerCase().includes('quota') || syncError.toLowerCase().includes('resource')
                ? 'Limite de Cota do Banco de Dados Atingido'
                : 'Falha na Sincronização em Tempo Real'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {syncError.toLowerCase().includes('quota') || syncError.toLowerCase().includes('resource')
                ? 'A base de dados atingiu o limite de operações ou conexão. Alterne a conexão ou verifique o status do Supabase para restaurar o acesso.'
                : 'Ocorreu um erro de permissão ou conexão ao se comunicar com o banco de dados remoto.'}
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-mono text-rose-400 max-w-full overflow-x-auto w-full break-all">
              {syncError}
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full">
              <button
                onClick={() => setIsDbSwitcherModalOpen(true)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Zap className="w-4 h-4" />
                <span>Mudar para Banco Reserva</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Recarregar Página
              </button>
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
                pendingItemsCount={pendingItems.filter(p => p.status !== 'Resolvido').length}
                onViewUnit={handleViewUnitDetails}
                onNavigateToStock={() => setActiveTab('stock')}
                onNavigateToPending={() => setActiveTab('pending')}
              />
            )}

            {activeTab === 'catalog' && (
              <BaseCatalog 
                products={products}
                hasMoreFromDb={hasMoreProducts}
                isLoadingMore={isLoadingMoreProducts}
                onLoadMoreFromDb={handleLoadMoreProducts}
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

            {activeTab === 'pending' && (
              <PendingItems
                items={pendingItems}
                products={products}
                onSavePending={handleSavePendingItem}
                onDeletePending={handleDeletePendingItem}
                onUpdateStatus={handleUpdatePendingStatus}
                onTransferToStock={handleTransferPendingToStock}
                userRole={userRole}
                onNavigateToStock={() => setActiveTab('stock')}
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
          <span>Stocck RMA v2.0.0 (Web) • Sistema de Triagem Logística & Rastreabilidade</span>
          <div className="flex gap-4">
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <Info className="w-3.5 h-3.5" />
              Sincronizado com Supabase Cloud DB & Auth
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
        themeMode={themeMode}
        onSelectTheme={handleSelectTheme}
        onOpenBackupModal={(tab) => {
          setIsBackupModalOpen(true);
        }}
        onOpenDbSwitcherModal={() => {
          setIsDbSwitcherModalOpen(true);
        }}
        userRole={userRole}
        userEmail={user?.email || ''}
      />

      {/* Database Quick Switcher & Quota Management Modal */}
      <DatabaseSwitcherModal
        isOpen={isDbSwitcherModalOpen}
        onClose={() => setIsDbSwitcherModalOpen(false)}
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
          dailyInflows: dailyInflows.length,
          pendingItems: pendingItems.length
        }}
        onRestoreSuccess={(restoredPayload) => {
          if (restoredPayload?.data) {
            if (Array.isArray(restoredPayload.data.products) && restoredPayload.data.products.length > 0) {
              setProducts(restoredPayload.data.products);
            }
            if (Array.isArray(restoredPayload.data.triageUnits) && restoredPayload.data.triageUnits.length > 0) {
              setTriageUnits(restoredPayload.data.triageUnits);
            }
            if (Array.isArray(restoredPayload.data.dailyInflows) && restoredPayload.data.dailyInflows.length > 0) {
              setDailyInflows(restoredPayload.data.dailyInflows);
            }
          }
          loadInitialData();
          setActiveTab('dashboard');
        }}
      />
    </div>
  );
}
