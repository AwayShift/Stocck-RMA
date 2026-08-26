/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized System Integrations & Metrics Persistence Service
 * 
 * Ensures that:
 * 1. Supabase Personal Access Token (PAT) is saved to the central database and synchronized across all devices/browsers.
 * 2. Cloudinary configuration (Cloud Name, Upload Preset, Status) is saved to the central database and available everywhere.
 * 3. Latest captured metrics for both Supabase (Egress, DB Size, Storage, MAU) and Cloudinary (CDN images, Saved Storage/Bandwidth)
 *    are cached in the cloud so any browser/device displays the saved metrics immediately upon opening.
 * 4. Real-time broadcast sync across active tabs and devices with graceful offline fallback.
 */

import { getSupabaseClient } from './supabase';
import { CloudinaryConfig, getCloudinaryConfig, saveCloudinaryConfig } from './cloudinaryService';

export interface CloudinaryMetricsSummary {
  totalCloudinaryImages: number;
  totalSupabaseImages: number;
  totalImages: number;
  estimatedStorageSavedBytes: number;
  estimatedStorageSavedFormatted: string;
  estimatedEgressSavedBytes: number;
  estimatedEgressSavedFormatted: string;
  isCloudinaryConfigured: boolean;
  cloudName: string;
  uploadPreset: string;
  lastUpdated: string;
}

export interface RemoteIntegrationsPayload {
  supabasePat?: string;
  cloudinaryConfig?: CloudinaryConfig;
  cachedSupabaseMetrics?: any;
  cachedCloudinaryMetrics?: CloudinaryMetricsSummary;
  lastUpdated?: string;
  lastUpdatedBy?: string;
}

const STORAGE_CACHED_SUPABASE_METRICS_KEY = 'stocckrma_cached_supabase_metrics';
const STORAGE_CACHED_CLOUDINARY_METRICS_KEY = 'stocckrma_cached_cloudinary_metrics';
const CONFIG_RECORD_ID = 'config_system_integrations';

// Debounce tracker to batch updates and avoid simultaneous fetch requests
let pendingSyncTimeout: any = null;
let isSyncInProgress = false;

/**
 * Format bytes to readable string (e.g. 1.25 MB)
 */
export const formatBytesCompact = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Loads cached Supabase metrics from localStorage
 */
