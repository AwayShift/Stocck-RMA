/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

import { BaseProduct, TriageUnit, DailyInflowRecord, PendingItem, PendingStatusType, DestinationSectorType, PlatformType } from './types';
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
  revertCheckoutTriageUnit,
  saveDailyInflow,
  saveBatchDailyInflows,
  deleteDailyInflow,
  savePendingItem,
  deletePendingItem,
  updatePendingItemStatus,
  transferPendingItemToStock,
  purgeExistingAuditLogs,
  subscribeBaseProducts,
  subscribeTriageUnits,
  subscribeDailyInflows,
  subscribePendingItems
} from './lib/dbService';
import {
  getCachedBaseProducts,
  getCachedTriageUnits,
  getCachedDailyInflows,
  getCachedPendingItems,
  syncBaseProductsIncrementally,
  syncTriageUnitsIncrementally,
  syncDailyInflowsIncrementally,
  syncPendingItemsIncrementally,
  subscribeCrossTabSync,
  removeLocalCacheItem
} from './lib/syncCacheService';

import Dashboard from './components/Dashboard';
import BaseCatalog from './components/BaseCatalog';
import RmaEntry from './components/RmaEntry';
import PhysicalStock from './components/PhysicalStock';
import PendingItems, { getLinkedStockUnit } from './components/PendingItems';
import Login from './components/Login';
import ProductMovements from './components/ProductMovements';
import { GlobalSearchBar } from './components/GlobalSearchBar';
import SettingsModal from './components/SettingsModal';
import BackupModal from './components/BackupModal';
import DatabaseSwitcherModal from './components/DatabaseSwitcherModal';
import { checkAndRunScheduledBackups } from './lib/backupService';
import { getSupabaseClient } from './lib/supabase';
import { subscribeToSupabaseAuth, signOutSupabase } from './lib/supabaseAuth';
import { normalizeStiCode } from './utils/stiFormatter';
import { areOrdersMatching } from './utils/orderPlatformHelper';
import { ThemeMode, getSavedTheme, applyTheme } from './lib/theme';
import { initSystemIntegrationsSync } from './lib/integrationsConfigService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rma' | 'catalog' | 'stock' | 'pending' | 'movement'>('dashboard');
  
  // Theme state (Dark / Light)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getSavedTheme());
  const isLight = themeMode === 'light';

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
  const [openModalOnStockSelect, setOpenModalOnStockSelect] = useState<boolean>(true);
  const [pendingItemForRma, setPendingItemForRma] = useState<PendingItem | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isDbSwitcherModalOpen, setIsDbSwitcherModalOpen] = useState<boolean>(false);

  // Shared filters when navigating from Dashboard or Pending to Stock
  const [initialStockFilters, setInitialStockFilters] = useState<{
    platform?: PlatformType | null;
    sector?: DestinationSectorType | null;
    searchTerm?: string | null;
  } | null>(null);

  const handleNavigateToStockWithFilters = (platform?: PlatformType | null, sector?: DestinationSectorType | null, searchTerm?: string | null) => {
    setSelectedTriageUnit(null);
    setOpenModalOnStockSelect(false);
    setInitialStockFilters({
      platform: platform || null,
      sector: sector || null,
      searchTerm: searchTerm || null
    });
    setActiveTab('stock');
  };

  // System Settings: Spreadsheet Import & Export Visibility Toggles
  const [enableSpreadsheetImport, setEnableSpreadsheetImport] = useState<boolean>(() => {
    const saved = localStorage.getItem('rmaflow_enable_spreadsheet_import');
    return saved !== null ? saved === 'true' : true;
  });

  const [enableSpreadsheetExport, setEnableSpreadsheetExport] = useState<boolean>(() => {
    const saved = localStorage.getItem('rmaflow_enable_spreadsheet_export');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleSpreadsheetImport = (enabled: boolean) => {
    setEnableSpreadsheetImport(enabled);
    localStorage.setItem('rmaflow_enable_spreadsheet_import', String(enabled));
  };

  const handleToggleSpreadsheetExport = (enabled: boolean) => {
    setEnableSpreadsheetExport(enabled);
    localStorage.setItem('rmaflow_enable_spreadsheet_export', String(enabled));
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

  // Initial Data Fetching from Database with Cache-First strategy to eliminate Egress
  const loadInitialData = async () => {
    try {
      setSyncError(null);

      // Check if we already have local cache
      const cachedProds = getCachedBaseProducts();
      const cachedTriages = getCachedTriageUnits();
      const cachedPending = getCachedPendingItems();
      const cachedInflows = getCachedDailyInflows();

      const hasLocalData = cachedProds.length > 0 || cachedTriages.length > 0;

      if (hasLocalData) {
        // Instant load from cache: 0ms wait for operator, 0 egress used on initial render
        if (cachedProds.length > 0) setProducts(cachedProds);
        if (cachedTriages.length > 0) setTriageUnits(cachedTriages);
        if (cachedPending.length > 0) setPendingItems(cachedPending);
        if (cachedInflows.length > 0) setDailyInflows(cachedInflows);
        setIsLoading(false);

        // Fetch only modified records since last sync timestamp (negligible egress & zero cold-start load)
        refreshIncrementalData().catch((e) => {
          console.warn('Background incremental sync on startup note:', e);
        });
        return;
      }

      // If local cache is totally empty (first-time browser session), perform initial fetch
      const fetchPromise = Promise.all([
        getInitialBaseProducts(2500),
        getInitialTriageUnits(2500),
        getInitialPendingItems(1000),
        getInitialDailyInflows(1000)
      ]);

      const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => 
        setTimeout(() => resolve('TIMEOUT'), 4000)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]);

      if (result === 'TIMEOUT') {
        console.warn('Initial data fetch timed out after 4s, falling back to local cache & background sync.');
        const fbProds = getCachedBaseProducts();
        const fbTriages = getCachedTriageUnits();
        const fbPending = getCachedPendingItems();
        const fbInflows = getCachedDailyInflows();
        if (fbProds.length > 0) setProducts(fbProds);
        if (fbTriages.length > 0) setTriageUnits(fbTriages);
        if (fbPending.length > 0) setPendingItems(fbPending);
        if (fbInflows.length > 0) setDailyInflows(fbInflows);
        setIsLoading(false);

        // Continue background completion
        fetchPromise.then(([prodRes, triageRes, pendingList, inflowList]) => {
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
        }).catch((e) => {
          console.warn('Background data sync completion note:', e);
        });
        return;
      }

      const [prodRes, triageRes, pendingList, inflowList] = result;

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
    // Only load initial full data when user first logs in or user ID actually changes
    if (lastLoadedUserIdRef.current !== user.id) {
      lastLoadedUserIdRef.current = user.id;
      loadInitialData();
    }
  }, [user?.id]);

  // Throttled incremental delta sync across devices & tabs to protect Egress and Logs
  const lastDeltaSyncTimeRef = React.useRef<number>(0);

  const refreshIncrementalData = React.useCallback(async (force: boolean = false) => {
    if (!user) return;
    const now = Date.now();
    // Do not re-query delta if executed less than 30 seconds ago unless forced
    if (!force && (now - lastDeltaSyncTimeRef.current < 30000)) {
      return;
    }
    lastDeltaSyncTimeRef.current = now;

    try {
      const [prodList, triageList, inflowList, pendingList] = await Promise.all([
        syncBaseProductsIncrementally(),
        syncTriageUnitsIncrementally(),
        syncDailyInflowsIncrementally(),
        syncPendingItemsIncrementally()
      ]);
      if (Array.isArray(prodList) && prodList.length > 0) setProducts(prodList);
      if (Array.isArray(triageList) && triageList.length > 0) setTriageUnits(triageList);
      if (Array.isArray(inflowList) && inflowList.length > 0) setDailyInflows(inflowList);
      if (Array.isArray(pendingList)) setPendingItems(pendingList);
    } catch (e) {
      // Silent background delta sync
    }
  }, [user]);

  // 1. Live Realtime Subscriptions for Products, Triage Units, Daily Inflows, and Pending Items + Cross-Tab Bus
  useEffect(() => {
    if (!user) return;

    const unsubProducts = subscribeBaseProducts((updatedList) => {
      if (Array.isArray(updatedList)) setProducts(updatedList);
    });

    const unsubTriage = subscribeTriageUnits((updatedList) => {
      if (Array.isArray(updatedList)) setTriageUnits(updatedList);
    });

    const unsubInflows = subscribeDailyInflows((updatedList) => {
      if (Array.isArray(updatedList)) setDailyInflows(updatedList);
    });

    const unsubPending = subscribePendingItems((updatedList) => {
      if (Array.isArray(updatedList)) setPendingItems(updatedList);
    });

    // Zero-latency cross-tab synchronization bus (instant updates across multiple open tabs/windows)
    const unsubCrossTab = subscribeCrossTabSync((event) => {
      if (event.collection === 'products') {
        setProducts(getCachedBaseProducts());
      } else if (event.collection === 'triage_units') {
        setTriageUnits(getCachedTriageUnits());
      } else if (event.collection === 'daily_inflows') {
        setDailyInflows(getCachedDailyInflows());
      } else if (event.collection === 'pending_items') {
        if (event.action === 'remove' && event.id) {
          setPendingItems(prev => prev.filter(p => p.id !== event.id && p.registrationNumber !== event.id));
        } else if (event.action === 'update' && event.item) {
          setPendingItems(prev => {
            const idx = prev.findIndex(p => p.id === event.item.id || (p.registrationNumber && event.item.registrationNumber && p.registrationNumber === event.item.registrationNumber));
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = event.item;
              return next;
            }
            return [event.item, ...prev];
          });
        } else if (event.action === 'full' && Array.isArray(event.items)) {
          setPendingItems(event.items);
        } else {
          setPendingItems([...getCachedPendingItems()]);
        }
      }
    });

    // Cross-tab storage event listener fallback for browsers backgrounding BroadcastChannel
    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith('stocck_cache_') || e.key.startsWith('stocckrma_')) {
        if (e.key.includes('product')) setProducts(getCachedBaseProducts());
        if (e.key.includes('triage')) setTriageUnits(getCachedTriageUnits());
        if (e.key.includes('inflow')) setDailyInflows(getCachedDailyInflows());
        if (e.key.includes('pending')) setPendingItems([...getCachedPendingItems()]);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubProducts();
      unsubTriage();
      unsubInflows();
      unsubPending();
      unsubCrossTab();
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id]);

  // 2. Immediate sync on opening 'pending' tab, throttled delta sync on others
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'pending') {
      syncPendingItemsIncrementally(true).then((items) => {
        if (Array.isArray(items)) setPendingItems(items);
      }).catch(() => {});
    } else {
      const now = Date.now();
      if (now - lastDeltaSyncTimeRef.current >= 60000) {
        refreshIncrementalData();
      }
    }
  }, [activeTab, refreshIncrementalData, user]);

  // 3. Refresh incremental delta sync when browser tab gains focus or returns from background
  useEffect(() => {
    if (!user) return;

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        // When user refocuses the tab after working elsewhere, check for changes
        refreshIncrementalData(true);
        if (activeTab === 'pending') {
          syncPendingItemsIncrementally(true).then((items) => {
            if (Array.isArray(items)) setPendingItems(items);
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Periodic gentle fallback delta sync every 5 minutes (300s) — Realtime WebSockets handle instant changes
    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshIncrementalData();
      }
    }, 300000);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(syncInterval);
    };
  }, [refreshIncrementalData, user]);

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
    if (!user?.email) return;
    initSystemIntegrationsSync(user.email).catch((err) => {
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
    const target = pendingItems.find(p => p.id === cleanId || p.registrationNumber === cleanId);
    const idToDelete = target?.id || cleanId;
    const regToDelete = target?.registrationNumber;
    setPendingItems(prev => prev.filter(p => p.id !== cleanId && p.id !== idToDelete && (!regToDelete || p.registrationNumber !== regToDelete)));
    await deletePendingItem(idToDelete, target?.sku, target?.productName);
    if (regToDelete && regToDelete !== idToDelete) {
      removeLocalCacheItem('pending_items', regToDelete);
    }
  };

  const handleUpdatePendingStatus = async (id: string, status: PendingStatusType, resolutionReason?: string) => {
    await updatePendingItemStatus(id, status, resolutionReason);
    const now = new Date().toISOString();
    setPendingItems(prev => prev.map(p => p.id === id ? { 
      ...p, 
      status, 
      updatedAt: now,
      ...(status === 'Resolvido' ? { 
        resolvedAt: now,
        ...(resolutionReason !== undefined ? { resolutionReason } : {})
      } : {})
    } : p));
  };

  const handleTransferPendingToStock = async (
    item: PendingItem,
    destination: DestinationSectorType,
    details?: Parameters<typeof transferPendingItemToStock>[2]
  ) => {
    const createdUnit = await transferPendingItemToStock(item, destination, details);
    const now = new Date().toISOString();
    const resolutionReason = `Liberado e transferido para o estoque (${destination})`;
    setPendingItems(prev => prev.map(p => p.id === item.id ? { 
      ...p, 
      status: 'Resolvido', 
      transferredToStock: true, 
      transferredUnitId: createdUnit.id, 
      linkedUnitId: createdUnit.id,
      linkedUnitTrackingCode: createdUnit.trackingCode,
      resolutionReason,
      resolvedAt: now 
    } : p));
    setTriageUnits(prev => [createdUnit, ...prev]);
    return createdUnit;
  };

  // Daily Inflow actions
  const handleSaveDailyInflow = async (record: DailyInflowRecord) => {
    await saveDailyInflow(record);
    setDailyInflows(prev => {
      const index = prev.findIndex(r => r.id === record.id || r.date === record.date);
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
      const map = new Map<string, DailyInflowRecord>(prev.map(r => [r.date, r]));
      records.forEach(r => map.set(r.date, r));
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    });
    return result;
  };

  const handleDeleteDailyInflow = async (id: string) => {
    const cleanId = (id || '').trim();
    if (!cleanId) return;
    await deleteDailyInflow(cleanId);
    setDailyInflows(prev => prev.filter(r => r.id !== cleanId && r.date !== cleanId));
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
    let unitWithUser = unit;
    if (!unitWithUser.createdBy && user) {
      unitWithUser = {
        ...unitWithUser,
        createdBy: {
          uid: user.id,
          email: user.email || '',
          name: userName || user.displayName || ''
        }
      };
    }
    const saved = await saveTriageUnit(unitWithUser);
    setTriageUnits(prev => {
      const index = prev.findIndex(u => u.id === saved.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = saved;
        return next;
      }
      return [saved, ...prev];
    });

    setPendingItems(prev => prev.map(p => {
      const isMatch = (saved.pendingItemId && p.id === saved.pendingItemId) ||
        (saved.pendingRegistrationNumber && p.registrationNumber && p.registrationNumber.toUpperCase() === saved.pendingRegistrationNumber.toUpperCase());
      if (isMatch) {
        return {
          ...p,
          status: p.status === 'Resolvido' ? 'Pendente' : (p.status || 'Pendente'),
          transferredToStock: false,
          transferredUnitId: saved.id,
          linkedUnitId: saved.id,
          linkedUnitTrackingCode: saved.trackingCode || ''
        };
      }
      if (p.linkedUnitId === saved.id || p.transferredUnitId === saved.id) {
        return {
          ...p,
          transferredToStock: false,
          transferredUnitId: undefined,
          linkedUnitId: undefined,
          linkedUnitTrackingCode: undefined
        };
      }
      return p;
    }));
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
    const updated = await checkoutTriageUnit(id, target?.trackingCode, target?.destinationSector);
    setTriageUnits(prev => prev.map(u => u.id === id ? (updated || { ...u, status: 'Baixado', checkoutDate: new Date().toISOString() }) : u));
  };

  const handleRevertCheckoutTriage = async (id: string) => {
    const target = triageUnits.find(u => u.id === id);
    const updated = await revertCheckoutTriageUnit(id, target?.trackingCode);
    setTriageUnits(prev => prev.map(u => u.id === id ? (updated || { ...u, status: 'Estoque', checkoutDate: undefined }) : u));
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

  // Tab navigation that always clears sticky filters and modals so returning to stock tab defaults to clean slate
  const handleSwitchTab = (tab: 'dashboard' | 'rma' | 'catalog' | 'stock' | 'pending' | 'movement') => {
    setSelectedTriageUnit(null);
    setOpenModalOnStockSelect(false);
    setInitialStockFilters(null);
    setActiveTab(tab);
  };

  const handleClearSelectedUnit = useCallback(() => {
    setSelectedTriageUnit(null);
    setOpenModalOnStockSelect(false);
  }, []);

  // View unit modal from Dashboard without navigating to stock
  const handleViewUnitDetails = (unit: TriageUnit) => {
    setSelectedTriageUnit({ ...unit });
    setOpenModalOnStockSelect(true);
    // Keep activeTab as 'dashboard'! Do not switch tab!
  };

  // Global search navigation handlers: clicking product opens modal ONLY, without navigating to stock
  const handleSelectUnitFromGlobal = (unit: TriageUnit) => {
    setSelectedTriageUnit({ ...unit });
    setOpenModalOnStockSelect(true);
    // Keep activeTab as is! Do not switch tab!
  };

  // Global search navigation handlers: clicking "Ir ao estoque" goes directly to stock with product selected, WITHOUT opening modal
  const handleGoToStockUnitFromGlobal = (unit: TriageUnit) => {
    setSelectedTriageUnit({ ...unit });
    setOpenModalOnStockSelect(false);
    setInitialStockFilters(null);
    setActiveTab('stock');
  };

  // When inside the modal, clicking "Ir ao estoque" closes modal and navigates to stock highlighting the product
  const handleGoToStockDirectlyFromModal = (unit: TriageUnit) => {
    setSelectedTriageUnit({ ...unit });
    setOpenModalOnStockSelect(false);
    setInitialStockFilters(null);
    setActiveTab('stock');
  };

  const handleSelectPendingFromGlobal = (item: PendingItem) => {
    const linked = getLinkedStockUnit(item, triageUnits);
    if (linked) {
      setSelectedTriageUnit({ ...linked });
      setInitialStockFilters(null);
      setActiveTab('stock');
      return;
    }
    setSelectedTriageUnit(null);
    setInitialStockFilters(null);
    setActiveTab('pending');
  };

  const handleSelectProductFromGlobal = (_product: BaseProduct) => {
    setSelectedTriageUnit(null);
    setInitialStockFilters(null);
    setActiveTab('catalog');
  };

  const handleSearchSubmitToStock = (searchTerm: string) => {
    setSelectedTriageUnit(null);
    setInitialStockFilters({
      platform: null,
      sector: null,
      searchTerm
    });
    setActiveTab('stock');
  };

  // Active pending items that require priority attention (excludes 'Resolvido' and 'Baixa' priority)
  const activePendingItemsCount = useMemo(() => {
    return pendingItems.filter(p => {
      if (p.status === 'Resolvido') return false;
      const prio = (p.priority || '').trim().toLowerCase();
      return prio !== 'baixa';
    }).length;
  }, [pendingItems]);

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
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-lg w-full" id="main-header">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-2 sm:gap-3">
            
            {/* Left Header Group: Logo, Search Bar, and Desktop Navigation Tabs (Tight, balanced spacing) */}
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-3.5 min-w-0">
              {/* Logo and title (Clickable to access Dashboard) */}
              <button
                onClick={() => handleSwitchTab('dashboard')}
                className="flex items-center gap-2 text-left focus:outline-none cursor-pointer group hover:opacity-90 transition-opacity shrink-0 py-1"
                title="Ir para o Dashboard"
              >
                <div className="w-8.5 h-8.5 bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl shadow-md shadow-sky-500/20 text-white flex items-center justify-center group-hover:scale-105 transition-all duration-200">
                  <Boxes className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-1 leading-none">
                    Stocck <span className="text-sky-400 font-bold group-hover:text-sky-300 transition-colors">RMA</span>
                  </h1>
                  <p className="text-[9px] text-slate-400 tracking-wider uppercase font-bold mt-0.5">Gestão e Triagem</p>
                </div>
              </button>

              {/* Global Search Bar (Instant lookup of Orders, STI, Serial, SKU, Pendencies across all tabs) */}
              <GlobalSearchBar
                units={triageUnits}
                pendingItems={pendingItems}
                products={products}
                onSelectUnit={handleSelectUnitFromGlobal}
                onGoToStockUnit={handleGoToStockUnitFromGlobal}
                onSelectPendingItem={handleSelectPendingFromGlobal}
                onSelectProduct={handleSelectProductFromGlobal}
                onSearchSubmitToStock={handleSearchSubmitToStock}
                isLight={isLight}
              />

              {/* Desktop Navigation Tabs (Sleek Segmented Pill) */}
              <nav className="hidden xl:flex items-center gap-0.5 sm:gap-1 bg-slate-950/80 p-0.5 sm:p-1 rounded-2xl border border-slate-800 shadow-inner relative z-10" id="desktop-navigation">
                <button
                  onClick={() => handleSwitchTab('dashboard')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  id="nav-dashboard"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => handleSwitchTab('rma')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === 'rma' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/10' : 'border border-transparent text-slate-400 hover:text-rose-300 hover:bg-slate-800/60'
                  }`}
                  id="nav-rma"
                >
                  <FolderMinus className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'rma' ? 'text-rose-400' : 'text-slate-400'}`} />
                  <span>Entrada de RMA</span>
                </button>

                <button
                  onClick={() => handleSwitchTab('catalog')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === 'catalog' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  id="nav-catalog"
                >
                  <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Catálogo de Base</span>
                </button>

                <button
                  onClick={() => handleSwitchTab('stock')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === 'stock' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  id="nav-stock"
                >
                  <Package className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Estoque Físico</span>
                </button>

                <button
                  onClick={() => handleSwitchTab('pending')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === 'pending' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  id="nav-pending"
                >
                  <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Pendências</span>
                  {activePendingItemsCount > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold ml-0.5">
                      {activePendingItemsCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleSwitchTab('movement')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === 'movement' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/10' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  id="nav-movement"
                >
                  <Boxes className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Fluxo de Entradas</span>
                </button>
              </nav>
            </div>

            {/* Unified Settings & System Control */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-9 flex items-center gap-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl border border-slate-700 hover:border-slate-600 transition-all cursor-pointer text-xs font-bold shadow-sm group whitespace-nowrap"
                title="Configurações do Sistema (Banco de Dados, Backup, Documentação, Sessão)"
                id="btn-open-settings"
              >
                <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-400 animate-pulse" title="Supabase DB Conectado" />
                <Settings className="w-3.5 h-3.5 text-sky-400 group-hover:rotate-45 transition-transform duration-300 shrink-0" />
                <span className="hidden sm:inline">Configurações</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Secondary Navigation Tabs (for screens under XL) */}
      <div className="xl:hidden bg-slate-900 border-b border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none py-2 px-3 sm:px-4 flex gap-1.5 shadow-inner items-center" id="mobile-navigation">
        <button
          onClick={() => handleSwitchTab('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => handleSwitchTab('rma')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'rma' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <FolderMinus className={`w-3.5 h-3.5 ${activeTab === 'rma' ? 'text-rose-400' : 'text-slate-400'}`} />
          <span>Entrada RMA</span>
        </button>

        <button
          onClick={() => handleSwitchTab('catalog')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'catalog' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-sky-400" />
          <span>Catálogo Base</span>
        </button>

        <button
          onClick={() => handleSwitchTab('stock')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'stock' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-sky-400" />
          <span>Estoque Físico</span>
        </button>

        <button
          onClick={() => handleSwitchTab('pending')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'pending' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Clock className={`w-3.5 h-3.5 ${activeTab === 'pending' ? 'text-sky-400' : 'text-slate-400'}`} />
          <span>Pendências</span>
          {activePendingItemsCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold ml-0.5">
              {activePendingItemsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleSwitchTab('movement')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            activeTab === 'movement' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm' : 'border border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Boxes className="w-3.5 h-3.5 text-sky-400" />
          <span>Fluxo Entradas</span>
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
                dailyInflows={dailyInflows}
                onSaveDailyInflow={handleSaveDailyInflow}
                onDeleteDailyInflow={handleDeleteDailyInflow}
                pendingItemsCount={activePendingItemsCount}
                onViewUnit={handleViewUnitDetails}
                onGoToStockUnit={handleGoToStockUnitFromGlobal}
                onUpdateUnit={handleSaveTriage}
                onNavigateToStock={handleNavigateToStockWithFilters}
                onNavigateToPending={() => setActiveTab('pending')}
                currentUser={user ? { uid: user.id, email: user.email || '', name: userName || user.displayName || '' } : null}
                userName={userName}
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
                enableSpreadsheetExport={enableSpreadsheetExport}
              />
            )}

            {activeTab === 'rma' && (
              <RmaEntry 
                products={products}
                units={triageUnits}
                pendingItems={pendingItems}
                initialPendingItem={pendingItemForRma}
                onClearInitialPendingItem={() => setPendingItemForRma(null)}
                onSaveTriage={handleSaveTriage}
                onNavigateToStock={() => handleSwitchTab('stock')}
                isLight={isLight}
                currentUser={user ? { uid: user.id, email: user.email || '', name: userName || user.displayName || '' } : null}
              />
            )}

            <div style={{ display: activeTab === 'stock' ? 'block' : 'none' }}>
              <PhysicalStock 
                currentTab={activeTab}
                units={triageUnits}
                products={products}
                pendingItems={pendingItems}
                onUpdateUnit={handleSaveTriage}
                onDeleteUnit={handleDeleteTriage}
                onCheckoutUnit={handleCheckoutTriage}
                onRevertCheckoutUnit={handleRevertCheckoutTriage}
                initialSelectedUnit={selectedTriageUnit}
                openModalOnInitialSelect={openModalOnStockSelect}
                onClearSelectedUnit={handleClearSelectedUnit}
                onGoToStockDirectly={handleGoToStockDirectlyFromModal}
                onSaveTriage={handleSaveTriage}
                enableSpreadsheetImport={enableSpreadsheetImport}
                enableSpreadsheetExport={enableSpreadsheetExport}
                isLight={isLight}
                initialPlatformFilter={initialStockFilters?.platform}
                initialSectorFilter={initialStockFilters?.sector}
                initialSearchTerm={initialStockFilters?.searchTerm}
                onClearInitialFilters={() => setInitialStockFilters(null)}
              />
            </div>

            {activeTab === 'pending' && (
              <PendingItems
                items={pendingItems}
                products={products}
                units={triageUnits}
                onSavePending={handleSavePendingItem}
                onDeletePending={handleDeletePendingItem}
                onUpdateStatus={handleUpdatePendingStatus}
                onTransferToStock={handleTransferPendingToStock}
                onSaveTriage={handleSaveTriage}
                onNavigateToRmaWithPending={(item) => {
                  setPendingItemForRma(item);
                  setActiveTab('rma');
                }}
                userRole={userRole}
                onRefreshPending={async () => {
                  const list = await syncPendingItemsIncrementally(true);
                  if (Array.isArray(list)) setPendingItems(list);
                }}
                onNavigateToStock={(target?: string | PendingItem | TriageUnit) => {
                  let rawTarget = typeof target === 'string' ? target.trim() : '';
                  let foundUnit: TriageUnit | undefined = undefined;

                  if (target && typeof target === 'object') {
                    if ('baseProductSku' in target) {
                      foundUnit = target as TriageUnit;
                    } else if ('productName' in target) {
                      foundUnit = getLinkedStockUnit(target as PendingItem, triageUnits);
                      rawTarget = (target as PendingItem).orderNumber || (target as PendingItem).registrationNumber || (target as PendingItem).trackingCode || '';
                    }
                  }

                  if (!foundUnit && rawTarget) {
                    const raw = rawTarget.trim();
                    const clean = raw.toLowerCase();
                    const cleanSti = normalizeStiCode(raw).toLowerCase();
                    const cleanOrder = raw.replace(/^[#]/, '').toLowerCase();

                    // 1. Direct unit ID match
                    foundUnit = triageUnits.find(u => u.id === raw);

                    // 2. Pending items match -> get linked stock unit
                    if (!foundUnit) {
                      const matchedPending = pendingItems.find(p => 
                        p.id === raw || 
                        (p.registrationNumber && p.registrationNumber.trim().toLowerCase() === clean) ||
                        (p.orderNumber && areOrdersMatching(p.orderNumber, raw))
                      );
                      if (matchedPending) {
                        foundUnit = getLinkedStockUnit(matchedPending, triageUnits);
                      }
                    }

                    // 3. Resilient Order Number match
                    if (!foundUnit) {
                      foundUnit = triageUnits.find(u => 
                        areOrdersMatching(u.orderNumber, raw) ||
                        (u.orderNumber && (
                          u.orderNumber.trim().toLowerCase() === clean ||
                          u.orderNumber.trim().toLowerCase() === cleanOrder ||
                          u.orderNumber.trim().toLowerCase().replace(/^[#]/, '') === cleanOrder
                        ))
                      );
                    }

                    // 4. Tracking Code / STI match
                    if (!foundUnit) {
                      foundUnit = triageUnits.find(u => 
                        u.trackingCode && (
                          u.trackingCode.toLowerCase() === clean ||
                          normalizeStiCode(u.trackingCode).toLowerCase() === cleanSti
                        )
                      );
                    }

                    // 5. Pending Registration Number, Pending Item ID, or Serial Number match
                    if (!foundUnit) {
                      foundUnit = triageUnits.find(u => 
                        (u.pendingRegistrationNumber && (
                          u.pendingRegistrationNumber.toLowerCase() === clean ||
                          u.pendingRegistrationNumber.replace(/^[#]/, '').toLowerCase() === cleanOrder
                        )) ||
                        (u.pendingItemId && u.pendingItemId === raw) ||
                        (u.serialNumber && u.serialNumber.trim().toLowerCase() === clean)
                      );
                    }
                  }

                  if (foundUnit) {
                    setSelectedTriageUnit({ ...foundUnit });
                    setOpenModalOnStockSelect(false);
                    setInitialStockFilters(null);
                    setActiveTab('stock');
                  } else if (rawTarget) {
                    setSelectedTriageUnit(null);
                    setOpenModalOnStockSelect(false);
                    setInitialStockFilters({
                      platform: null,
                      sector: null,
                      searchTerm: rawTarget.replace(/^[#]/, '').trim()
                    });
                    setActiveTab('stock');
                  } else {
                    handleSwitchTab('stock');
                  }
                }}
                enableSpreadsheetExport={enableSpreadsheetExport}
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
                onNavigateToStockUnit={(unit) => {
                  setSelectedTriageUnit({ ...unit });
                  setOpenModalOnStockSelect(false);
                  setInitialStockFilters(null);
                  setActiveTab('stock');
                }}
                userRole={userRole}
                enableSpreadsheetImport={enableSpreadsheetImport}
                enableSpreadsheetExport={enableSpreadsheetExport}
                isLight={isLight}
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
        enableSpreadsheetExport={enableSpreadsheetExport}
        onToggleSpreadsheetExport={handleToggleSpreadsheetExport}
        themeMode={themeMode}
        onSelectTheme={handleSelectTheme}
        onOpenBackupModal={(tab) => {
          setIsBackupModalOpen(true);
        }}
        onOpenDbSwitcherModal={() => {
          setIsDbSwitcherModalOpen(true);
        }}
        onLogout={handleLogout}
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
        isLight={isLight}
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
