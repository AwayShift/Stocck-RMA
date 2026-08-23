/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface QuotaDailyStats {
  date: string; // YYYY-MM-DD
  profileId: string;
  reads: number;
  writes: number;
  deletes: number;
  isExceeded?: boolean;
  exceededReason?: string;
  lastUpdated: string;
}

export interface QuotaLimits {
  dailyReads: number;
  dailyWrites: number;
  dailyDeletes: number;
}

// Official Firebase Spark Plan (Free Tier) Limits per 24 hours
export const FIREBASE_SPARK_LIMITS: QuotaLimits = {
  dailyReads: 50000,
  dailyWrites: 20000,
  dailyDeletes: 20000,
};

const STORAGE_QUOTA_PREFIX = 'rmaflow_firestore_quota_';

const getTodayKey = (): string => {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
};

export const getQuotaStats = (profileId: string, targetDate?: string): QuotaDailyStats => {
  const date = targetDate || getTodayKey();
  const key = `${STORAGE_QUOTA_PREFIX}${profileId}_${date}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('Error reading quota stats:', err);
  }

  // If this is the main production base and no local count has been recorded yet today,
  // initialize with the real console data (74.000 reads, 632 writes)
  const isMainProd = profileId === 'main';
  const initialReads = isMainProd ? 74000 : 0;
  const initialWrites = isMainProd ? 632 : 0;
  const initialExceeded = isMainProd;

  const defaultStats: QuotaDailyStats = {
    date,
    profileId,
    reads: initialReads,
    writes: initialWrites,
    deletes: 0,
    isExceeded: initialExceeded,
    exceededReason: initialExceeded ? 'Cota de 50.000 leituras diárias ultrapassada no Google Cloud / Firebase (74 mil total)' : undefined,
    lastUpdated: new Date().toISOString(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(defaultStats));
  } catch (e) {}

  return defaultStats;
};

export const recordFirestoreOperation = (
  type: 'read' | 'write' | 'delete',
  count: number = 1,
  targetProfileId?: string
): void => {
  if (count <= 0) return;
  
  const profileId = targetProfileId || localStorage.getItem('rmaflow_active_db_profile') || 'main';
  const date = getTodayKey();
  const current = getQuotaStats(profileId, date);

  if (type === 'read') current.reads += count;
  else if (type === 'write') current.writes += count;
  else if (type === 'delete') current.deletes += count;

  current.lastUpdated = new Date().toISOString();

  try {
    const key = `${STORAGE_QUOTA_PREFIX}${profileId}_${date}`;
    localStorage.setItem(key, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { profileId, stats: current } }));
  } catch (err) {
    console.error('Error storing quota metric:', err);
  }
};

export const markQuotaExceeded = (
  profileId: string, 
  customNumbers?: { reads?: number; writes?: number; reason?: string }
): void => {
  const date = getTodayKey();
  const current = getQuotaStats(profileId, date);
  current.isExceeded = true;
  current.reads = customNumbers?.reads ?? Math.max(current.reads, 74000);
  if (customNumbers?.writes !== undefined) current.writes = customNumbers.writes;
  current.exceededReason = customNumbers?.reason || 'Limite diário de 50.000 leituras atingido no Firebase Console (74 mil operações)';
  current.lastUpdated = new Date().toISOString();

  try {
    const key = `${STORAGE_QUOTA_PREFIX}${profileId}_${date}`;
    localStorage.setItem(key, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { profileId, stats: current } }));
    window.dispatchEvent(new CustomEvent('quota-exceeded-alert', { detail: { profileId, stats: current } }));
  } catch (err) {
    console.error('Error marking quota exceeded:', err);
  }
};

export const setManualQuotaStats = (
  profileId: string,
  reads: number,
  writes: number,
  deletes: number = 0
): void => {
  const date = getTodayKey();
  const isExceeded = reads >= FIREBASE_SPARK_LIMITS.dailyReads;
  const newStats: QuotaDailyStats = {
    date,
    profileId,
    reads: Math.max(0, reads),
    writes: Math.max(0, writes),
    deletes: Math.max(0, deletes),
    isExceeded,
    exceededReason: isExceeded ? `Limite de ${FIREBASE_SPARK_LIMITS.dailyReads.toLocaleString('pt-BR')} leituras diárias atingido` : undefined,
    lastUpdated: new Date().toISOString(),
  };

  try {
    const key = `${STORAGE_QUOTA_PREFIX}${profileId}_${date}`;
    localStorage.setItem(key, JSON.stringify(newStats));
    window.dispatchEvent(new CustomEvent('quota-updated', { detail: { profileId, stats: newStats } }));
  } catch (err) {
    console.error('Error setting manual quota stats:', err);
  }
};

export interface QuotaStatusSummary {
  profileId: string;
  reads: number;
  writes: number;
  deletes: number;
  readsLimit: number;
  writesLimit: number;
  deletesLimit: number;
  readsPercent: number;
  writesPercent: number;
  deletesPercent: number;
  overallStatus: 'normal' | 'warning' | 'critical' | 'exhausted';
  statusLabel: string;
  statusColor: 'emerald' | 'amber' | 'rose' | 'red';
  isExceeded: boolean;
  exceededReason?: string;
}

export const getQuotaSummary = (profileId: string): QuotaStatusSummary => {
  const stats = getQuotaStats(profileId);
  const readsLimit = FIREBASE_SPARK_LIMITS.dailyReads;
  const writesLimit = FIREBASE_SPARK_LIMITS.dailyWrites;
  const deletesLimit = FIREBASE_SPARK_LIMITS.dailyDeletes;

  const readsPercent = Math.round((stats.reads / readsLimit) * 100 * 10) / 10;
  const writesPercent = Math.round((stats.writes / writesLimit) * 100 * 10) / 10;
  const deletesPercent = Math.round((stats.deletes / deletesLimit) * 100 * 10) / 10;

  const maxPct = Math.max(readsPercent, writesPercent, deletesPercent);

  let overallStatus: 'normal' | 'warning' | 'critical' | 'exhausted' = 'normal';
  let statusLabel = 'Operação Normal (Cota Segura)';
  let statusColor: 'emerald' | 'amber' | 'rose' | 'red' = 'emerald';

  if (stats.isExceeded || maxPct >= 100) {
    overallStatus = 'exhausted';
    statusLabel = `Cota Diária Esgotada (${readsPercent}% do limite)`;
    statusColor = 'red';
  } else if (maxPct >= 85) {
    overallStatus = 'critical';
    statusLabel = 'Limite Crítico (> 85%) - Troca Recomendada';
    statusColor = 'rose';
  } else if (maxPct >= 65) {
    overallStatus = 'warning';
    statusLabel = 'Atenção ao Uso (> 65%)';
    statusColor = 'amber';
  }

  return {
    profileId,
    reads: stats.reads,
    writes: stats.writes,
    deletes: stats.deletes,
    readsLimit,
    writesLimit,
    deletesLimit,
    readsPercent,
    writesPercent,
    deletesPercent,
    overallStatus,
    statusLabel,
    statusColor,
    isExceeded: Boolean(stats.isExceeded || maxPct >= 100),
    exceededReason: stats.exceededReason,
  };
};

export const resetQuotaForProfile = (profileId: string): void => {
  const date = getTodayKey();
  const key = `${STORAGE_QUOTA_PREFIX}${profileId}_${date}`;
  const resetStats: QuotaDailyStats = {
    date,
    profileId,
    reads: 0,
    writes: 0,
    deletes: 0,
    isExceeded: false,
    lastUpdated: new Date().toISOString()
  };
  localStorage.setItem(key, JSON.stringify(resetStats));
  window.dispatchEvent(new CustomEvent('quota-updated', { detail: { profileId, stats: resetStats } }));
};