export const getLocalCachedSupabaseMetrics = (): any | null => {
  try {
    const raw = localStorage.getItem(STORAGE_CACHED_SUPABASE_METRICS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignore local parse issues
  }
  return null;
};

/**
 * Saves cached Supabase metrics to localStorage
 */
export const setLocalCachedSupabaseMetrics = (metrics: any): void => {
  try {
    localStorage.setItem(STORAGE_CACHED_SUPABASE_METRICS_KEY, JSON.stringify(metrics));
  } catch (e) {
    // Ignore storage quota issues
  }
};

/**
 * Loads cached Cloudinary metrics from localStorage
 */
export const getLocalCachedCloudinaryMetrics = (): CloudinaryMetricsSummary | null => {
  try {
    const raw = localStorage.getItem(STORAGE_CACHED_CLOUDINARY_METRICS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignore
  }
  return null;
};

/**
 * Saves cached Cloudinary metrics to localStorage
 */
export const setLocalCachedCloudinaryMetrics = (metrics: CloudinaryMetricsSummary): void => {
  try {
    localStorage.setItem(STORAGE_CACHED_CLOUDINARY_METRICS_KEY, JSON.stringify(metrics));
  } catch (e) {
    // Ignore
  }
};

/**
 * Calculates current Cloudinary metrics from the database (products, triage_units, pending_items)
 */
export const calculateCloudinaryMetricsFromDatabase = async (): Promise<CloudinaryMetricsSummary> => {
  const cfg = getCloudinaryConfig();
  const isConfigured = Boolean(cfg.cloudName && cfg.uploadPreset);

  let cloudinaryCount = 0;
  let supabaseCount = 0;

  const supabase = getSupabaseClient();
  if (supabase && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    try {
      const [prodRes, triageRes, pendingRes] = await Promise.allSettled([
        supabase.from('products').select('image_url, images, images_product, images_box, images_accessories').limit(1000),
        supabase.from('triage_units').select('photos_product, photos_box, photos_accessories').limit(1000),
        supabase.from('pending_items').select('photos').limit(500)
      ]);

      const inspectUrl = (url: any) => {
        if (!url || typeof url !== 'string') return;
        const clean = url.toLowerCase();
        if (clean.includes('cloudinary') || clean.includes('res.cloudinary.com')) {
          cloudinaryCount++;
        } else if (clean.includes('supabase') || clean.includes('product-images') || clean.startsWith('http')) {
          supabaseCount++;
        }
      };

      const inspectList = (list: any) => {
        if (Array.isArray(list)) {
          list.forEach(inspectUrl);
        }
      };

      if (prodRes.status === 'fulfilled' && prodRes.value.data) {
        prodRes.value.data.forEach((p: any) => {
          inspectUrl(p.image_url);
          inspectList(p.images);
          inspectList(p.images_product);
          inspectList(p.images_box);
          inspectList(p.images_accessories);
        });
      }

      if (triageRes.status === 'fulfilled' && triageRes.value.data) {
        triageRes.value.data.forEach((t: any) => {
          inspectList(t.photos_product);
          inspectList(t.photos_box);
          inspectList(t.photos_accessories);
        });
      }

      if (pendingRes.status === 'fulfilled' && pendingRes.value.data) {
        pendingRes.value.data.forEach((p: any) => {
          inspectList(p.photos);
        });
      }
    } catch (err) {
      // Graceful fallback for metric calculation
    }
  }

  // Baseline estimate: average WebP photo is ~350 KB
  const avgPhotoBytes = 350 * 1024;
  const savedStorageBytes = cloudinaryCount * avgPhotoBytes;
  // Each CDN photo served saves on average 3x views worth of Supabase Egress
  const savedEgressBytes = cloudinaryCount * (avgPhotoBytes * 3);

  const summary: CloudinaryMetricsSummary = {
    totalCloudinaryImages: cloudinaryCount,
    totalSupabaseImages: supabaseCount,
    totalImages: cloudinaryCount + supabaseCount,
    estimatedStorageSavedBytes: savedStorageBytes,
    estimatedStorageSavedFormatted: formatBytesCompact(savedStorageBytes),
    estimatedEgressSavedBytes: savedEgressBytes,
    estimatedEgressSavedFormatted: formatBytesCompact(savedEgressBytes),
    isCloudinaryConfigured: isConfigured,
    cloudName: cfg.cloudName || '',
    uploadPreset: cfg.uploadPreset || '',
    lastUpdated: new Date().toISOString()
  };

  setLocalCachedCloudinaryMetrics(summary);
  return summary;
};

/**
 * Loads remote integrations configuration and metrics from Supabase database.
 * Automatically synchronizes with local storage if remote data is present.
 */
export const fetchRemoteSystemIntegrations = async (): Promise<RemoteIntegrationsPayload | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('backup_snapshots')
      .select('data, created_at, created_by')
      .eq('id', CONFIG_RECORD_ID)
      .maybeSingle();

    if (error) {
      // Silent catch if table is not yet queried or connection is recovering
      return null;
    }

    if (data && data.data) {
      const payload = data.data as RemoteIntegrationsPayload;

      // 1. Sync Supabase PAT if remote exists and local is empty or different
      if (payload.supabasePat && typeof payload.supabasePat === 'string' && payload.supabasePat.trim()) {
        const localPat = localStorage.getItem('stocckrma_supabase_pat') || '';
        if (!localPat || localPat.trim() !== payload.supabasePat.trim()) {
          localStorage.setItem('stocckrma_supabase_pat', payload.supabasePat.trim());
          window.dispatchEvent(new CustomEvent('supabase-pat-changed', { detail: { token: payload.supabasePat.trim() } }));
        }
      }

      // 2. Sync Cloudinary config if remote exists
      if (payload.cloudinaryConfig && typeof payload.cloudinaryConfig === 'object') {
        const localCloudinary = getCloudinaryConfig();
        const remoteC = payload.cloudinaryConfig;
        if (
          remoteC.cloudName &&
          (localCloudinary.cloudName !== remoteC.cloudName || localCloudinary.uploadPreset !== remoteC.uploadPreset)
        ) {
          saveCloudinaryConfig(remoteC);
        }
      }

      // 3. Sync cached metrics
      if (payload.cachedSupabaseMetrics) {
        setLocalCachedSupabaseMetrics(payload.cachedSupabaseMetrics);
      }
      if (payload.cachedCloudinaryMetrics) {
        setLocalCachedCloudinaryMetrics(payload.cachedCloudinaryMetrics);
      }

      return payload;
    }
  } catch (err) {
    // Network or temporary fetch error - silent fallback
  }

  return null;
};

