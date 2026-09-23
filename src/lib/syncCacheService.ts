/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Intelligent Incremental Sync & Client-Side Cache Service
 * 
 * Slashes Supabase Egress by:
 * 1. Serving cached data instantly from local storage / memory (0ms latency, 0 bytes network).
 * 2. Querying only records with `updated_at > last_sync_timestamp` during syncs.
 * 3. Handling Realtime events via granular in-place memory mutations instead of re-downloading entire tables.
 */

import { BaseProduct, TriageUnit, DailyInflowRecord, PendingItem } from '../types';
import { 
  getSupabaseClient, 
  mapSupabaseToProduct, 
  mapSupabaseToTriageUnit, 
  mapSupabaseToDailyInflow, 
  mapSupabaseToPendingItem,
  getTriageColumns,
  getPendingColumns,
  setHasExcludeDailyCol,
  setHasPendingExtendedCols
} from './supabase';

interface SyncMetadata {
  lastSyncProducts: string | null;
  lastSyncTriageUnits: string | null;
  lastSyncDailyInflows: string | null;
  lastSyncPendingItems: string | null;
  totalEgressSavedBytes: number;
}

const CACHE_KEY_PRODUCTS = 'stocck_cache_products_v2';
const CACHE_KEY_TRIAGE_UNITS = 'stocck_cache_triage_units_v2';
const CACHE_KEY_DAILY_INFLOWS = 'stocck_cache_daily_inflows_v2';
const CACHE_KEY_PENDING_ITEMS = 'stocck_cache_pending_items_v2';
const CACHE_KEY_METADATA = 'stocck_sync_metadata_v2';

// In-Memory Fast Cache Store
let memoryProducts: BaseProduct[] | null = null;
let memoryTriageUnits: TriageUnit[] | null = null;
let memoryDailyInflows: DailyInflowRecord[] | null = null;
let memoryPendingItems: PendingItem[] | null = null;

let syncMeta: SyncMetadata = {
  lastSyncProducts: null,
  lastSyncTriageUnits: null,
  lastSyncDailyInflows: null,
  lastSyncPendingItems: null,
  totalEgressSavedBytes: 0
};

// Initialize metadata from localStorage
try {
  const rawMeta = localStorage.getItem(CACHE_KEY_METADATA);
  if (rawMeta) {
    syncMeta = { ...syncMeta, ...JSON.parse(rawMeta) };
  }
} catch (e) {
  console.warn('Could not read sync metadata:', e);
}

const saveMetadata = () => {
  try {
    localStorage.setItem(CACHE_KEY_METADATA, JSON.stringify(syncMeta));
  } catch (e) {
    console.warn('Could not persist sync metadata:', e);
  }
};

// ============================================================================
// CROSS-TAB INSTANT SYNCHRONIZATION BUS (BroadcastChannel)
// Provides 0ms instantaneous updates across different browser tabs/windows
// ============================================================================

export interface CrossTabSyncMessage {
  type: 'mutation' | 'sync_request';
  collection: 'products' | 'triage_units' | 'daily_inflows' | 'pending_items';
  action: 'update' | 'remove' | 'full';
  item?: any;
  id?: string;
  items?: any[];
  timestamp: number;
}

type CrossTabListener = (msg: CrossTabSyncMessage) => void;
const crossTabListeners = new Set<CrossTabListener>();

export const subscribeCrossTabSync = (listener: CrossTabListener) => {
  crossTabListeners.add(listener);
  return () => {
    crossTabListeners.delete(listener);
  };
};

const crossTabBus = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('stocckrma_cross_tab_sync_bus')
  : null;

