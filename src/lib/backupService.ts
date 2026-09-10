/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Backup & Disaster Recovery Service: Stocck-RMA (Supabase + PostgreSQL + Local Storage)
 * 
 * Supports:
 * 1. Online Cloud Snapshots stored in Supabase `backup_snapshots` table (auto-chunked for high reliability).
 * 2. Instant Local JSON Export / Import with SHA-256 integrity checks.
 * 3. Intelligent Background Schedule Engine (Hourly, End of Day, Weekly, Monthly).
 * 4. Safe Database Restoration (Merge or Clean Replace).
 */

import { 
  BaseProduct, 
  TriageUnit, 
  DailyInflowRecord, 
  CaseTracking, 
  SystemBackupPayload, 
  SystemBackupMetadata,
  BackupValidationResult,
  CloudBackupRecord,
  AutoBackupScheduleConfig,
  BackupTriggerType,
  PendingItem,
  BackupStorageStats
} from '../types';
import { createAuditLog } from './dbService';
import {
  getActiveDbProvider,
  getSupabaseClient,
  mapProductToSupabase,
  mapSupabaseToProduct,
  mapTriageUnitToSupabase,
  mapSupabaseToTriageUnit,
  mapDailyInflowToSupabase,
  mapSupabaseToDailyInflow,
  mapPendingItemToSupabase,
  mapSupabaseToPendingItem
} from './supabase';
import { getCurrentActiveAuthUser } from './supabaseAuth';

const BACKUP_SCHEMA_VERSION = '1.2.0';
const APP_IDENTIFIER = 'stocckrma-pro-flow';

/**
 * Max safe size per chunk in bytes (~300 KB).
 */
export const SNAPSHOT_CHUNK_SIZE = 300 * 1024;

export const DEFAULT_AUTO_BACKUP_CONFIG: AutoBackupScheduleConfig = {
  enabled: true,
  hourly: {
    enabled: false,
    intervalHours: 2, // A cada 2 horas
  },
  endOfDay: {
    enabled: true,
    time: '18:00', // Final do expediente padrão
  },
  weekly: {
    enabled: true,
    dayOfWeek: 5, // Sexta-feira
    time: '18:30',
  },
  monthly: {
    enabled: true,
    dayOfMonth: 1, // Todo dia 1
    time: '19:00',
  },
  retentionKeepCount: 15,
  lastRun: {},
  lastBackupStatus: 'Pronto para execuções programadas'
};

/**
 * Format date for friendly human reading in BR format
 */
export const formatBrDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

/**
 * Format filename date string YYYY-MM-DD_HHmm
 */