/**
 * Internal execution of the upsert to cloud
 */
const executePersistToCloud = async (
  updates: {
    supabasePat?: string;
    cloudinaryConfig?: Partial<CloudinaryConfig>;
    cachedSupabaseMetrics?: any;
    cachedCloudinaryMetrics?: CloudinaryMetricsSummary;
    userEmail?: string;
  }
): Promise<boolean> => {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  try {
    let currentPayload: RemoteIntegrationsPayload = {};
    try {
      const { data } = await supabase
        .from('backup_snapshots')
        .select('data')
        .eq('id', CONFIG_RECORD_ID)
        .maybeSingle();

      if (data && data.data) {
        currentPayload = data.data as RemoteIntegrationsPayload;
      }
    } catch {
      // Continue with empty payload if query fails
    }

    const currentLocalPat = localStorage.getItem('stocckrma_supabase_pat') || '';
    const currentLocalCloudinary = getCloudinaryConfig();

    const mergedPat = updates.supabasePat !== undefined 
      ? updates.supabasePat.trim() 
      : (currentPayload.supabasePat || currentLocalPat).trim();

    const mergedCloudinary: CloudinaryConfig = {
      cloudName: (updates.cloudinaryConfig?.cloudName !== undefined ? updates.cloudinaryConfig.cloudName : (currentPayload.cloudinaryConfig?.cloudName || currentLocalCloudinary.cloudName || '')).trim(),
      uploadPreset: (updates.cloudinaryConfig?.uploadPreset !== undefined ? updates.cloudinaryConfig.uploadPreset : (currentPayload.cloudinaryConfig?.uploadPreset || currentLocalCloudinary.uploadPreset || '')).trim(),
      enabled: updates.cloudinaryConfig?.enabled !== undefined ? updates.cloudinaryConfig.enabled : (currentPayload.cloudinaryConfig?.enabled ?? currentLocalCloudinary.enabled),
      folder: (updates.cloudinaryConfig?.folder || currentPayload.cloudinaryConfig?.folder || currentLocalCloudinary.folder || 'stocck_rma').trim()
    };

    const mergedSupabaseMetrics = updates.cachedSupabaseMetrics !== undefined 
      ? updates.cachedSupabaseMetrics 
      : (currentPayload.cachedSupabaseMetrics || getLocalCachedSupabaseMetrics());

    const mergedCloudinaryMetrics = updates.cachedCloudinaryMetrics !== undefined 
      ? updates.cachedCloudinaryMetrics 
      : (currentPayload.cachedCloudinaryMetrics || getLocalCachedCloudinaryMetrics());

    const updatedPayload: RemoteIntegrationsPayload = {
      supabasePat: mergedPat,
      cloudinaryConfig: mergedCloudinary,
      cachedSupabaseMetrics: mergedSupabaseMetrics,
      cachedCloudinaryMetrics: mergedCloudinaryMetrics,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: updates.userEmail || 'operador@stocckrma.local'
    };

    const now = new Date();

    const { error: upsertError } = await supabase
      .from('backup_snapshots')
      .upsert({
        id: CONFIG_RECORD_ID,
        backup_id: CONFIG_RECORD_ID,
        filename: 'config_system_integrations.json',
        created_at: now.toISOString(),
        created_by: { name: 'System Integrations Sync', email: updates.userEmail || 'sistema@stocckrma.local' },
        trigger_type: 'config',
        checksum: 'integrations_cfg',
        total_items: 0,
        file_size_formatted: '2 KB',
        size_bytes: 2048,
        chunk_index: 0,
        total_chunks: 1,
        data: updatedPayload
      });

    if (upsertError) {
      // Non-fatal warning - local copy is already safe
      return false;
    }

    return true;
  } catch (err) {
    // Network failure gracefully caught
    return false;
  }
};