export const broadcastCrossTabMutation = (
  collection: 'products' | 'triage_units' | 'daily_inflows' | 'pending_items',
  action: 'update' | 'remove' | 'full',
  payload?: { item?: any; id?: string; items?: any[] }
) => {
  if (crossTabBus) {
    try {
      crossTabBus.postMessage({
        type: 'mutation',
        collection,
        action,
        item: payload?.item,
        id: payload?.id,
        items: payload?.items,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('Failed broadcasting cross tab mutation:', e);
    }
  }
};

// Listen for instant mutations triggered in other open tabs
if (crossTabBus) {
  crossTabBus.onmessage = (event) => {
    const msg = event.data as CrossTabSyncMessage;
    if (!msg || !msg.collection) return;

    if (msg.action === 'update' && msg.item) {
      if (msg.collection === 'products') {
        const list = [...(memoryProducts || loadFromStorage<BaseProduct>(CACHE_KEY_PRODUCTS) || [])];
        const idx = list.findIndex(p => p.id === msg.item.id);
        if (idx >= 0) list[idx] = msg.item;
        else list.unshift(msg.item);
        memoryProducts = list;
        persistToStorage(CACHE_KEY_PRODUCTS, list);
      } else if (msg.collection === 'triage_units') {
        const list = [...(memoryTriageUnits || loadFromStorage<TriageUnit>(CACHE_KEY_TRIAGE_UNITS) || [])];
        const idx = list.findIndex(u => u.id === msg.item.id);
        if (idx >= 0) list[idx] = msg.item;
        else list.unshift(msg.item);
        memoryTriageUnits = list;
        persistToStorage(CACHE_KEY_TRIAGE_UNITS, list);
      } else if (msg.collection === 'daily_inflows') {
        const current = memoryDailyInflows || loadFromStorage<DailyInflowRecord>(CACHE_KEY_DAILY_INFLOWS) || [];
        const list = current.filter(d => d.id !== msg.item.id && d.date !== msg.item.date);
        list.push(msg.item);
        list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        memoryDailyInflows = list;
        persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
      } else if (msg.collection === 'pending_items') {
        const list = [...(memoryPendingItems || loadFromStorage<PendingItem>(CACHE_KEY_PENDING_ITEMS) || [])];
        const idx = list.findIndex(p => p.id === msg.item.id);
        if (idx >= 0) list[idx] = msg.item;
        else list.unshift(msg.item);
        memoryPendingItems = list;
        persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
      }
    } else if (msg.action === 'remove' && msg.id) {
      if (msg.collection === 'products') {
        const list = (memoryProducts || loadFromStorage<BaseProduct>(CACHE_KEY_PRODUCTS) || []).filter(p => p.id !== msg.id);
        memoryProducts = list;
        persistToStorage(CACHE_KEY_PRODUCTS, list);
      } else if (msg.collection === 'triage_units') {
        const list = (memoryTriageUnits || loadFromStorage<TriageUnit>(CACHE_KEY_TRIAGE_UNITS) || []).filter(u => u.id !== msg.id);
        memoryTriageUnits = list;
        persistToStorage(CACHE_KEY_TRIAGE_UNITS, list);
      } else if (msg.collection === 'daily_inflows') {
        const list = (memoryDailyInflows || loadFromStorage<DailyInflowRecord>(CACHE_KEY_DAILY_INFLOWS) || []).filter(d => d.id !== msg.id && d.date !== msg.id);
        memoryDailyInflows = list;
        persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
      } else if (msg.collection === 'pending_items') {
        const list = (memoryPendingItems || loadFromStorage<PendingItem>(CACHE_KEY_PENDING_ITEMS) || []).filter(p => p.id !== msg.id);
        memoryPendingItems = list;
        persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
      }
    }

    crossTabListeners.forEach(fn => {
      try { fn(msg); } catch (e) { console.warn('Cross-tab listener error:', e); }
    });
  };
}

// Safety buffer in ms to protect against clock drift and in-flight transactions (5 minutes)
const SYNC_SAFETY_BUFFER_MS = 5 * 60 * 1000; // 300 seconds buffer

/**
 * Load items from LocalStorage
 */
const loadFromStorage = <T>(key: string): T[] | null => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T[];
    }
  } catch (e) {
    console.warn(`Failed reading cache key ${key}:`, e);
  }
  return null;
};

/**
 * Persist items to LocalStorage safely
 */
