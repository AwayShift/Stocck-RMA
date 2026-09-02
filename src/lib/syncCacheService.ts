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
      syncMeta.lastSyncProducts = new Date().toISOString();
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  // Incremental fetch: records updated after last sync + lightweight ID reconciliation for deletions
  try {
    const [updatedRes, idsRes] = await Promise.all([
      supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true }),
      supabase
        .from('products')
        .select('id')
    ]);

    if (updatedRes.error) {
      console.warn('Incremental product sync error, trying select(*):', updatedRes.error);
      const fallbackUpdated = await supabase
        .from('products')
        .select('*')
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true });
      if (!fallbackUpdated.error && fallbackUpdated.data) {
        updatedRes.data = fallbackUpdated.data;
        updatedRes.error = null;
      } else {
        return currentCached;
      }
    }

    let validIdSet: Set<string> | null = null;
    if (!idsRes.error && Array.isArray(idsRes.data)) {
      if (idsRes.data.length > 0 || currentCached.length <= 2) {
        validIdSet = new Set(idsRes.data.map(r => r.id));
      }
    }

    const updatedMap = new Map<string, BaseProduct>();
    
    // 1. Keep only items that still exist on server
    currentCached.forEach(p => {
      if (!validIdSet || validIdSet.has(p.id)) {
        updatedMap.set(p.id, p);
      }
    });

    // 2. Apply deltas
    if (updatedRes.data && updatedRes.data.length > 0) {
      updatedRes.data.forEach(r => {
        const prod = mapSupabaseToProduct(r);
        if (!validIdSet || validIdSet.has(prod.id)) {
          updatedMap.set(prod.id, prod);
        }
      });
    }

    const merged = Array.from(updatedMap.values()).sort(
      (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
    );

    memoryProducts = merged;
    persistToStorage(CACHE_KEY_PRODUCTS, merged);
    syncMeta.lastSyncProducts = new Date().toISOString();
    saveMetadata();
    return merged;
  } catch (err) {
    console.warn('Incremental sync exception:', err);
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
      syncMeta.lastSyncTriageUnits = new Date().toISOString();
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  // Incremental fetch: only changed triage units + deletion reconciliation
  try {
    const [updatedRes, idsRes] = await Promise.all([
      supabase
        .from('triage_units')
        .select(getTriageColumns())
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true }),
      supabase
        .from('triage_units')
        .select('id')
    ]);

    if (updatedRes.error) {
      if (updatedRes.error.message?.includes('exclude_from_daily_count') || updatedRes.error.code === '42703') {
        setHasExcludeDailyCol(false);
      }
      console.warn('Incremental triage sync error, trying safe columns / select(*):', updatedRes.error);
      const safeFallback = await supabase
        .from('triage_units')
        .select(getTriageColumns())
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true });
      if (!safeFallback.error && safeFallback.data) {
        updatedRes.data = safeFallback.data;
        updatedRes.error = null;
      } else {
        const starFallback = await supabase
          .from('triage_units')
          .select('*')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true });
        if (!starFallback.error && starFallback.data) {
          updatedRes.data = starFallback.data;
          updatedRes.error = null;
        } else {
          return currentCached;
        }
      }
    }

    let validIdSet: Set<string> | null = null;
    if (!idsRes.error && Array.isArray(idsRes.data)) {
      if (idsRes.data.length > 0 || currentCached.length <= 2) {
        validIdSet = new Set(idsRes.data.map(r => r.id));
      }
    }

    const unitMap = new Map<string, TriageUnit>();
    currentCached.forEach(u => {
      if (!validIdSet || validIdSet.has(u.id)) {
        unitMap.set(u.id, u);
      }
    });

    if (updatedRes.data && updatedRes.data.length > 0) {
      updatedRes.data.forEach(r => {
        const unit = mapSupabaseToTriageUnit(r);
        if (!validIdSet || validIdSet.has(unit.id)) {
          unitMap.set(unit.id, unit);
        }
      });
    }

    const merged = Array.from(unitMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    memoryTriageUnits = merged;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, merged);
    syncMeta.lastSyncTriageUnits = new Date().toISOString();
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

  if (forceFull || currentCached.length === 0 || !lastSync) {
    const { data, error } = await supabase
      .from('daily_inflows')
      .select(INFLOW_COLUMNS)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching full daily inflows:', error);
      return currentCached;
    }

    if (data) {
      const mapped = data.map(mapSupabaseToDailyInflow);
      memoryDailyInflows = mapped;
      persistToStorage(CACHE_KEY_DAILY_INFLOWS, mapped);
      syncMeta.lastSyncDailyInflows = new Date().toISOString();
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  try {
    const [updatedRes, idsRes] = await Promise.all([
      supabase
        .from('daily_inflows')
        .select(INFLOW_COLUMNS)
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true }),
      supabase
        .from('daily_inflows')
        .select('id, date')
    ]);

    if (updatedRes.error) {
      return currentCached;
    }

    let validIdSet: Set<string> | null = null;
    if (!idsRes.error && idsRes.data) {
      validIdSet = new Set(idsRes.data.map(r => r.id || r.date));
    }

    const inflowMap = new Map<string, DailyInflowRecord>();
    currentCached.forEach(d => {
      const key = d.id || d.date;
      if (!validIdSet || validIdSet.has(key)) {
        inflowMap.set(key, d);
      }
    });

    if (updatedRes.data && updatedRes.data.length > 0) {
      updatedRes.data.forEach(r => {
        const inflow = mapSupabaseToDailyInflow(r);
        const key = inflow.id || inflow.date;
        if (!validIdSet || validIdSet.has(key)) {
          inflowMap.set(key, inflow);
        }
      });
    }

    const merged = Array.from(inflowMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    memoryDailyInflows = merged;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, merged);
    syncMeta.lastSyncDailyInflows = new Date().toISOString();
    saveMetadata();
    return merged;
  } catch (err) {
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
      syncMeta.lastSyncPendingItems = new Date().toISOString();
      saveMetadata();
      return mapped;
    }
    return currentCached;
  }

  try {
    const [updatedRes, idsRes] = await Promise.all([
      supabase
        .from('pending_items')
        .select(getPendingColumns())
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true }),
      supabase
        .from('pending_items')
        .select('id')
    ]);

    if (updatedRes.error) {
      setHasPendingExtendedCols(false);
      const safeFallback = await supabase
        .from('pending_items')
        .select(getPendingColumns())
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true });
      if (!safeFallback.error && safeFallback.data) {
        updatedRes.data = safeFallback.data;
        updatedRes.error = null;
      } else {
        const starFallback = await supabase
          .from('pending_items')
          .select('*')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true });
        if (!starFallback.error && starFallback.data) {
          updatedRes.data = starFallback.data;
          updatedRes.error = null;
        } else {
          return currentCached;
        }
      }
    }

    let validIdSet: Set<string> | null = null;
    if (!idsRes.error && idsRes.data) {
      validIdSet = new Set(idsRes.data.map(r => r.id));
    }

    const itemMap = new Map<string, PendingItem>();
    currentCached.forEach(p => {
      if (!validIdSet || validIdSet.has(p.id)) {
        itemMap.set(p.id, p);
      }
    });

    if (updatedRes.data && updatedRes.data.length > 0) {
      updatedRes.data.forEach(r => {
        const item = mapSupabaseToPendingItem(r);
        if (!validIdSet || validIdSet.has(item.id)) {
          itemMap.set(item.id, item);
        }
      });
    }

    const merged = Array.from(itemMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    memoryPendingItems = merged;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, merged);
    syncMeta.lastSyncPendingItems = new Date().toISOString();
    saveMetadata();
    return merged;
  } catch (err) {
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
    memoryProducts = list;
    persistToStorage(CACHE_KEY_PRODUCTS, list);
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
    memoryTriageUnits = list;
    persistToStorage(CACHE_KEY_TRIAGE_UNITS, list);
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
    list.sort((a, b) => a.date.localeCompare(b.date));
    memoryDailyInflows = list;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
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
    memoryPendingItems = list;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
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
    const list = [...getCachedDailyInflows()];
    const idx = list.findIndex(d => d.id === item.id || d.date === (item as any).date);
    if (idx >= 0) list[idx] = item as any;
    else list.push(item as any);
    list.sort((a, b) => a.date.localeCompare(b.date));
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
    const list = getCachedDailyInflows().filter(d => d.id !== cleanId && (d as any).date !== cleanId);
    memoryDailyInflows = list;
    persistToStorage(CACHE_KEY_DAILY_INFLOWS, list);
  } else if (collectionName === 'pending_items') {
    const list = getCachedPendingItems().filter(p => p.id !== cleanId);
    memoryPendingItems = list;
    persistToStorage(CACHE_KEY_PENDING_ITEMS, list);
  }
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