/**
 * Saves system integrations and metrics to the central Supabase database with debouncing and local storage update.
 */
export const persistSystemIntegrationsToCloud = async (
  updates: {
    supabasePat?: string;
    cloudinaryConfig?: Partial<CloudinaryConfig>;
    cachedSupabaseMetrics?: any;
    cachedCloudinaryMetrics?: CloudinaryMetricsSummary;
    userEmail?: string;
  }
): Promise<boolean> => {
  // 1. Immediately save to LocalStorage so current device is 100% instant
  if (updates.supabasePat !== undefined) {
    const cleanPat = updates.supabasePat.trim();
    localStorage.setItem('stocckrma_supabase_pat', cleanPat);
    window.dispatchEvent(new CustomEvent('supabase-pat-changed', { detail: { token: cleanPat } }));
  }
  if (updates.cloudinaryConfig) {
    saveCloudinaryConfig(updates.cloudinaryConfig);
  }
  if (updates.cachedSupabaseMetrics) {
    setLocalCachedSupabaseMetrics(updates.cachedSupabaseMetrics);
  }
  if (updates.cachedCloudinaryMetrics) {
    setLocalCachedCloudinaryMetrics(updates.cachedCloudinaryMetrics);
  }

  // 2. Debounce and safely sync to the Cloud
  if (pendingSyncTimeout) {
    clearTimeout(pendingSyncTimeout);
  }

  return new Promise((resolve) => {
    pendingSyncTimeout = setTimeout(async () => {
      if (isSyncInProgress) {
        resolve(true);
        return;
      }
      isSyncInProgress = true;
      try {
        const success = await executePersistToCloud(updates);
        resolve(success);
      } finally {
        isSyncInProgress = false;
      }
    }, 600);
  });
};

/**
 * Initializes automatic background synchronization of integrations across devices
 */
export const initSystemIntegrationsSync = async (userEmail?: string): Promise<void> => {
  // Delay initial sync slightly to allow network stack and auth to settle
  setTimeout(async () => {
    try {
      // 1. Initial fetch from cloud
      const remote = await fetchRemoteSystemIntegrations();

      // 2. If cloud didn't have PAT or Cloudinary yet, but local does, auto-seed the cloud
      const localPat = localStorage.getItem('stocckrma_supabase_pat') || '';
      const localCloud = getCloudinaryConfig();

      if ((localPat && (!remote || !remote.supabasePat)) || (localCloud.cloudName && (!remote || !remote.cloudinaryConfig?.cloudName))) {
        await persistSystemIntegrationsToCloud({
          supabasePat: localPat,
          cloudinaryConfig: localCloud,
          userEmail
        });
      }

      // 3. Listen for real-time remote updates from other devices / browsers
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          supabase.channel('realtime_integrations_config')
            .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'backup_snapshots', 
              filter: `id=eq.${CONFIG_RECORD_ID}` 
            }, (payload: any) => {
              if (payload.new && payload.new.data) {
                const data = payload.new.data as RemoteIntegrationsPayload;
                if (data.supabasePat) {
                  const current = localStorage.getItem('stocckrma_supabase_pat');
                  if (current !== data.supabasePat) {
                    localStorage.setItem('stocckrma_supabase_pat', data.supabasePat);
                    window.dispatchEvent(new CustomEvent('supabase-pat-changed', { detail: { token: data.supabasePat } }));
                  }
                }
                if (data.cloudinaryConfig?.cloudName) {
                  saveCloudinaryConfig(data.cloudinaryConfig);
                }
                if (data.cachedSupabaseMetrics) {
                  setLocalCachedSupabaseMetrics(data.cachedSupabaseMetrics);
                  window.dispatchEvent(new CustomEvent('supabase-metrics-synced', { detail: data.cachedSupabaseMetrics }));
                }
                if (data.cachedCloudinaryMetrics) {
                  setLocalCachedCloudinaryMetrics(data.cachedCloudinaryMetrics);
                  window.dispatchEvent(new CustomEvent('cloudinary-metrics-synced', { detail: data.cachedCloudinaryMetrics }));
                }
              }
            })
            .subscribe();
        } catch {
          // Realtime optional connection fallback
        }
      }
    } catch {
      // Silent error handler for startup sync
    }
  }, 1200);
};