const persistToStorage = <T>(key: string, data: T[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Storage quota exceeded or error writing ${key}:`, e);
  }
};

// Surgical Column Projections to reduce bandwidth & Egress (eliminating select * overload)
const PRODUCT_COLUMNS = 'id, name, sku, voltage, description, image_url, images, images_product, images_box, images_accessories, accessories, brand, category, created_at, updated_at';
const TRIAGE_COLUMNS = 'id, tracking_code, serial_number, order_number, base_product_id, base_product_name, base_product_sku, base_product_voltage, platform, customer_reason, device_status, package_status, accessories_inclusion, destination_sector, notes, photos_product, photos_box, photos_accessories, created_at, updated_at, status, checkout_date, source, is_migration, exclude_from_daily_count';
const INFLOW_COLUMNS = 'id, date, rma, estoque, openbox, es, total_dia, notes, source, created_at, updated_at';
const PENDING_COLUMNS = 'id, sku, product_name, voltage, serial_number, tracking_code, order_number, platform, pending_reason, detailed_notes, photos, destination_sector_suggested, status, priority, created_by, transferred_to_stock, transferred_unit_id, created_at, updated_at, resolved_at';

// ============================================================================
// 1. BASE PRODUCTS INCREMENTAL SYNC
// ============================================================================

export const getCachedBaseProducts = (): BaseProduct[] => {
  if (memoryProducts !== null) return memoryProducts;
  const stored = loadFromStorage<BaseProduct>(CACHE_KEY_PRODUCTS);
  if (stored) {
    memoryProducts = stored;
    return stored;
  }
  return [];
};

export const syncBaseProductsIncrementally = async (
  forceFull: boolean = false
): Promise<BaseProduct[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return getCachedBaseProducts();

  const currentCached = getCachedBaseProducts();
  const lastSync = syncMeta.lastSyncProducts;
  const queryStartTime = new Date().toISOString();

  // If no cache or forced full sync, perform initial bulk fetch
  if (forceFull || currentCached.length === 0 || !lastSync) {
    let { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Fallback: products select with columns failed, trying select(*):', error);
      const fallback = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Error fetching full products:', error);
      return currentCached;
    }

    if (data) {
      const mapped = data.map(mapSupabaseToProduct);
      memoryProducts = mapped;
      persistToStorage(CACHE_KEY_PRODUCTS, mapped);
      syncMeta.lastSyncProducts = queryStartTime;
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  // Incremental fetch with safety window against clock drift and in-flight updates
  try {
    const safeSyncTimestamp = lastSync 
      ? new Date(Math.max(0, new Date(lastSync).getTime() - SYNC_SAFETY_BUFFER_MS)).toISOString()
      : null;

    const [updatedRes, recentRes] = await Promise.all([
      safeSyncTimestamp
        ? supabase
            .from('products')
            .select(PRODUCT_COLUMNS)
            .or(`updated_at.gt.${safeSyncTimestamp},created_at.gt.${safeSyncTimestamp}`)
            .order('updated_at', { ascending: false })
            .limit(1000)
        : supabase
            .from('products')
            .select(PRODUCT_COLUMNS)
            .order('created_at', { ascending: false })
            .limit(100),
      supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(50)
    ]);

    let incomingData: any[] = [];
    if (updatedRes.data && Array.isArray(updatedRes.data)) {
      incomingData.push(...updatedRes.data);
    } else if (updatedRes.error) {
      // Fallback query if or clause not supported
      const fallbackUpdated = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .gt('updated_at', safeSyncTimestamp || lastSync)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (fallbackUpdated.data && Array.isArray(fallbackUpdated.data)) {
        incomingData.push(...fallbackUpdated.data);
      }
    }

    if (recentRes.data && Array.isArray(recentRes.data)) {
      incomingData.push(...recentRes.data);
    }

    const updatedMap = new Map<string, BaseProduct>();
    
    // 1. Always retain all existing cached products (never drop due to unpaginated checks)
    currentCached.forEach(p => {
      if (p && p.id) {
        updatedMap.set(p.id, p);
      }
    });

    // 2. Merge all new, recent, and updated products
    incomingData.forEach(r => {
      if (r && r.id) {
        const prod = mapSupabaseToProduct(r);
        updatedMap.set(prod.id, prod);
      }
    });

    const merged = Array.from(updatedMap.values()).sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });

    memoryProducts = merged;
    persistToStorage(CACHE_KEY_PRODUCTS, merged);
    syncMeta.lastSyncProducts = queryStartTime;
    saveMetadata();
    return merged;
  } catch (err) {
    console.warn('Incremental sync exception for products:', err);
    return currentCached;
  }
};

// ============================================================================
// 2. TRIAGE UNITS INCREMENTAL SYNC
// ============================================================================

export const getCachedTriageUnits = (): TriageUnit[] => {
  if (memoryTriageUnits !== null) return memoryTriageUnits;
  const stored = loadFromStorage<TriageUnit>(CACHE_KEY_TRIAGE_UNITS);
  if (stored) {
    memoryTriageUnits = stored;
    return stored;
  }
  return [];
};

export const syncTriageUnitsIncrementally = async (
  forceFull: boolean = false
): Promise<TriageUnit[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return getCachedTriageUnits();

  const currentCached = getCachedTriageUnits();
  const lastSync = syncMeta.lastSyncTriageUnits;
  const queryStartTime = new Date().toISOString();

  if (forceFull || currentCached.length === 0 || !lastSync) {
    let { data, error } = await supabase
      .from('triage_units')
      .select(getTriageColumns())
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message?.includes('exclude_from_daily_count') || error.code === '42703') {
        setHasExcludeDailyCol(false);
      }
      console.warn('Fallback: triage_units select with columns failed, trying safe columns / select(*):', error);
      const safeFallback = await supabase
        .from('triage_units')
        .select(getTriageColumns())
        .order('created_at', { ascending: false });
      if (!safeFallback.error && safeFallback.data) {
        data = safeFallback.data;
        error = null;
      } else {
        const starFallback = await supabase
          .from('triage_units')
          .select('*')
          .order('created_at', { ascending: false });
        data = starFallback.data;
        error = starFallback.error;
      }
    }

    if (error) {
      console.error('Error fetching full triage units:', error);
      return currentCached;
    }

    if (data) {
      const mapped = data.map(mapSupabaseToTriageUnit);
      memoryTriageUnits = mapped;
      persistToStorage(CACHE_KEY_TRIAGE_UNITS, mapped);
      syncMeta.lastSyncTriageUnits = queryStartTime;
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  // Incremental fetch with safety buffer against clock drift & concurrent updates
  try {
    const safeSyncTimestamp = lastSync
      ? new Date(Math.max(0, new Date(lastSync).getTime() - SYNC_SAFETY_BUFFER_MS)).toISOString()
      : null;

    const [updatedRes, recentRes] = await Promise.all([
      safeSyncTimestamp
        ? supabase
            .from('triage_units')
            .select(getTriageColumns())
            .or(`updated_at.gt.${safeSyncTimestamp},created_at.gt.${safeSyncTimestamp}`)
            .order('updated_at', { ascending: false })
            .limit(1000)
        : supabase
            .from('triage_units')
            .select(getTriageColumns())
            .order('created_at', { ascending: false })
            .limit(100),
      supabase
        .from('triage_units')
        .select(getTriageColumns())
        .order('created_at', { ascending: false })
        .limit(60)
    ]);

    let incomingData: any[] = [];

    if (updatedRes.data && Array.isArray(updatedRes.data)) {
      incomingData.push(...updatedRes.data);
    } else if (updatedRes.error) {
      if (updatedRes.error.message?.includes('exclude_from_daily_count') || updatedRes.error.code === '42703') {
        setHasExcludeDailyCol(false);
      }
      console.warn('Incremental triage sync fallback due to:', updatedRes.error.message);
      const safeFallback = await supabase
        .from('triage_units')
        .select(getTriageColumns())
        .gt('updated_at', safeSyncTimestamp || lastSync)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (safeFallback.data && Array.isArray(safeFallback.data)) {
        incomingData.push(...safeFallback.data);
      }
    }

    if (recentRes.data && Array.isArray(recentRes.data)) {
      incomingData.push(...recentRes.data);
    } else if (recentRes.error) {
      if (recentRes.error.message?.includes('exclude_from_daily_count') || recentRes.error.code === '42703') {
        setHasExcludeDailyCol(false);
      }
      const safeRecentFallback = await supabase
        .from('triage_units')
        .select(getTriageColumns())
        .order('created_at', { ascending: false })
        .limit(60);
      if (safeRecentFallback.data && Array.isArray(safeRecentFallback.data)) {
        incomingData.push(...safeRecentFallback.data);
      }
    }

    const unitMap = new Map<string, TriageUnit>();

    // 1. Always retain all existing cached triage units (never drop due to unpaginated server checks)
    currentCached.forEach(u => {
      if (u && u.id) {
        unitMap.set(u.id, u);
      }
    });

    // 2. Merge all new, recent, and updated triage units
    incomingData.forEach(r => {
      if (r && r.id) {
        const unit = mapSupabaseToTriageUnit(r);
        unitMap.set(unit.id, unit);
      }
    });

    const merged = Array.from(unitMap.values()).sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });

    memoryTriageUnits = merged;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, merged);
    syncMeta.lastSyncTriageUnits = queryStartTime;
    saveMetadata();
    return merged;
  } catch (err) {
    console.warn('Incremental sync exception for triage units:', err);
    return currentCached;
  }
};

// ============================================================================
// 3. DAILY INFLOWS INCREMENTAL SYNC
// ============================================================================

export const getCachedDailyInflows = (): DailyInflowRecord[] => {
  if (memoryDailyInflows !== null) return memoryDailyInflows;
  const stored = loadFromStorage<DailyInflowRecord>(CACHE_KEY_DAILY_INFLOWS);
  if (stored) {
    memoryDailyInflows = stored;
    return stored;
  }
  return [];
};

export const syncDailyInflowsIncrementally = async (
  forceFull: boolean = false
): Promise<DailyInflowRecord[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return getCachedDailyInflows();

  const currentCached = getCachedDailyInflows();
  const lastSync = syncMeta.lastSyncDailyInflows;
  const queryStartTime = new Date().toISOString();

  if (forceFull || currentCached.length === 0 || !lastSync) {
    let { data, error } = await supabase
      .from('daily_inflows')
      .select(INFLOW_COLUMNS)
      .order('date', { ascending: true });

    if (error) {
      console.warn('Initial daily inflows projection failed, trying select(*):', error);
      const fallback = await supabase
        .from('daily_inflows')
        .select('*')
        .order('date', { ascending: true });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Error fetching full daily inflows:', error);
      return currentCached;
    }

    if (data) {
      const mapped = data.map(mapSupabaseToDailyInflow);
      memoryDailyInflows = mapped;
      persistToStorage(CACHE_KEY_DAILY_INFLOWS, mapped);
      syncMeta.lastSyncDailyInflows = queryStartTime;
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  try {
    const safeSyncTimestamp = lastSync
      ? new Date(Math.max(0, new Date(lastSync).getTime() - SYNC_SAFETY_BUFFER_MS)).toISOString()
      : null;

    const [updatedRes, recentRes] = await Promise.all([
      safeSyncTimestamp
        ? supabase
            .from('daily_inflows')
            .select(INFLOW_COLUMNS)
            .or(`updated_at.gt.${safeSyncTimestamp},created_at.gt.${safeSyncTimestamp}`)
            .order('updated_at', { ascending: false })
            .limit(200)
        : supabase
            .from('daily_inflows')
            .select(INFLOW_COLUMNS)
            .order('date', { ascending: false })
            .limit(60),
      supabase
        .from('daily_inflows')
        .select(INFLOW_COLUMNS)
        .order('date', { ascending: false })
        .limit(30)
    ]);

    let incomingData: any[] = [];
    if (updatedRes.data && Array.isArray(updatedRes.data)) {
      incomingData.push(...updatedRes.data);
    } else if (updatedRes.error) {
      const fallback = await supabase
        .from('daily_inflows')
        .select(INFLOW_COLUMNS)
        .gt('updated_at', safeSyncTimestamp || lastSync)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (fallback.data && Array.isArray(fallback.data)) {
        incomingData.push(...fallback.data);
      }
    }

    if (recentRes.data && Array.isArray(recentRes.data)) {
      incomingData.push(...recentRes.data);
    }

    const inflowMap = new Map<string, DailyInflowRecord>();

    // 1. Always retain all cached daily inflows
    currentCached.forEach(d => {
      if (d && d.date) {
        inflowMap.set(d.date, d);
      }
    });

    // 2. Merge all incoming recent/updated inflows
    incomingData.forEach(r => {
      if (r && r.date) {
        const inflow = mapSupabaseToDailyInflow(r);
        inflowMap.set(inflow.date, inflow);
      }
    });

    const merged = Array.from(inflowMap.values()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    memoryDailyInflows = merged;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, merged);
    syncMeta.lastSyncDailyInflows = queryStartTime;
    saveMetadata();
    return merged;
  } catch (err) {
    console.warn('Incremental sync exception for daily inflows:', err);
    return currentCached;
  }
};

// ============================================================================
// 4. PENDING ITEMS INCREMENTAL SYNC
// ============================================================================

export const getCachedPendingItems = (): PendingItem[] => {
  if (memoryPendingItems !== null) return memoryPendingItems;
  const stored = loadFromStorage<PendingItem>(CACHE_KEY_PENDING_ITEMS);
  if (stored) {
    memoryPendingItems = stored;
    return stored;
  }
  return [];
};

export const syncPendingItemsIncrementally = async (
  forceFull: boolean = false
): Promise<PendingItem[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return getCachedPendingItems();

  const currentCached = getCachedPendingItems();
  const lastSync = syncMeta.lastSyncPendingItems;
  const queryStartTime = new Date().toISOString();

  if (forceFull || currentCached.length === 0 || !lastSync) {
    let { data, error } = await supabase
      .from('pending_items')
      .select(getPendingColumns())
      .order('created_at', { ascending: false });

    if (error) {
      setHasPendingExtendedCols(false);
      console.warn('Fallback: pending_items select with columns failed, trying safe columns / select(*):', error);
      const safeFallback = await supabase
        .from('pending_items')
        .select(getPendingColumns())
        .order('created_at', { ascending: false });
      if (!safeFallback.error && safeFallback.data) {
        data = safeFallback.data;
        error = null;
      } else {
        const starFallback = await supabase
          .from('pending_items')
          .select('*')
          .order('created_at', { ascending: false });
        data = starFallback.data;
        error = starFallback.error;
      }
    }

    if (error) {
      console.error('Error fetching full pending items:', error);
      return currentCached;
    }

    if (data) {
      const mapped = data.map(mapSupabaseToPendingItem);
      memoryPendingItems = mapped;
      persistToStorage(CACHE_KEY_PENDING_ITEMS, mapped);
      syncMeta.lastSyncPendingItems = queryStartTime;
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  try {
    const safeSyncTimestamp = lastSync
      ? new Date(Math.max(0, new Date(lastSync).getTime() - SYNC_SAFETY_BUFFER_MS)).toISOString()
      : null;

    const [updatedRes, recentRes] = await Promise.all([
      safeSyncTimestamp
        ? supabase
            .from('pending_items')
            .select(getPendingColumns())
            .or(`updated_at.gt.${safeSyncTimestamp},created_at.gt.${safeSyncTimestamp}`)
            .order('updated_at', { ascending: false })
            .limit(1000)
        : supabase
            .from('pending_items')
            .select(getPendingColumns())
            .order('created_at', { ascending: false })
            .limit(100),
      supabase
        .from('pending_items')
        .select(getPendingColumns())
        .order('created_at', { ascending: false })
        .limit(60)
    ]);

    let incomingData: any[] = [];
    if (updatedRes.data && Array.isArray(updatedRes.data)) {
      incomingData.push(...updatedRes.data);
    } else if (updatedRes.error) {
      setHasPendingExtendedCols(false);
      const safeFallback = await supabase
        .from('pending_items')
        .select(getPendingColumns())
        .gt('updated_at', safeSyncTimestamp || lastSync)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (safeFallback.data && Array.isArray(safeFallback.data)) {
        incomingData.push(...safeFallback.data);
      }
    }

    if (recentRes.data && Array.isArray(recentRes.data)) {
      incomingData.push(...recentRes.data);
    } else if (recentRes.error) {
      setHasPendingExtendedCols(false);
      const safeRecentFallback = await supabase
        .from('pending_items')
        .select(getPendingColumns())
        .order('created_at', { ascending: false })
        .limit(60);
      if (safeRecentFallback.data && Array.isArray(safeRecentFallback.data)) {
        incomingData.push(...safeRecentFallback.data);
      }
    }

    const itemMap = new Map<string, PendingItem>();

    // 1. Always retain all cached pending items (never drop due to unpaginated checks)
    currentCached.forEach(p => {
      if (p && p.id) {
        itemMap.set(p.id, p);
      }
    });

    // 2. Merge all new, recent, and updated pending items
    incomingData.forEach(r => {
      if (r && r.id) {
        const item = mapSupabaseToPendingItem(r);
        itemMap.set(item.id, item);
      }
    });

    const merged = Array.from(itemMap.values()).sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });

    memoryPendingItems = merged;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, merged);
    syncMeta.lastSyncPendingItems = queryStartTime;
    saveMetadata();
    return merged;
  } catch (err) {
    console.warn('Incremental sync exception for pending items:', err);
    return currentCached;
  }
};

// ============================================================================
// 5. GRANULAR REALTIME IN-PLACE MUTATION (Zero Network Re-fetches)
// ============================================================================

export const handleRealtimeProductEvent = (
  eventType: string,
  payload: any
): BaseProduct[] => {
  const current = getCachedBaseProducts();
  const list = [...current];

  if (eventType === 'DELETE') {
    const oldId = payload.old?.id;
    const filtered = list.filter(p => p.id !== oldId);
    memoryProducts = filtered;
    persistToStorage(CACHE_KEY_PRODUCTS, filtered);
    if (oldId) broadcastCrossTabMutation('products', 'remove', { id: oldId });
    return filtered;
  }

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const newProduct = mapSupabaseToProduct(payload.new);
    const existingIndex = list.findIndex(p => p.id === newProduct.id);
    if (existingIndex >= 0) {
      list[existingIndex] = newProduct;
    } else {
      list.unshift(newProduct);
    }
    list.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });
    memoryProducts = list;
    persistToStorage(CACHE_KEY_PRODUCTS, list);
    broadcastCrossTabMutation('products', 'update', { item: newProduct });
    return list;
  }

  return current;
};

export const handleRealtimeTriageUnitEvent = (
  eventType: string,
  payload: any
): TriageUnit[] => {
  const current = getCachedTriageUnits();
  const list = [...current];

  if (eventType === 'DELETE') {
    const oldId = payload.old?.id;
    const filtered = list.filter(u => u.id !== oldId);
    memoryTriageUnits = filtered;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, filtered);
    if (oldId) broadcastCrossTabMutation('triage_units', 'remove', { id: oldId });
    return filtered;
  }

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const newUnit = mapSupabaseToTriageUnit(payload.new);
    const existingIndex = list.findIndex(u => u.id === newUnit.id);
    if (existingIndex >= 0) {
      list[existingIndex] = newUnit;
    } else {
      list.unshift(newUnit);
    }
    list.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });
    memoryTriageUnits = list;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, list);
    broadcastCrossTabMutation('triage_units', 'update', { item: newUnit });
    return list;
  }

  return current;
};

export const handleRealtimeDailyInflowEvent = (
  eventType: string,
  payload: any
): DailyInflowRecord[] => {
  const current = getCachedDailyInflows();
  const list = [...current];

  if (eventType === 'DELETE') {
    const oldId = payload.old?.id;
    const filtered = list.filter(d => d.id !== oldId);
    memoryDailyInflows = filtered;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, filtered);
    if (oldId) broadcastCrossTabMutation('daily_inflows', 'remove', { id: oldId });
    return filtered;
  }

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const newInflow = mapSupabaseToDailyInflow(payload.new);
    const existingIndex = list.findIndex(d => d.id === newInflow.id || d.date === newInflow.date);
    if (existingIndex >= 0) {
      list[existingIndex] = newInflow;
    } else {
      list.push(newInflow);
    }
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    memoryDailyInflows = list;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
    broadcastCrossTabMutation('daily_inflows', 'update', { item: newInflow });
    return list;
  }

  return current;
};

export const handleRealtimePendingItemEvent = (
  eventType: string,
  payload: any
): PendingItem[] => {
  const current = getCachedPendingItems();
  const list = [...current];

  if (eventType === 'DELETE') {
    const oldId = payload.old?.id;
    const filtered = list.filter(p => p.id !== oldId);
    memoryPendingItems = filtered;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, filtered);
    if (oldId) broadcastCrossTabMutation('pending_items', 'remove', { id: oldId });
    return filtered;
  }

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const newItem = mapSupabaseToPendingItem(payload.new);
    const existingIndex = list.findIndex(p => p.id === newItem.id);
    if (existingIndex >= 0) {
      list[existingIndex] = newItem;
    } else {
      list.unshift(newItem);
    }
    list.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });
    memoryPendingItems = list;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
    broadcastCrossTabMutation('pending_items', 'update', { item: newItem });
    return list;
  }

  return current;
};

/**
 * Updates local memory cache directly after a successful local save operation
 */
export const updateLocalCacheItem = <T extends { id?: string }>(
  collectionName: 'products' | 'triage_units' | 'daily_inflows' | 'pending_items',
  item: T
) => {
  if (collectionName === 'products') {
    const list = [...getCachedBaseProducts()];
    const idx = list.findIndex(p => p.id === item.id);
    if (idx >= 0) list[idx] = item as any;
    else list.unshift(item as any);
    memoryProducts = list;
    persistToStorage(CACHE_KEY_PRODUCTS, list);
  } else if (collectionName === 'triage_units') {
    const list = [...getCachedTriageUnits()];
    const idx = list.findIndex(u => u.id === item.id);
    if (idx >= 0) list[idx] = item as any;
    else list.unshift(item as any);
    memoryTriageUnits = list;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, list);
  } else if (collectionName === 'daily_inflows') {
    const inflowItem = item as any;
    const list = getCachedDailyInflows().filter(d => d.id !== inflowItem.id && d.date !== inflowItem.date);
    list.push(inflowItem);
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    memoryDailyInflows = list;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
  } else if (collectionName === 'pending_items') {
    const list = [...getCachedPendingItems()];
    const idx = list.findIndex(p => p.id === item.id);
    if (idx >= 0) list[idx] = item as any;
    else list.unshift(item as any);
    memoryPendingItems = list;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
  }

  // Instantly broadcast to all other open tabs in the browser
  broadcastCrossTabMutation(collectionName, 'update', { item });
};

/**
 * Removes an item from local memory cache and persistent storage immediately on deletion
 */
export const removeLocalCacheItem = (
  collectionName: 'products' | 'triage_units' | 'daily_inflows' | 'pending_items',
  id: string
) => {
  const cleanId = (id || '').trim();
  if (!cleanId) return;

  if (collectionName === 'products') {
    const list = getCachedBaseProducts().filter(p => p.id !== cleanId);
    memoryProducts = list;
    persistToStorage(CACHE_KEY_PRODUCTS, list);
  } else if (collectionName === 'triage_units') {
    const list = getCachedTriageUnits().filter(u => u.id !== cleanId);
    memoryTriageUnits = list;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, list);
  } else if (collectionName === 'daily_inflows') {
    const datePart = cleanId.startsWith('inflow-') ? cleanId.replace('inflow-', '') : cleanId;
    const list = getCachedDailyInflows().filter(d => d.id !== cleanId && d.date !== cleanId && d.date !== datePart);
    memoryDailyInflows = list;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
  } else if (collectionName === 'pending_items') {
    const list = getCachedPendingItems().filter(p => p.id !== cleanId);
    memoryPendingItems = list;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
  }

  // Instantly broadcast removal to all other open tabs
  broadcastCrossTabMutation(collectionName, 'remove', { id: cleanId });
};

/**
 * Updates an entire collection in memory and persistent storage
 */
export const updateWholeCollectionCache = <T>(
  collectionName: 'products' | 'triage_units' | 'daily_inflows' | 'pending_items',
  items: T[]
) => {
  if (collectionName === 'products') {
    memoryProducts = items as any;
    persistToStorage(CACHE_KEY_PRODUCTS, items);
    syncMeta.lastSyncProducts = new Date().toISOString();
    saveMetadata();
  } else if (collectionName === 'triage_units') {
    memoryTriageUnits = items as any;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, items);
    syncMeta.lastSyncTriageUnits = new Date().toISOString();
    saveMetadata();
  } else if (collectionName === 'daily_inflows') {
    memoryDailyInflows = items as any;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, items);
    syncMeta.lastSyncDailyInflows = new Date().toISOString();
    saveMetadata();
  } else if (collectionName === 'pending_items') {
    memoryPendingItems = items as any;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, items);
    syncMeta.lastSyncPendingItems = new Date().toISOString();
    saveMetadata();
  }

  broadcastCrossTabMutation(collectionName, 'full', { items });
};

/**
 * Clears local cache to force a full re-sync if needed
 */
export const invalidateAllSyncCaches = () => {
  memoryProducts = null;
  memoryTriageUnits = null;
  memoryDailyInflows = null;
  memoryPendingItems = null;
  syncMeta = {
    lastSyncProducts: null,
    lastSyncTriageUnits: null,
    lastSyncDailyInflows: null,
    lastSyncPendingItems: null,
    totalEgressSavedBytes: 0
  };
  localStorage.removeItem(CACHE_KEY_PRODUCTS);
  localStorage.removeItem(CACHE_KEY_TRIAGE_UNITS);
  localStorage.removeItem(CACHE_KEY_DAILY_INFLOWS);
  localStorage.removeItem(CACHE_KEY_PENDING_ITEMS);
  localStorage.removeItem(CACHE_KEY_METADATA);
};