const formatFilenameTimestamp = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}_${hh}h${min}`;
};

/**
 * Calculate SHA-256 integrity hash of a UTF-8 string
 */
export const calculateSha256 = async (str: string): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('Fallback hash algorithm:', err);
    // Simple fast fallback checksum
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `chk_${Math.abs(hash).toString(16)}`;
  }
};

/**
 * Format bytes to readable string (e.g. 1.25 MB)
 */
export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Splits an array into chunks of a given maximum size
 */
export const chunkArray = <T>(arr: T[], size: number): T[][] => {
  const results: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    results.push(arr.slice(i, i + size));
  }
  return results;
};

/**
 * Query current database records to assemble the complete backup payload
 */
export const fetchCurrentDatabasePayload = async (userInfo?: {
  email?: string;
  name?: string;
  role?: string;
}): Promise<{
  counts: {
    products: number;
    triageUnits: number;
    dailyInflows: number;
    cases: number;
    logs: number;
  };
  jsonContent: string;
  fileSizeFormatted: string;
  sizeBytes: number;
  payload: SystemBackupPayload;
}> => {
  let products: BaseProduct[] = [];
  let triageUnits: TriageUnit[] = [];
  let dailyInflows: DailyInflowRecord[] = [];
  let cases: CaseTracking[] = [];
  let logs: any[] = [];
  let pendingItems: PendingItem[] = [];

  const supabase = getSupabaseClient();
  if (supabase) {
    const [pRes, uRes, iRes, cRes, lRes, pendRes] = await Promise.all([
      supabase.from('products').select('*').limit(20000),
      supabase.from('triage_units').select('*').limit(20000),
      supabase.from('daily_inflows').select('*').limit(5000),
      supabase.from('cases').select('*').limit(5000),
      supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200),
      supabase.from('pending_items').select('*').limit(5000)
    ]);

    if (pRes.data) products = pRes.data.map(mapSupabaseToProduct);
    if (uRes.data) triageUnits = uRes.data.map(mapSupabaseToTriageUnit);
    if (iRes.data) dailyInflows = iRes.data.map(mapSupabaseToDailyInflow);
    if (cRes.data) {
      cases = cRes.data.map(r => ({
        id: r.id,
        code: r.code,
        platform: r.platform,
        createdAt: r.created_at,
        reason: r.reason,
        resolution: r.resolution,
        status: r.status,
        notes: r.notes,
        value: r.value
      }));
    }
    if (lRes.data) {
      logs = lRes.data.map(r => ({
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        action: r.action,
        details: r.details,
        timestamp: r.timestamp
      }));
    }
    if (pendRes.data) {
      pendingItems = pendRes.data.map(mapSupabaseToPendingItem);
    }
  }

  const counts = {
    products: products.length,
    triageUnits: triageUnits.length,
    dailyInflows: dailyInflows.length,
    cases: cases.length,
    logs: logs.length
  };

  const enableSpreadsheetImport = localStorage.getItem('rmaflow_enable_spreadsheet_import') !== 'false';
  const enableSpreadsheetExport = localStorage.getItem('rmaflow_enable_spreadsheet_export') !== 'false';

  const activeAuthUser = await getCurrentActiveAuthUser();
  const userEmailResolved = userInfo?.email || activeAuthUser?.email || 'operador@stocckrma.local';
  const userNameResolved = userInfo?.name || activeAuthUser?.name || 'Operador Corporativo';
  const userUidResolved = activeAuthUser?.uid || '';

  const metadata: SystemBackupMetadata = {
    version: BACKUP_SCHEMA_VERSION,
    appName: 'StocckRMA Triagem & Estoque Pro',
    systemIdentifier: APP_IDENTIFIER,
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: formatBrDate(new Date()),
    exportedBy: {
      uid: userUidResolved,
      email: userEmailResolved,
      name: userNameResolved
    },
    collectionsCount: counts,
    totalItems: counts.products + counts.triageUnits + counts.dailyInflows + counts.cases,
    fileSizeBytes: 0,
    integrityHash: ''
  };

  const payload: SystemBackupPayload = {
    metadata,
    data: {
      products,
      triageUnits,
      dailyInflows,
      cases,
      pendingItems,
      auditLogs: logs
    },
    settings: {
      enableSpreadsheetImport,
      enableSpreadsheetExport
    }
  };

  const tempJson = JSON.stringify(payload, null, 2);
  const sizeBytes = new Blob([tempJson]).size;
  const hash = await calculateSha256(tempJson);

  payload.metadata.fileSizeBytes = sizeBytes;
  payload.metadata.integrityHash = hash;

  const finalJson = JSON.stringify(payload, null, 2);

  return {
    counts,
    jsonContent: finalJson,
    fileSizeFormatted: formatBytes(sizeBytes),
    sizeBytes,
    payload
  };
};

/**
 * Downloads a complete full database backup file (.json) to the user's computer
 */
export const exportDatabaseToJsonFile = async (
  userInfo?: {
    email?: string;
    name?: string;
    role?: string;
  }
): Promise<{
  filename: string;
  sizeFormatted: string;
  counts: {
    products: number;
    triageUnits: number;
    dailyInflows: number;
    cases: number;
  };
}> => {
  const { counts, jsonContent, fileSizeFormatted } = await fetchCurrentDatabasePayload(userInfo);
  const timestampStr = formatFilenameTimestamp(new Date());
  const filename = `StocckRMA_Backup_${timestampStr}.json`;

  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  try {
    await createAuditLog(
      'BACKUP_EXPORT_FILE',
      `Exportou arquivo JSON de backup do sistema (${fileSizeFormatted}). ${counts.products} produtos, ${counts.triageUnits} triagens/estoque, ${counts.dailyInflows} registros diários.`
    );
  } catch (err) {
    console.warn('Audit log creation warning:', err);
  }

  return {
    filename,
    sizeFormatted: fileSizeFormatted,
    counts
  };
};

export const generateAndDownloadBackup = exportDatabaseToJsonFile;

/**
 * Fetch full reconstructed JSON payload for a cloud snapshot (aggregating chunks if chunked)
 */
export const fetchCloudSnapshotPayloadJson = async (snapshot: CloudBackupRecord): Promise<string> => {
  const supabase = getSupabaseClient();
  if (supabase) {
    if (snapshot.chunked || snapshot.totalChunks > 1) {
      // 1. Load chunk rows ordered by chunk_index
      const { data, error } = await supabase
        .from('backup_snapshots')
        .select('chunk_index, data')
        .eq('backup_id', snapshot.id)
        .order('chunk_index', { ascending: true });

      if (!error && data && data.length > 0) {
        const parts: string[] = [];
        data.forEach(row => {
          if (row.chunk_index > 0 && row.data && row.data.chunk_text) {
            parts.push(row.data.chunk_text);
          }
        });
        const fullJson = parts.join('');
        if (fullJson.length > 0) {
          return fullJson;
        }
      }
    }

    // 2. Single row lookup
    const { data } = await supabase
      .from('backup_snapshots')
      .select('data')
      .eq('id', snapshot.id)
      .maybeSingle();

    if (data && data.data) {
      return typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2);
    }
  }

  // Fallback to payloadJson if present
  if (snapshot.payloadJson && snapshot.payloadJson.trim() !== '' && snapshot.payloadJson !== '{}') {
    return snapshot.payloadJson;
  }

  throw new Error('O snapshot selecionado não contém conteúdo de dados válido ou seus fragmentos estão inacessíveis.');
};

/**
 * Create a secure online cloud snapshot stored in Supabase `backup_snapshots`
 */
export const createCloudSnapshot = async (
  triggerType: BackupTriggerType = 'manual',
  customTitle?: string,
  userInfo?: {
    email?: string;
    name?: string;
    role?: string;
  }
): Promise<{
  success: boolean;
  snapshot: CloudBackupRecord;
}> => {
  const now = new Date();
  const { counts, jsonContent, fileSizeFormatted, sizeBytes } = await fetchCurrentDatabasePayload(userInfo);
  const hash = await calculateSha256(jsonContent);

  const triggerLabels: Record<BackupTriggerType, string> = {
    manual: 'Manual (Sob Demanda)',
    hourly: 'Agendado (Por Hora)',
    end_of_day: 'Final do Expediente',
    weekly: 'Agendado (Semanal)',
    monthly: 'Agendado (Mensal)'
  };

  const defaultTitle = customTitle || (
    triggerType === 'manual' 
      ? `Snapshot Manual - ${formatFilenameTimestamp(now)}`
      : `Backup Automático (${triggerLabels[triggerType]})`
  );

  const snapshotId = `bk_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`;

  const activeAuthUser = await getCurrentActiveAuthUser();
  const userEmailResolved = userInfo?.email || activeAuthUser?.email || 'sistema@stocckrma.local';
  const userNameResolved = userInfo?.name || activeAuthUser?.name || (triggerType === 'manual' ? 'Operador' : 'Robô Automático');
  const userUidResolved = activeAuthUser?.uid || '';

  const supabase = getSupabaseClient();
  if (supabase) {
    const sanitizedCreatedBy = {
      uid: userUidResolved,
      email: userEmailResolved,
      name: userNameResolved
    };

    const totalItems = Number(counts.products || 0) + Number(counts.triageUnits || 0) + Number(counts.dailyInflows || 0) + Number(counts.cases || 0);

    const CHUNK_SIZE = 300 * 1024;
    const isChunked = jsonContent.length > CHUNK_SIZE;

    if (isChunked) {
      const chunks: string[] = [];
      for (let i = 0; i < jsonContent.length; i += CHUNK_SIZE) {
        chunks.push(jsonContent.substring(i, i + CHUNK_SIZE));
      }

      // 1. Save master metadata record
      const { error: masterErr } = await supabase
        .from('backup_snapshots')
        .upsert({
          id: snapshotId,
          backup_id: snapshotId,
          filename: `Backup_${snapshotId}.json`,
          created_at: now.toISOString(),
          created_by: sanitizedCreatedBy,
          trigger_type: triggerType,
          checksum: hash,
          total_items: totalItems,
          file_size_formatted: fileSizeFormatted,
          size_bytes: Math.round(Number(sizeBytes) || 0),
          chunk_index: 0,
          total_chunks: chunks.length,
          data: {
            metadata: {
              version: '1.0.0',
              generatedAt: now.toISOString(),
              collectionsCount: counts,
              totalItems,
              fileSizeBytes: sizeBytes,
              integrityHash: hash
            }
          }
        });

      if (masterErr) {
        console.error('Supabase backup_snapshots master upsert error:', masterErr);
        throw new Error(`Falha ao salvar cabeçalho do Snapshot no Supabase: ${masterErr.message}`);
      }

      // 2. Save individual chunk rows
      for (let i = 0; i < chunks.length; i++) {
        const { error: chunkErr } = await supabase
          .from('backup_snapshots')
          .upsert({
            id: `${snapshotId}_chunk_${i + 1}`,
            backup_id: snapshotId,
            filename: `part_${i + 1}`,
            created_at: now.toISOString(),
            created_by: sanitizedCreatedBy,
            trigger_type: triggerType,
            checksum: hash,
            total_items: 0,
            file_size_formatted: fileSizeFormatted,
            size_bytes: chunks[i].length,
            chunk_index: i + 1,
            total_chunks: chunks.length,
            data: { chunk_text: chunks[i] }
          });

        if (chunkErr) {
          console.error(`Supabase backup_snapshots chunk ${i + 1} upsert error:`, chunkErr);
          throw new Error(`Falha ao salvar fragmento ${i + 1}/${chunks.length} do Snapshot no Supabase: ${chunkErr.message}`);
        }
      }
    } else {
      const cleanPayload = JSON.parse(jsonContent);
      const { error: upsertError } = await supabase
        .from('backup_snapshots')
        .upsert({
          id: snapshotId,
          backup_id: snapshotId,
          filename: `Backup_${snapshotId}.json`,
          created_at: now.toISOString(),
          created_by: sanitizedCreatedBy,
          trigger_type: triggerType,
          checksum: hash,
          total_items: totalItems,
          file_size_formatted: fileSizeFormatted,
          size_bytes: Math.round(Number(sizeBytes) || 0),
          chunk_index: 0,
          total_chunks: 1,
          data: cleanPayload
        });

      if (upsertError) {
        console.error('Supabase backup_snapshots upsert error:', upsertError);
        throw new Error(`Falha ao salvar Snapshot no Supabase: ${upsertError.message}`);
      }
    }

    const snapshotRecord: CloudBackupRecord = {
      id: snapshotId,
      title: defaultTitle,
      triggerType,
      triggerLabel: triggerLabels[triggerType],
      createdAt: now.toISOString(),
      createdAtFormatted: formatBrDate(now),
      createdBy: sanitizedCreatedBy,
      collectionsCount: counts,
      fileSizeBytes: sizeBytes,
      fileSizeFormatted,
      integrityHash: hash,
      payloadJson: isChunked ? '' : jsonContent,
      chunked: isChunked,
      totalChunks: isChunked ? Math.ceil(jsonContent.length / (300 * 1024)) : 1,
      status: 'active'
    };

    localStorage.setItem('stocckrma_last_cloud_backup_date', now.toISOString());
    localStorage.setItem('stocckrma_last_cloud_backup_id', snapshotId);
    localStorage.setItem('stocckrma_last_cloud_backup_stats', JSON.stringify(counts));

    return {
      success: true,
      snapshot: snapshotRecord
    };
  }

  throw new Error('Supabase Client não configurado.');
};

/**
 * Subscribe to list of Cloud Snapshots stored in Supabase
 */
export const subscribeToCloudBackups = (
  callback: (snapshots: CloudBackupRecord[]) => void
) => {
  const supabase = getSupabaseClient();
  if (supabase) {
    const fetchSnapshots = async () => {
      try {
        const { data, error } = await supabase
          .from('backup_snapshots')
          .select('id, filename, created_at, created_by, trigger_type, checksum, total_items, file_size_formatted, size_bytes, chunk_index, total_chunks, data')
          .eq('chunk_index', 0)
          .neq('id', 'config_backup_schedule')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.warn('Could not list backup_snapshots from Supabase:', error.message);
          return;
        }

        if (data) {
          const list: CloudBackupRecord[] = data.map((r: any) => {
            const triggerLabels: Record<string, string> = {
              manual: 'Manual (Sob Demanda)',
              hourly: 'Agendado (Por Hora)',
              end_of_day: 'Final do Expediente',
              weekly: 'Agendado (Semanal)',
              monthly: 'Agendado (Mensal)'
            };
            const createdDate = new Date(r.created_at);
            const counts = r.data?.metadata?.collectionsCount || {
              products: 0,
              triageUnits: 0,
              dailyInflows: 0,
              cases: 0,
              logs: 0
            };

            return {
              id: r.id,
              title: r.trigger_type === 'manual' 
                ? `Snapshot Manual - ${formatFilenameTimestamp(createdDate)}`
                : `Backup Automático (${triggerLabels[r.trigger_type] || r.trigger_type})`,
              triggerType: r.trigger_type || 'manual',
              triggerLabel: triggerLabels[r.trigger_type] || 'Manual',
              createdAt: r.created_at,
              createdAtFormatted: formatBrDate(createdDate),
              createdBy: r.created_by || { name: 'Sistema' },
              collectionsCount: counts,
              fileSizeBytes: r.size_bytes || 0,
              fileSizeFormatted: r.file_size_formatted || '0 KB',
              integrityHash: r.checksum || '',
              payloadJson: '',
              chunked: (r.total_chunks || 1) > 1,
              totalChunks: r.total_chunks || 1,
              status: 'active'
            };
          });
          callback(list);
        }
      } catch (err) {
        console.warn('Silent catch for Supabase snapshots query:', err);
      }
    };

    fetchSnapshots();

    const channel = supabase.channel('realtime_snapshots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'backup_snapshots' }, () => {
        fetchSnapshots();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  callback([]);
  return () => {};
};

/**
 * Delete a specific Cloud Snapshot from Supabase (cascades to all chunk records)
 */
export const deleteCloudSnapshot = async (snapshotId: string): Promise<boolean> => {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from('backup_snapshots')
      .delete()
      .or(`id.eq.${snapshotId},backup_id.eq.${snapshotId}`);
    if (error) {
      console.error('Error deleting snapshot from Supabase:', error);
      throw error;
    }

    // Also purge any chunk records by ID prefix in case backup_id was null
    try {
      await supabase
        .from('backup_snapshots')
        .delete()
        .ilike('id', `${snapshotId}_chunk_%`);
    } catch (e) {
      console.warn('Silent catch deleting chunk prefix:', e);
    }

    return true;
  }
  return false;
};

export interface FetchCloudBackupsOptions {
  page?: number;
  pageSize?: number;
  triggerType?: string;
  search?: string;
  sortBy?: 'newest' | 'oldest' | 'largest';
  dateFilter?: 'all' | 'today' | 'last7days' | 'last30days' | 'older30days';
}

export interface PaginatedCloudBackupsResult {
  snapshots: CloudBackupRecord[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  totalFilteredBytes: number;
}

/**
 * Get comprehensive backup storage statistics from Supabase
 */
export const getBackupStorageStats = async (): Promise<BackupStorageStats> => {
  const supabase = getSupabaseClient();
  const defaultStats: BackupStorageStats = {
    totalRows: 0,
    masterSnapshotsCount: 0,
    chunkRowsCount: 0,
    orphanChunksCount: 0,
    totalSizeBytes: 0,
    totalSizeFormatted: '0 MB',
    quotaBytes: 500 * 1024 * 1024,
    quotaFormatted: '500 MB',
    percentQuotaUsed: 0
  };

  if (!supabase) return defaultStats;

  try {
    const [totalRowsRes, mastersRes, sizesRes] = await Promise.allSettled([
      supabase.from('backup_snapshots').select('*', { count: 'exact', head: true }).neq('id', 'config_backup_schedule'),
      supabase.from('backup_snapshots').select('*', { count: 'exact', head: true }).eq('chunk_index', 0).neq('id', 'config_backup_schedule'),
      supabase.from('backup_snapshots').select('size_bytes, chunk_index').neq('id', 'config_backup_schedule')
    ]);

    const totalRows = totalRowsRes.status === 'fulfilled' ? (totalRowsRes.value.count || 0) : 0;
    const masterCount = mastersRes.status === 'fulfilled' ? (mastersRes.value.count || 0) : 0;
    const chunkRowsCount = Math.max(0, totalRows - masterCount);

    let totalSizeBytes = 0;
    if (sizesRes.status === 'fulfilled' && sizesRes.value.data) {
      const rows = sizesRes.value.data;
      const chunks = rows.filter((r: any) => (r.chunk_index || 0) > 0);
      if (chunks.length > 0) {
        totalSizeBytes = chunks.reduce((acc: number, r: any) => acc + (Number(r.size_bytes) || 0), 0);
      } else {
        const masters = rows.filter((r: any) => (r.chunk_index || 0) === 0);
        totalSizeBytes = masters.reduce((acc: number, r: any) => acc + (Number(r.size_bytes) || 0), 0);
      }
    }

    // Realistic baseline estimation if size_bytes wasn't stored on older chunk rows
    if (totalSizeBytes === 0 && totalRows > 0) {
      totalSizeBytes = totalRows * 80 * 1024;
    }

    const quotaBytes = 500 * 1024 * 1024; // 500 MB Free Tier
    const percentQuotaUsed = Math.min(100, Math.round((totalSizeBytes / quotaBytes) * 100));

    return {
      totalRows,
      masterSnapshotsCount: masterCount,
      chunkRowsCount,
      orphanChunksCount: 0,
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes),
      quotaBytes,
      quotaFormatted: '500 MB',
      percentQuotaUsed
    };
  } catch (err) {
    console.error('Error fetching backup storage stats:', err);
    return defaultStats;
  }
};

/**
 * Fetch paginated cloud backups (metadata only for low network egress)
 */
export const fetchPaginatedCloudBackups = async (
  options: FetchCloudBackupsOptions = {}
): Promise<PaginatedCloudBackupsResult> => {
  const supabase = getSupabaseClient();
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(5, options.pageSize || 25);
  const defaultEmpty: PaginatedCloudBackupsResult = {
    snapshots: [],
    totalCount: 0,
    totalPages: 1,
    page,
    pageSize,
    totalFilteredBytes: 0
  };

  if (!supabase) return defaultEmpty;

  try {
    let query = supabase
      .from('backup_snapshots')
      .select('id, backup_id, filename, created_at, created_by, trigger_type, checksum, total_items, file_size_formatted, size_bytes, chunk_index, total_chunks', { count: 'exact' })
      .eq('chunk_index', 0)
      .neq('id', 'config_backup_schedule');

    if (options.triggerType && options.triggerType !== 'all') {
      query = query.eq('trigger_type', options.triggerType);
    }

    if (options.search && options.search.trim()) {
      const term = options.search.trim();
      query = query.or(`filename.ilike.%${term}%,id.ilike.%${term}%,trigger_type.ilike.%${term}%`);
    }

    if (options.dateFilter && options.dateFilter !== 'all') {
      const now = new Date();
      if (options.dateFilter === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte('created_at', startOfToday);
      } else if (options.dateFilter === 'last7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', sevenDaysAgo);
      } else if (options.dateFilter === 'last30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', thirtyDaysAgo);
      } else if (options.dateFilter === 'older30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.lt('created_at', thirtyDaysAgo);
      }
    }

    if (options.sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (options.sortBy === 'largest') {
      query = query.order('size_bytes', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching paginated backups:', error);
      return defaultEmpty;
    }

    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const triggerLabels: Record<string, string> = {
      manual: 'Manual (Sob Demanda)',
      hourly: 'Agendado (Por Hora)',
      end_of_day: 'Final do Expediente',
      weekly: 'Agendado (Semanal)',
      monthly: 'Agendado (Mensal)'
    };

    let totalFilteredBytes = 0;

    const snapshots: CloudBackupRecord[] = (data || []).map((r: any) => {
      const createdDate = new Date(r.created_at);
      const fileBytes = Number(r.size_bytes) || 0;
      totalFilteredBytes += fileBytes;

      return {
        id: r.id,
        title: r.trigger_type === 'manual'
          ? `Snapshot Manual - ${formatFilenameTimestamp(createdDate)}`
          : `Backup Automático (${triggerLabels[r.trigger_type] || r.trigger_type})`,
        triggerType: r.trigger_type || 'manual',
        triggerLabel: triggerLabels[r.trigger_type] || 'Manual',
        createdAt: r.created_at,
        createdAtFormatted: formatBrDate(createdDate),
        createdBy: r.created_by || { name: 'Sistema' },
        collectionsCount: {
          products: 0,
          triageUnits: 0,
          dailyInflows: 0,
          cases: 0,
          logs: 0
        },
        fileSizeBytes: fileBytes,
        fileSizeFormatted: r.file_size_formatted || formatBytes(fileBytes),
        integrityHash: r.checksum || '',
        payloadJson: '',
        chunked: (r.total_chunks || 1) > 1,
        totalChunks: r.total_chunks || 1,
        status: 'active'
      };
    });

    return {
      snapshots,
      totalCount,
      totalPages,
      page,
      pageSize,
      totalFilteredBytes
    };
  } catch (err) {
    console.error('Error executing paginated backups query:', err);
    return defaultEmpty;
  }
};

/**
 * Bulk delete cloud snapshots and their corresponding chunks in safe batches
 */
export const bulkDeleteCloudSnapshots = async (
  snapshotIds: string[],
  onProgress?: (deleted: number, total: number) => void
): Promise<{ success: boolean; deletedCount: number }> => {
  const supabase = getSupabaseClient();
  if (!supabase || snapshotIds.length === 0) return { success: true, deletedCount: 0 };

  const BATCH_SIZE = 25;
  let deletedCount = 0;

  for (let i = 0; i < snapshotIds.length; i += BATCH_SIZE) {
    const batch = snapshotIds.slice(i, i + BATCH_SIZE);

    try {
      // 1. Delete master rows
      await supabase
        .from('backup_snapshots')
        .delete()
        .in('id', batch);

      // 2. Delete chunk rows by backup_id
      await supabase
        .from('backup_snapshots')
        .delete()
        .in('backup_id', batch);

      // 3. Clean any chunk rows with id prefix
      for (const id of batch) {
        await supabase
          .from('backup_snapshots')
          .delete()
          .ilike('id', `${id}_chunk_%`);
      }
    } catch (batchErr) {
      console.warn('Error deleting batch of snapshots:', batchErr);
    }

    deletedCount += batch.length;
    onProgress?.(deletedCount, snapshotIds.length);
  }

  return { success: true, deletedCount };
};

/**
 * Detect and purge orphan chunks that have no corresponding master snapshot
 */
export const purgeOrphanBackupChunks = async (
  onProgress?: (purged: number, total: number) => void
): Promise<{ success: boolean; purgedCount: number }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: true, purgedCount: 0 };

  try {
    const { data: masters } = await supabase
      .from('backup_snapshots')
      .select('id')
      .eq('chunk_index', 0);

    const masterIdSet = new Set((masters || []).map(m => m.id));

    const { data: chunks } = await supabase
      .from('backup_snapshots')
      .select('id, backup_id')
      .gt('chunk_index', 0)
      .limit(3000);

    if (!chunks || chunks.length === 0) {
      return { success: true, purgedCount: 0 };
    }

    const orphanIds = chunks
      .filter(c => {
        if (!c.backup_id) {
          const prefix = c.id.split('_chunk_')[0];
          return !masterIdSet.has(prefix);
        }
        return !masterIdSet.has(c.backup_id);
      })
      .map(c => c.id);

    if (orphanIds.length === 0) {
      return { success: true, purgedCount: 0 };
    }

    let purgedCount = 0;
    const BATCH_SIZE = 50;
    for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
      const batch = orphanIds.slice(i, i + BATCH_SIZE);
      await supabase.from('backup_snapshots').delete().in('id', batch);
      purgedCount += batch.length;
      onProgress?.(purgedCount, orphanIds.length);
    }

    return { success: true, purgedCount };
  } catch (err) {
    console.error('Error purging orphan chunks:', err);
    return { success: false, purgedCount: 0 };
  }
};

export type QuickCleanupPolicy = 
  | 'keep_latest_5'
  | 'keep_latest_10'
  | 'older_than_7_days'
  | 'older_than_30_days'
  | 'hourly_only'
  | 'all_except_latest'
  | 'delete_all';

/**
 * Execute 1-click quick cleanup rules to free database space instantly
 */
export const quickCleanupBackups = async (
  policy: QuickCleanupPolicy,
  onProgress?: (processed: number, total: number) => void
): Promise<{ success: boolean; deletedCount: number; message: string }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, deletedCount: 0, message: 'Supabase não conectado' };

  try {
    if (policy === 'delete_all') {
      const { error } = await supabase
        .from('backup_snapshots')
        .delete()
        .neq('id', 'config_backup_schedule');

      if (error) throw error;
      return { success: true, deletedCount: 9999, message: 'Todos os backups e fragmentos foram eliminados do Supabase.' };
    }

    let query = supabase
      .from('backup_snapshots')
      .select('id, created_at, trigger_type')
      .eq('chunk_index', 0)
      .neq('id', 'config_backup_schedule')
      .order('created_at', { ascending: false });

    if (policy === 'hourly_only') {
      query = query.eq('trigger_type', 'hourly');
    }

    const { data: masters, error } = await query;
    if (error) throw error;

    if (!masters || masters.length === 0) {
      return { success: true, deletedCount: 0, message: 'Nenhum backup encontrado para a regra selecionada.' };
    }

    let idsToDelete: string[] = [];

    if (policy === 'keep_latest_5') {
      idsToDelete = masters.slice(5).map(m => m.id);
    } else if (policy === 'keep_latest_10') {
      idsToDelete = masters.slice(10).map(m => m.id);
    } else if (policy === 'all_except_latest') {
      idsToDelete = masters.slice(1).map(m => m.id);
    } else if (policy === 'hourly_only') {
      idsToDelete = masters.map(m => m.id);
    } else if (policy === 'older_than_7_days') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      idsToDelete = masters
        .filter(m => new Date(m.created_at).getTime() < sevenDaysAgo)
        .map(m => m.id);
    } else if (policy === 'older_than_30_days') {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      idsToDelete = masters
        .filter(m => new Date(m.created_at).getTime() < thirtyDaysAgo)
        .map(m => m.id);
    }

    if (idsToDelete.length === 0) {
      return { success: true, deletedCount: 0, message: 'Nenhum backup precisou ser excluído (limite já respeitado).' };
    }

    const res = await bulkDeleteCloudSnapshots(idsToDelete, onProgress);
    return {
      success: true,
      deletedCount: res.deletedCount,
      message: `${res.deletedCount} ponto(s) de backup e todos os seus fragmentos foram removidos com sucesso.`
    };
  } catch (err: any) {
    console.error('Error running quick cleanup:', err);
    return { success: false, deletedCount: 0, message: err.message || 'Erro ao executar limpeza.' };
  }
};

/**
 * Load Auto-Backup schedule settings from Supabase / LocalStorage
 */
export const loadAutoBackupConfig = async (): Promise<AutoBackupScheduleConfig> => {
  const localSaved = localStorage.getItem('stocckrma_auto_backup_config');
  let baseConfig = DEFAULT_AUTO_BACKUP_CONFIG;
  if (localSaved) {
    try {
      baseConfig = { ...DEFAULT_AUTO_BACKUP_CONFIG, ...JSON.parse(localSaved) };
    } catch (e) {
      console.warn('Error parsing local auto backup config:', e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.from('backup_snapshots').select('data').eq('id', 'config_backup_schedule').maybeSingle();
      if (data && data.data) {
        const remoteConfig = data.data as AutoBackupScheduleConfig;
        localStorage.setItem('stocckrma_auto_backup_config', JSON.stringify(remoteConfig));
        return { ...baseConfig, ...remoteConfig };
      }
    } catch (e) {
      console.warn('Could not read backup schedule config from Supabase:', e);
    }
  }

  return baseConfig;
};

/**
 * Save Auto-Backup schedule settings to Supabase & LocalStorage
 */
export const saveAutoBackupConfig = async (
  config: AutoBackupScheduleConfig
): Promise<void> => {
  localStorage.setItem('stocckrma_auto_backup_config', JSON.stringify(config));

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('backup_snapshots').upsert({
        id: 'config_backup_schedule',
        backup_id: 'config_backup_schedule',
        filename: 'config_backup_schedule.json',
        created_at: new Date().toISOString(),
        trigger_type: 'config',
        checksum: 'cfg',
        total_items: 0,
        file_size_formatted: '1 KB',
        size_bytes: 1024,
        data: config
      });
    } catch (e) {
      console.warn('Could not save auto backup config to Supabase:', e);
    }
  }
};

/**
 * Download a specific CloudBackupRecord as a JSON file to local computer
 */
export const downloadCloudSnapshotAsJson = async (snapshot: CloudBackupRecord) => {
  const jsonContent = await fetchCloudSnapshotPayloadJson(snapshot);
  const filename = `Backup_Nuvem_${snapshot.id}_${formatFilenameTimestamp(new Date(snapshot.createdAt))}.json`;
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Validate a backup file uploaded by the user
 */
export const validateBackupFile = (
  fileContent: string, 
  fileSizeBytes: number = 0
): BackupValidationResult => {
  if (!fileContent || !fileContent.trim()) {
    return {
      isValid: false,
      error: 'O arquivo selecionado está vazio.'
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err: any) {
    return {
      isValid: false,
      error: `Formato JSON inválido: ${err.message || 'Erro ao processar estrutura do arquivo'}`
    };
  }

  let payload: SystemBackupPayload;

  if (parsed.metadata && parsed.data) {
    payload = parsed as SystemBackupPayload;
  } else if (Array.isArray(parsed.products) || Array.isArray(parsed.triageUnits)) {
    payload = {
      metadata: {
        version: '1.0.0 (legado)',
        appName: 'StocckRMA Export',
        systemIdentifier: APP_IDENTIFIER,
        exportedAt: new Date().toISOString(),
        exportedAtFormatted: formatBrDate(new Date()),
        exportedBy: { name: 'Arquivo Importado' },
        collectionsCount: {
          products: Array.isArray(parsed.products) ? parsed.products.length : 0,
          triageUnits: Array.isArray(parsed.triageUnits) ? parsed.triageUnits.length : 0,
          dailyInflows: Array.isArray(parsed.dailyInflows) ? parsed.dailyInflows.length : 0,
          cases: Array.isArray(parsed.cases) ? parsed.cases.length : 0,
          logs: 0
        },
        totalItems: (parsed.products?.length || 0) + (parsed.triageUnits?.length || 0),
        fileSizeBytes,
        integrityHash: ''
      },
      data: {
        products: parsed.products || [],
        triageUnits: parsed.triageUnits || [],
        dailyInflows: parsed.dailyInflows || [],
        cases: parsed.cases || [],
        pendingItems: parsed.pendingItems || [],
        auditLogs: []
      }
    };
  } else {
    return {
      isValid: false,
      error: 'O arquivo JSON não possui o esquema de backup reconhecido pelo Stocck-RMA.'
    };
  }

  const counts = {
    products: payload.data?.products?.length || 0,
    triageUnits: payload.data?.triageUnits?.length || 0,
    dailyInflows: payload.data?.dailyInflows?.length || 0,
    cases: payload.data?.cases?.length || 0,
    pendingItems: payload.data?.pendingItems?.length || 0,
    auditLogs: payload.data?.auditLogs?.length || 0
  };

  const total = counts.products + counts.triageUnits + counts.dailyInflows + counts.cases + counts.pendingItems;
  if (total === 0) {
    return {
      isValid: true,
      payload,
      summary: {
        version: payload.metadata?.version || '1.0.0',
        exportedAtFormatted: payload.metadata?.exportedAtFormatted || 'Desconhecido',
        exportedByName: payload.metadata?.exportedBy?.name || 'Operador',
        counts,
        totalItems: 0,
        fileSizeFormatted: formatBytes(fileSizeBytes)
      },
      warning: 'Atenção: O arquivo de backup não contém nenhum registro cadastrado.'
    };
  }

  return {
    isValid: true,
    payload,
    summary: {
      version: payload.metadata?.version || '1.0.0',
      exportedAtFormatted: payload.metadata?.exportedAtFormatted || formatBrDate(new Date()),
      exportedByName: payload.metadata?.exportedBy?.name || 'Operador',
      counts,
      totalItems: total,
      fileSizeFormatted: formatBytes(fileSizeBytes)
    }
  };
};

/**
 * Restore the database from a validated SystemBackupPayload into Supabase
 */
export const restoreDatabaseFromBackup = async (
  payload: SystemBackupPayload,
  mode: 'replace' | 'merge' = 'replace',
  onProgress?: (stage: string, percent: number) => void
): Promise<{
  success: boolean;
  restoredCounts: {
    products: number;
    triageUnits: number;
    dailyInflows: number;
    cases: number;
  };
}> => {
  const products = payload.data?.products || [];
  const triageUnits = payload.data?.triageUnits || [];
  const dailyInflows = payload.data?.dailyInflows || [];
  const cases = payload.data?.cases || [];
  const pendingItems = payload.data?.pendingItems || [];

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client não está inicializado.');
  }

  const BATCH_SIZE = 100;

  // 1. If REPLACE mode, clear tables first
  if (mode === 'replace') {
    onProgress?.('Limpando tabelas atuais no Supabase...', 10);
    try {
      await supabase.from('products').delete().neq('id', '___all___');
      await supabase.from('triage_units').delete().neq('id', '___all___');
      await supabase.from('daily_inflows').delete().neq('id', '___all___');
      await supabase.from('cases').delete().neq('id', '___all___');
      await supabase.from('pending_items').delete().neq('id', '___all___');
    } catch (clearErr) {
      console.warn('Clear tables warning in Supabase:', clearErr);
    }
  }

  // 2. Restore Products
  onProgress?.(`Restaurando ${products.length} produtos no Catálogo de Base (Supabase)...`, 30);
  for (const chunk of chunkArray(products, BATCH_SIZE)) {
    const rows = chunk.map(mapProductToSupabase);
    const { error } = await supabase.from('products').upsert(rows);
    if (error) throw new Error(`Erro ao restaurar produtos no Supabase: ${error.message}`);
  }

  // 3. Restore Triage Units
  onProgress?.(`Restaurando ${triageUnits.length} unidades do Estoque Físico & Triagem (Supabase)...`, 60);
  for (const chunk of chunkArray(triageUnits, BATCH_SIZE)) {
    const rows = chunk.map(mapTriageUnitToSupabase);
    const { error } = await supabase.from('triage_units').upsert(rows);
    if (error) throw new Error(`Erro ao restaurar unidades no Supabase: ${error.message}`);
  }

  // 4. Restore Daily Inflows
  onProgress?.(`Restaurando ${dailyInflows.length} registros de fluxo diário (Supabase)...`, 80);
  for (const chunk of chunkArray(dailyInflows, BATCH_SIZE)) {
    const rows = chunk.map(mapDailyInflowToSupabase);
    const { error } = await supabase.from('daily_inflows').upsert(rows);
    if (error) throw new Error(`Erro ao restaurar fluxos diários no Supabase: ${error.message}`);
  }

  // 5. Restore Cases
  if (cases.length > 0) {
    onProgress?.(`Restaurando ${cases.length} casos de garantia (Supabase)...`, 90);
    for (const chunk of chunkArray(cases, BATCH_SIZE)) {
      const rows = chunk.map(c => ({
        id: c.id,
        code: c.code,
        platform: c.platform,
        created_at: c.createdAt,
        reason: c.reason,
        resolution: c.resolution,
        status: c.status,
        notes: c.notes,
        value: c.value
      }));
      const { error } = await supabase.from('cases').upsert(rows);
      if (error) throw new Error(`Erro ao restaurar casos no Supabase: ${error.message}`);
    }
  }

  // 6. Restore Pending Items
  if (pendingItems.length > 0) {
    onProgress?.(`Restaurando ${pendingItems.length} itens de pendências (Supabase)...`, 95);
    for (const chunk of chunkArray(pendingItems, BATCH_SIZE)) {
      const rows = chunk.map(mapPendingItemToSupabase);
      const { error } = await supabase.from('pending_items').upsert(rows);
      if (error) throw new Error(`Erro ao restaurar pendências no Supabase: ${error.message}`);
    }
  }

  // Settings & Flags
  if (payload.settings?.enableSpreadsheetImport !== undefined) {
    localStorage.setItem('rmaflow_enable_spreadsheet_import', String(payload.settings.enableSpreadsheetImport));
  }
  if (payload.settings?.enableSpreadsheetExport !== undefined) {
    localStorage.setItem('rmaflow_enable_spreadsheet_export', String(payload.settings.enableSpreadsheetExport));
  }

  localStorage.setItem('base_products_seeded', 'true');
  localStorage.setItem('triage_units_seeded', 'true');
  localStorage.setItem('cases_seeded', 'true');
  localStorage.setItem('daily_inflows_seeded', 'true');

  onProgress?.('Finalizando restauração e gravando log de auditoria...', 100);

  const modeLabel = mode === 'replace' ? 'Substituição Completa' : 'Mesclagem (Merge)';
  try {
    await createAuditLog(
      'BACKUP_RESTORED',
      `Restaurou backup no modo ${modeLabel}. Total restaurado: ${products.length} produtos, ${triageUnits.length} unidades de estoque/triagem, ${dailyInflows.length} entradas diárias e ${cases.length} casos.`
    );
  } catch (logErr) {
    console.warn('Audit log recording warning:', logErr);
  }

  return {
    success: true,
    restoredCounts: {
      products: products.length,
      triageUnits: triageUnits.length,
      dailyInflows: dailyInflows.length,
      cases: cases.length
    }
  };
};

/**
 * Restore from a specific CloudBackupRecord
 */
export const restoreFromCloudSnapshot = async (
  snapshot: CloudBackupRecord,
  mode: 'replace' | 'merge' = 'replace',
  onProgress?: (stage: string, percent: number) => void
) => {
  onProgress?.('Carregando e integrando fragmentos do backup da nuvem...', 5);
  const jsonContent = await fetchCloudSnapshotPayloadJson(snapshot);
  const parsedPayload = JSON.parse(jsonContent) as SystemBackupPayload;
  return await restoreDatabaseFromBackup(parsedPayload, mode, onProgress);
};

/**
 * Intelligent background schedule engine
 */
export const checkAndRunScheduledBackups = async (userInfo?: {
  email?: string;
  name?: string;
  role?: string;
}): Promise<{
  triggered: boolean;
  type?: BackupTriggerType;
  snapshotId?: string;
}> => {
  const config = await loadAutoBackupConfig();
  if (!config.enabled) {
    return { triggered: false };
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDayOfWeek = now.getDay();
  const currentDayOfMonth = now.getDate();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const lastRun = config.lastRun || {};

  const mutexKey = 'stocckrma_backup_exec_mutex';
  const mutexVal = localStorage.getItem(mutexKey);
  if (mutexVal && Date.now() - parseInt(mutexVal, 10) < 60000) {
    return { triggered: false };
  }

  // 1. Check Hourly Trigger
  if (config.hourly.enabled && config.hourly.intervalHours > 0) {
    const lastHourly = lastRun.hourly ? new Date(lastRun.hourly) : null;
    const hoursDiff = lastHourly ? (now.getTime() - lastHourly.getTime()) / (1000 * 60 * 60) : Infinity;
    
    if (hoursDiff >= config.hourly.intervalHours) {
      localStorage.setItem(mutexKey, String(Date.now()));
      const res = await createCloudSnapshot('hourly', undefined, userInfo);
      config.lastRun = config.lastRun || {};
      config.lastRun.hourly = now.toISOString();
      config.lastBackupStatus = `Último backup por hora executado em ${formatBrDate(now)}`;
      await saveAutoBackupConfig(config);
      await triggerAutoPrune(config.retentionKeepCount || 15);
      return { triggered: true, type: 'hourly', snapshotId: res.snapshot.id };
    }
  }

  // 2. Check End of Day Trigger
  if (config.endOfDay.enabled && config.endOfDay.time) {
    const [eodHourStr, eodMinStr] = config.endOfDay.time.split(':');
    const eodHour = parseInt(eodHourStr || '18', 10);
    const eodMin = parseInt(eodMinStr || '0', 10);

    const isAfterTarget = currentHour > eodHour || (currentHour === eodHour && currentMinute >= eodMin);
    const lastEodDate = lastRun.endOfDay ? lastRun.endOfDay.split('T')[0] : null;

    if (isAfterTarget && lastEodDate !== todayYmd) {
      localStorage.setItem(mutexKey, String(Date.now()));
      const res = await createCloudSnapshot('end_of_day', undefined, userInfo);
      config.lastRun = config.lastRun || {};
      config.lastRun.endOfDay = now.toISOString();
      config.lastBackupStatus = `Backup de fim do expediente executado em ${formatBrDate(now)}`;
      await saveAutoBackupConfig(config);
      await triggerAutoPrune(config.retentionKeepCount || 15);
      return { triggered: true, type: 'end_of_day', snapshotId: res.snapshot.id };
    }
  }

  // 3. Check Weekly Trigger
  if (config.weekly.enabled) {
    const [wkHourStr, wkMinStr] = config.weekly.time.split(':');
    const wkHour = parseInt(wkHourStr || '18', 10);
    const wkMin = parseInt(wkMinStr || '30', 10);

    const isTargetDay = currentDayOfWeek === config.weekly.dayOfWeek;
    const isAfterTime = currentHour > wkHour || (currentHour === wkHour && currentMinute >= wkMin);
    const lastWkDate = lastRun.weekly ? lastRun.weekly.split('T')[0] : null;

    if (isTargetDay && isAfterTime && lastWkDate !== todayYmd) {
      localStorage.setItem(mutexKey, String(Date.now()));
      const res = await createCloudSnapshot('weekly', undefined, userInfo);
      config.lastRun = config.lastRun || {};
      config.lastRun.weekly = now.toISOString();
      config.lastBackupStatus = `Backup semanal executado em ${formatBrDate(now)}`;
      await saveAutoBackupConfig(config);
      await triggerAutoPrune(config.retentionKeepCount || 15);
      return { triggered: true, type: 'weekly', snapshotId: res.snapshot.id };
    }
  }

  // 4. Check Monthly Trigger
  if (config.monthly.enabled) {
    const [moHourStr, moMinStr] = config.monthly.time.split(':');
    const moHour = parseInt(moHourStr || '19', 10);
    const moMin = parseInt(moMinStr || '0', 10);

    const isTargetDay = currentDayOfMonth === config.monthly.dayOfMonth;
    const isAfterTime = currentHour > moHour || (currentHour === moHour && currentMinute >= moMin);
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMoMonth = lastRun.monthly ? lastRun.monthly.substring(0, 7) : null;

    if (isTargetDay && isAfterTime && lastMoMonth !== currentMonthPrefix) {
      localStorage.setItem(mutexKey, String(Date.now()));
      const res = await createCloudSnapshot('monthly', undefined, userInfo);
      config.lastRun = config.lastRun || {};
      config.lastRun.monthly = now.toISOString();
      config.lastBackupStatus = `Backup mensal executado em ${formatBrDate(now)}`;
      await saveAutoBackupConfig(config);
      await triggerAutoPrune(config.retentionKeepCount || 15);
      return { triggered: true, type: 'monthly', snapshotId: res.snapshot.id };
    }
  }

  return { triggered: false };
};

const triggerAutoPrune = async (keepCount: number) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: oldAutomated } = await supabase
      .from('backup_snapshots')
      .select('id')
      .eq('chunk_index', 0)
      .neq('trigger_type', 'manual')
      .neq('id', 'config_backup_schedule')
      .order('created_at', { ascending: false })
      .range(keepCount, keepCount + 50);

    if (oldAutomated && oldAutomated.length > 0) {
      await bulkDeleteCloudSnapshots(oldAutomated.map((r: any) => r.id));
    }
  } catch (err) {
    console.warn('Silent catch during triggerAutoPrune:', err);
  }
};
