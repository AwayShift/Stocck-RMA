/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import { 
  collection, 
  getDocs, 
  getDoc,
  setDoc,
  deleteDoc,
  doc, 
  writeBatch,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from './firebase';
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
  PendingItem
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
 * Max safe size per chunk in characters/bytes (~350 KB).
 * Well below Firestore 1 MB per document hard limit.
 */
export const SNAPSHOT_CHUNK_SIZE = 350 * 1024;

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
 * Helper to split large arrays into batches of safe size (< 400 docs per batch)
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const results: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    results.push(array.slice(i, i + size));
  }
  return results;
}

/**
 * Calculate SHA-256 cryptographic checksum for payload validation
 */
async function calculateSha256(text: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Crypto subtle fallback:', e);
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'chk_' + Math.abs(hash).toString(16);
}

/**
 * Extract live database payload
 */
async function fetchCurrentDatabasePayload(userInfo?: {
  email?: string;
  name?: string;
  role?: string;
}): Promise<{
  payload: SystemBackupPayload;
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
}> {
  const now = new Date();

  let products: BaseProduct[] = [];
  let triageUnits: TriageUnit[] = [];
  let dailyInflows: DailyInflowRecord[] = [];
  let cases: CaseTracking[] = [];
  let logs: any[] = [];
  let pendingItems: PendingItem[] = [];

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const [pRes, uRes, iRes, cRes, lRes, pendRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('triage_units').select('*').order('created_at', { ascending: false }),
        supabase.from('daily_inflows').select('*').order('date', { ascending: true }),
        supabase.from('cases').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(150),
        supabase.from('pending_items').select('*').order('created_at', { ascending: false })
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
  } else {
    const [productsSnap, unitsSnap, inflowsSnap, casesSnap, logsSnap, pendSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'triage_units')),
      getDocs(collection(db, 'daily_inflows')),
      getDocs(collection(db, 'cases')),
      getDocs(query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(150))),
      getDocs(collection(db, 'pending_items'))
    ]);

    products = productsSnap.docs.map(d => ({ ...(d.data() as BaseProduct), id: d.id }));
    triageUnits = unitsSnap.docs.map(d => ({ ...(d.data() as TriageUnit), id: d.id }));
    dailyInflows = inflowsSnap.docs.map(d => ({ ...(d.data() as DailyInflowRecord), id: d.id }));
    cases = casesSnap.docs.map(d => ({ ...(d.data() as CaseTracking), id: d.id }));
    logs = logsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    pendingItems = pendSnap.docs.map(d => ({ ...(d.data() as PendingItem), id: d.id }));
  }

  const counts = {
    products: products.length,
    triageUnits: triageUnits.length,
    dailyInflows: dailyInflows.length,
    cases: cases.length,
    logs: logs.length
  };

  const enableSpreadsheetImport = localStorage.getItem('rmaflow_enable_spreadsheet_import') !== 'false';

  const activeAuthUser = getActiveDbProvider() === 'supabase' ? await getCurrentActiveAuthUser() : null;
  const userEmailResolved = userInfo?.email || activeAuthUser?.email || auth.currentUser?.email || 'operador@stocckrma.local';
  const userNameResolved = userInfo?.name || activeAuthUser?.name || auth.currentUser?.displayName || 'Operador Corporativo';
  const userUidResolved = activeAuthUser?.uid || auth.currentUser?.uid || '';

  const metadata: SystemBackupMetadata = {
    version: BACKUP_SCHEMA_VERSION,
    appName: 'StocckRMA Triagem & Estoque Pro',
    systemIdentifier: APP_IDENTIFIER,
    exportedAt: now.toISOString(),
    exportedAtFormatted: formatBrDate(now),
    exportedBy: {
      uid: userUidResolved,
      email: userEmailResolved,
      name: userNameResolved
    },
    collectionsCount: counts
  };

  const payload: SystemBackupPayload = {
    metadata,
    data: {
      products,
      triageUnits,
      dailyInflows,
      cases,
      logs,
      pendingItems
    } as any,
    settings: {
      enableSpreadsheetImport
    }
  };

  const jsonContent = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const sizeBytes = blob.size;
  const fileSizeFormatted = sizeBytes > 1024 * 1024 
    ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(sizeBytes / 1024).toFixed(1)} KB`;

  return {
    payload,
    counts,
    jsonContent,
    fileSizeFormatted,
    sizeBytes
  };
}

/**
 * Trigger browser download for a local backup JSON file
 */
export const generateAndDownloadBackup = async (userInfo?: {
  email?: string;
  name?: string;
  role?: string;
}): Promise<{
  success: boolean;
  filename: string;
  counts: {
    products: number;
    triageUnits: number;
    dailyInflows: number;
    cases: number;
    logs: number;
  };
  fileSizeFormatted: string;
}> => {
  const now = new Date();
  const { counts, jsonContent, fileSizeFormatted } = await fetchCurrentDatabasePayload(userInfo);

  const filename = `Backup_StocckRMA_${formatFilenameTimestamp(now)}.json`;
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  localStorage.setItem('stocckrma_last_backup_date', now.toISOString());
  localStorage.setItem('stocckrma_last_backup_filename', filename);
  localStorage.setItem('stocckrma_last_backup_stats', JSON.stringify(counts));

  try {
    await createAuditLog(
      'BACKUP_EXPORTED',
      `Exportou cópia de segurança local (${filename}) com ${counts.products} produtos, ${counts.triageUnits} unidades em estoque e ${counts.dailyInflows} registros de fluxo diário. Tamanho: ${fileSizeFormatted}.`
    );
  } catch (logErr) {
    console.warn('Audit log recording error on backup export:', logErr);
  }

  return {
    success: true,
    filename,
    counts,
    fileSizeFormatted
  };
};

/**
 * Fetch and reconstitute the full JSON payload for a CloudBackupRecord.
 * Seamlessly supports single-document legacy backups, Supabase multi-chunk records, and Firestore chunked subcollection payloads.
 */
export const fetchCloudSnapshotPayloadJson = async (snapshot: CloudBackupRecord): Promise<string> => {
  // If payloadJson exists, is non-empty, and not marked as chunked
  if (snapshot.payloadJson && snapshot.payloadJson.length > 20 && !snapshot.chunked) {
    return snapshot.payloadJson;
  }

  // Supabase snapshot check
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      // 1. Check if snapshot is chunked in Supabase
      if (snapshot.chunked || (snapshot.totalChunks && snapshot.totalChunks > 1)) {
        const { data: parts, error: partsErr } = await supabase
          .from('backup_snapshots')
          .select('chunk_index, data')
          .eq('backup_id', snapshot.id)
          .order('chunk_index', { ascending: true });

        if (!partsErr && parts && parts.length > 0) {
          const fullJson = parts
            .map(p => {
              if (p.data && typeof p.data === 'object' && p.data.chunk_text) {
                return p.data.chunk_text;
              }
              if (typeof p.data === 'string') return p.data;
              return '';
            })
            .join('');

          if (fullJson.length > 0) {
            return fullJson;
          }
        }
      }

      // 2. Single row lookup
      const { data, error } = await supabase
        .from('backup_snapshots')
        .select('data')
        .eq('id', snapshot.id)
        .maybeSingle();

      if (data && data.data) {
        return typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2);
      }
    }
  }

  // Otherwise, load ordered chunks from Firestore subcollection
  try {
    const chunksColRef = collection(db, '_system_backups', snapshot.id, 'chunks');
    const q = query(chunksColRef, orderBy('index', 'asc'));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const parts: string[] = [];
      snap.docs.forEach(d => {
        const cData = d.data();
        if (typeof cData.data === 'string') {
          parts.push(cData.data);
        }
      });
      const fullJson = parts.join('');
      if (fullJson.length > 0) {
        return fullJson;
      }
    }
  } catch (err) {
    console.error(`Error loading chunks for cloud snapshot ${snapshot.id}:`, err);
    throw new Error(`Falha ao carregar os fragmentos do snapshot na nuvem: ${(err as any).message || err}`);
  }

  // Fallback to payloadJson if present
  if (snapshot.payloadJson && snapshot.payloadJson.trim() !== '' && snapshot.payloadJson !== '{}') {
    return snapshot.payloadJson;
  }

  throw new Error('O snapshot selecionado não contém conteúdo de dados válido ou seus fragmentos estão inacessíveis.');
};

/**
 * Create a secure online cloud snapshot ("Plano B") stored in Firestore `_system_backups` collection or Supabase `backup_snapshots`
 * Automatically chunks large payloads across subdocuments or chunk rows to strictly respect size & timeout limits.
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
  const { counts, jsonContent, fileSizeFormatted, sizeBytes, payload } = await fetchCurrentDatabasePayload(userInfo);
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

  const activeAuthUser = getActiveDbProvider() === 'supabase' ? await getCurrentActiveAuthUser() : null;
  const userEmailResolved = userInfo?.email || activeAuthUser?.email || auth.currentUser?.email || 'sistema@stocckrma.local';
  const userNameResolved = userInfo?.name || activeAuthUser?.name || auth.currentUser?.displayName || (triggerType === 'manual' ? 'Operador' : 'Robô Automático');
  const userUidResolved = activeAuthUser?.uid || auth.currentUser?.uid || '';

  // ================= SUPABASE SNAPSHOT SAVE =================
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const sanitizedCreatedBy = {
        uid: userUidResolved,
        email: userEmailResolved,
        name: userNameResolved
      };

      const totalItems = Number(counts.products || 0) + Number(counts.triageUnits || 0) + Number(counts.dailyInflows || 0) + Number(counts.cases || 0);

      // Determine if payload requires chunking (> 300 KB) to prevent Statement Timeout 57014
      const CHUNK_SIZE = 300 * 1024;
      const isChunked = jsonContent.length > CHUNK_SIZE;

      if (isChunked) {
        const chunks: string[] = [];
        for (let i = 0; i < jsonContent.length; i += CHUNK_SIZE) {
          chunks.push(jsonContent.substring(i, i + CHUNK_SIZE));
        }

        // 1. Save master metadata record (store collections counts in metadata so listing displays exact counts!)
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

        // 2. Save individual chunk rows (1-indexed chunk_index)
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
        // Single row insert for lightweight snapshots
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

      // Save last backup markers locally
      localStorage.setItem('stocckrma_last_cloud_backup_date', now.toISOString());
      localStorage.setItem('stocckrma_last_cloud_backup_id', snapshotId);
      localStorage.setItem('stocckrma_last_cloud_backup_stats', JSON.stringify(counts));

      if (triggerType !== 'manual') {
        try {
          const config = await loadAutoBackupConfig();
          if (!config.lastRun) config.lastRun = {};
          config.lastRun[triggerType] = now.toISOString();
          config.lastBackupStatus = `Último backup em nuvem (${triggerLabels[triggerType]}) realizado com sucesso em ${formatBrDate(now)}`;
          await saveAutoBackupConfig(config);
        } catch (cfgErr) {
          console.warn('Could not update auto backup config lastRun:', cfgErr);
        }
      }

      try {
        await createAuditLog(
          'CLOUD_BACKUP_CREATED',
          `Criou Snapshot Online de contingência (${defaultTitle}) [${triggerLabels[triggerType]}]. Total: ${counts.products} produtos base, ${counts.triageUnits} unidades físicas no Supabase.`
        );
      } catch (logErr) {
        console.warn('Audit log error on cloud backup create:', logErr);
      }

      return {
        success: true,
        snapshot: snapshotRecord
      };
    }
  }

  // ================= FIRESTORE SNAPSHOT SAVE =================
  const snapshotDocRef = doc(db, '_system_backups', snapshotId);

  // Determine if payload requires chunking (> 350 KB)
  const isChunked = jsonContent.length > SNAPSHOT_CHUNK_SIZE;
  const chunks: string[] = [];

  if (isChunked) {
    for (let i = 0; i < jsonContent.length; i += SNAPSHOT_CHUNK_SIZE) {
      chunks.push(jsonContent.substring(i, i + SNAPSHOT_CHUNK_SIZE));
    }
  }

  const snapshotRecord: CloudBackupRecord = {
    id: snapshotId,
    title: defaultTitle,
    triggerType,
    triggerLabel: triggerLabels[triggerType],
    createdAt: now.toISOString(),
    createdAtFormatted: formatBrDate(now),
    createdBy: {
      uid: userUidResolved,
      email: userEmailResolved,
      name: userNameResolved
    },
    collectionsCount: counts,
    fileSizeBytes: sizeBytes,
    fileSizeFormatted,
    integrityHash: hash,
    payloadJson: isChunked ? '' : jsonContent, // Keep main doc lightweight if chunked
    chunked: isChunked,
    totalChunks: isChunked ? chunks.length : 1,
    status: 'active'
  };

  // 1. Save main metadata doc
  await setDoc(snapshotDocRef, snapshotRecord);

  // 2. If chunked, write fragments to subcollection
  if (isChunked && chunks.length > 0) {
    const chunkObjects = chunks.map((data, index) => ({ index, data, size: data.length }));
    for (const chunkBatch of chunkArray(chunkObjects, 350)) {
      const batch = writeBatch(db);
      chunkBatch.forEach(c => {
        const chunkDocRef = doc(db, '_system_backups', snapshotId, 'chunks', `chunk_${String(c.index).padStart(4, '0')}`);
        batch.set(chunkDocRef, c);
      });
      await batch.commit();
    }
  }

  // Save last backup markers locally
  localStorage.setItem('stocckrma_last_cloud_backup_date', now.toISOString());
  localStorage.setItem('stocckrma_last_cloud_backup_id', snapshotId);
  localStorage.setItem('stocckrma_last_cloud_backup_stats', JSON.stringify(counts));

  // Update schedule lastRun if applicable
  if (triggerType !== 'manual') {
    try {
      const config = await loadAutoBackupConfig();
      if (!config.lastRun) config.lastRun = {};
      config.lastRun[triggerType] = now.toISOString();
      config.lastBackupStatus = `Último backup em nuvem (${triggerLabels[triggerType]}) realizado com sucesso em ${formatBrDate(now)}`;
      await saveAutoBackupConfig(config);
    } catch (cfgErr) {
      console.warn('Could not update auto backup config lastRun:', cfgErr);
    }
  }

  try {
    await createAuditLog(
      'CLOUD_BACKUP_CREATED',
      `Criou Snapshot Online de contingência (${defaultTitle}) [${triggerLabels[triggerType]}]. Total: ${counts.products} produtos base, ${counts.triageUnits} unidades físicas. Fragmentos: ${snapshotRecord.totalChunks || 1}. Hash SHA-256: ${hash.substring(0, 12)}...`
    );
  } catch (logErr) {
    console.warn('Audit log error on cloud backup create:', logErr);
  }

  return {
    success: true,
    snapshot: snapshotRecord
  };
};

/**
 * Real-time subscription to cloud backups list
 */
export const subscribeToCloudBackups = (
  callback: (backups: CloudBackupRecord[]) => void
) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const fetchList = async () => {
        try {
          const { data, error } = await supabase
            .from('backup_snapshots')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

          if (error) {
            console.warn('Error fetching Supabase backup_snapshots:', error);
            return;
          }

          if (data) {
            // Filter in memory to guarantee no chunk fragments or config records are shown
            const masterRecords = data.filter(r => 
              r.id &&
              r.id !== 'config_backup_schedule' &&
              !r.id.includes('_chunk_') &&
              !r.id.includes('_part_') &&
              (r.chunk_index === null || r.chunk_index === undefined || r.chunk_index === 0)
            );

            const list: CloudBackupRecord[] = masterRecords.map(r => {
              const p = r.data || {};
              const counts = p.metadata?.collectionsCount || { 
                products: Number(r.total_items) || 0, 
                triageUnits: 0, 
                dailyInflows: 0, 
                cases: 0, 
                logs: 0 
              };

              const triggerLabels: Record<string, string> = {
                manual: 'Manual',
                hourly: 'Por Hora',
                end_of_day: 'Fim do Expediente',
                weekly: 'Semanal',
                monthly: 'Mensal'
              };

              const isChunked = Boolean(r.total_chunks && r.total_chunks > 1);

              return {
                id: r.id,
                title: r.filename ? `Snapshot - ${r.filename}` : `Snapshot - ${r.id}`,
                triggerType: (r.trigger_type as BackupTriggerType) || 'manual',
                triggerLabel: triggerLabels[r.trigger_type] || 'Manual',
                createdAt: r.created_at || '',
                createdAtFormatted: r.created_at ? formatBrDate(new Date(r.created_at)) : '',
                createdBy: r.created_by || { name: 'Sistema' },
                collectionsCount: counts,
                fileSizeBytes: r.size_bytes || 0,
                fileSizeFormatted: r.file_size_formatted || '0 KB',
                integrityHash: r.checksum || '',
                payloadJson: isChunked ? '' : (typeof p === 'object' && Object.keys(p).length > 0 ? JSON.stringify(p) : ''),
                chunked: isChunked,
                totalChunks: r.total_chunks || 1,
                status: 'active'
              };
            });
            callback(list);
          }
        } catch (err) {
          console.warn('Error in fetchList for Supabase backup_snapshots:', err);
        }
      };

      fetchList();
      const channel = supabase.channel('realtime_backups')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'backup_snapshots' }, () => {
          fetchList();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  const backupsColRef = collection(db, '_system_backups');
  const q = query(backupsColRef, orderBy('createdAt', 'desc'), limit(60));

  return onSnapshot(q, (snapshot) => {
    const list: CloudBackupRecord[] = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        title: data.title || 'Ponto de Restauração Online',
        triggerType: data.triggerType || 'manual',
        triggerLabel: data.triggerLabel || 'Manual',
        createdAt: data.createdAt || '',
        createdAtFormatted: data.createdAtFormatted || '',
        createdBy: data.createdBy || { name: 'Sistema' },
        collectionsCount: data.collectionsCount || { products: 0, triageUnits: 0, dailyInflows: 0, cases: 0, logs: 0 },
        fileSizeBytes: data.fileSizeBytes || 0,
        fileSizeFormatted: data.fileSizeFormatted || '0 KB',
        integrityHash: data.integrityHash || '',
        payloadJson: data.payloadJson || '',
        chunked: Boolean(data.chunked),
        totalChunks: data.totalChunks || 1,
        status: data.status || 'active'
      };
    });
    callback(list);
  }, (err) => {
    console.error('Error subscribing to _system_backups collection:', err);
  });
};

/**
 * Delete a specific Cloud Snapshot from Supabase or Firestore
 */
export const deleteCloudSnapshot = async (snapshotId: string): Promise<boolean> => {
  if (getActiveDbProvider() === 'supabase') {
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
      return true;
    }
  } else {
    await deleteDoc(doc(db, '_system_backups', snapshotId));
    return true;
  }
  return false;
};

/**
 * Load Auto-Backup schedule settings from Supabase/Firestore/LocalStorage
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

  if (getActiveDbProvider() === 'supabase') {
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
  }

  try {
    const configDocRef = doc(db, '_system_config', 'backup_schedule');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const remoteConfig = snap.data() as AutoBackupScheduleConfig;
      localStorage.setItem('stocckrma_auto_backup_config', JSON.stringify(remoteConfig));
      return { ...DEFAULT_AUTO_BACKUP_CONFIG, ...remoteConfig };
    }
  } catch (e) {
    console.warn('Could not read remote backup config from Firestore:', e);
  }

  return baseConfig;
};

/**
 * Save Auto-Backup schedule settings to Supabase/Firestore & LocalStorage
 */
export const saveAutoBackupConfig = async (
  config: AutoBackupScheduleConfig
): Promise<void> => {
  localStorage.setItem('stocckrma_auto_backup_config', JSON.stringify(config));

  if (getActiveDbProvider() === 'supabase') {
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
    return;
  }

  try {
    const configDocRef = doc(db, '_system_config', 'backup_schedule');
    await setDoc(configDocRef, config, { merge: true });
  } catch (e) {
    console.warn('Could not save auto backup config to Firestore:', e);
  }
};

/**
 * Download a specific CloudBackupRecord as a JSON file to local computer
 * Loads full content even if chunked across subcollections
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
          logs: Array.isArray(parsed.logs) ? parsed.logs.length : 0
        }
      },
      data: {
        products: Array.isArray(parsed.products) ? parsed.products : [],
        triageUnits: Array.isArray(parsed.triageUnits) ? parsed.triageUnits : [],
        dailyInflows: Array.isArray(parsed.dailyInflows) ? parsed.dailyInflows : [],
        cases: Array.isArray(parsed.cases) ? parsed.cases : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      }
    };
  } else {
    return {
      isValid: false,
      error: 'O arquivo JSON não contém uma estrutura de backup reconhecida do StocckRMA (chaves "metadata" e "data" ausentes).'
    };
  }

  const productsList = Array.isArray(payload.data?.products) ? payload.data.products : [];
  const unitsList = Array.isArray(payload.data?.triageUnits) ? payload.data.triageUnits : [];
  const inflowsList = Array.isArray(payload.data?.dailyInflows) ? payload.data.dailyInflows : [];
  const casesList = Array.isArray(payload.data?.cases) ? payload.data.cases : [];
  const logsList = Array.isArray(payload.data?.logs) ? payload.data.logs : [];

  if (productsList.length === 0 && unitsList.length === 0 && inflowsList.length === 0) {
    return {
      isValid: false,
      error: 'O arquivo de backup não contém nenhum produto, unidade física ou lançamento de fluxo diário válido.'
    };
  }

  return {
    isValid: true,
    metadata: payload.metadata,
    payload,
    stats: {
      productsCount: productsList.length,
      triageUnitsCount: unitsList.length,
      dailyInflowsCount: inflowsList.length,
      casesCount: casesList.length,
      logsCount: logsList.length,
      fileSizeBytes: fileSizeBytes || new Blob([fileContent]).size
    }
  };
};

/**
 * Restore database collections from a validated SystemBackupPayload
 * Supports both Supabase (PostgreSQL) and Firestore
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
  const { data } = payload;
  const products: BaseProduct[] = Array.isArray(data?.products) ? data.products : [];
  const triageUnits: TriageUnit[] = Array.isArray(data?.triageUnits) ? data.triageUnits : [];
  const dailyInflows: DailyInflowRecord[] = Array.isArray(data?.dailyInflows) ? data.dailyInflows : [];
  const cases: CaseTracking[] = Array.isArray(data?.cases) ? data.cases : [];
  const pendingItems: PendingItem[] = Array.isArray((data as any)?.pendingItems) ? (data as any).pendingItems : [];

  // ===================== SUPABASE RESTORE FLOW =====================
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Cliente Supabase não está configurado. Verifique as credenciais no menu de Banco de Dados.');
    }

    try {
      if (mode === 'replace') {
        onProgress?.('Limpando tabelas do Supabase...', 10);
        await Promise.all([
          supabase.from('products').delete().neq('id', '___all___'),
          supabase.from('triage_units').delete().neq('id', '___all___'),
          supabase.from('daily_inflows').delete().neq('id', '___all___'),
          supabase.from('cases').delete().neq('id', '___all___'),
          supabase.from('pending_items').delete().neq('id', '___all___')
        ]);
      }

      // 1. Restore Products
      if (products.length > 0) {
        onProgress?.(`Restaurando ${products.length} produtos no Supabase...`, 30);
        const mappedProducts = products.map(mapProductToSupabase);
        for (const chunk of chunkArray(mappedProducts, 200)) {
          const { error } = await supabase.from('products').upsert(chunk);
          if (error) throw error;
        }
      }

      // 2. Restore Triage Units
      if (triageUnits.length > 0) {
        onProgress?.(`Restaurando ${triageUnits.length} unidades de triagem/estoque no Supabase...`, 60);
        const mappedUnits = triageUnits.map(mapTriageUnitToSupabase);
        for (const chunk of chunkArray(mappedUnits, 200)) {
          const { error } = await supabase.from('triage_units').upsert(chunk);
          if (error) throw error;
        }
      }

      // 3. Restore Daily Inflows
      if (dailyInflows.length > 0) {
        onProgress?.(`Restaurando ${dailyInflows.length} registros diários no Supabase...`, 80);
        const mappedInflows = dailyInflows.map(mapDailyInflowToSupabase);
        for (const chunk of chunkArray(mappedInflows, 200)) {
          const { error } = await supabase.from('daily_inflows').upsert(chunk);
          if (error) throw error;
        }
      }

      // 4. Restore Cases
      if (cases.length > 0) {
        onProgress?.(`Restaurando ${cases.length} casos no Supabase...`, 90);
        const mappedCases = cases.map(c => ({
          id: c.id,
          code: c.code,
          platform: c.platform,
          created_at: c.createdAt,
          reason: c.reason,
          resolution: c.resolution,
          status: c.status || 'Pendente',
          notes: c.notes || '',
          value: c.value !== undefined ? c.value : null
        }));
        for (const chunk of chunkArray(mappedCases, 200)) {
          const { error } = await supabase.from('cases').upsert(chunk);
          if (error) throw error;
        }
      }

      // 5. Restore Pending items if present
      if (pendingItems.length > 0) {
        const mappedPending = pendingItems.map(mapPendingItemToSupabase);
        for (const chunk of chunkArray(mappedPending, 200)) {
          await supabase.from('pending_items').upsert(chunk);
        }
      }
    } catch (supaErr: any) {
      console.error('Supabase restore error:', supaErr);
      throw new Error(`Erro ao restaurar no Supabase: ${supaErr.message || supaErr}`);
    }

    // Apply settings if available
    if (payload.settings?.enableSpreadsheetImport !== undefined) {
      localStorage.setItem('rmaflow_enable_spreadsheet_import', String(payload.settings.enableSpreadsheetImport));
    }

    localStorage.setItem('base_products_seeded', 'true');
    localStorage.setItem('triage_units_seeded', 'true');
    localStorage.setItem('cases_seeded', 'true');
    localStorage.setItem('daily_inflows_seeded', 'true');

    onProgress?.('Finalizando restauração no Supabase...', 100);

    const modeLabel = mode === 'replace' ? 'Substituição Completa' : 'Mesclagem (Merge)';
    try {
      await createAuditLog(
        'BACKUP_RESTORED',
        `Restaurou backup no Supabase (${modeLabel}). Total: ${products.length} produtos, ${triageUnits.length} unidades em estoque, ${dailyInflows.length} entradas diárias e ${cases.length} casos.`
      );
    } catch (logErr) {
      console.warn('Audit log error:', logErr);
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
  }

  // ===================== FIRESTORE RESTORE FLOW =====================
  const BATCH_SIZE = 350; // Under Firestore limit of 500

  // 1. If REPLACE mode, clear current collections first
  try {
    if (mode === 'replace') {
      onProgress?.('Limpando coleções atuais do Firestore...', 10);
      
      try {
        // Clear products
        const pSnap = await getDocs(collection(db, 'products'));
        for (const chunk of chunkArray(pSnap.docs, BATCH_SIZE)) {
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }

        // Clear triage units
        const uSnap = await getDocs(collection(db, 'triage_units'));
        for (const chunk of chunkArray(uSnap.docs, BATCH_SIZE)) {
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }

        // Clear daily inflows
        const iSnap = await getDocs(collection(db, 'daily_inflows'));
        for (const chunk of chunkArray(iSnap.docs, BATCH_SIZE)) {
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }

        // Clear cases
        const cSnap = await getDocs(collection(db, 'cases'));
        for (const chunk of chunkArray(cSnap.docs, BATCH_SIZE)) {
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (clearErr) {
        console.warn('Could not clear remote Firestore collections:', clearErr);
      }
    }

    // 2. Restore Products
    onProgress?.(`Restaurando ${products.length} produtos do Catálogo Base...`, 30);
    for (const chunk of chunkArray(products, BATCH_SIZE)) {
      const batch = writeBatch(db);
      chunk.forEach(p => {
        const pId = p.id || `bp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const docRef = doc(db, 'products', pId);
        batch.set(docRef, { ...p, id: pId }, { merge: mode === 'merge' });
      });
      await batch.commit();
    }

    // 3. Restore Triage Units (Physical Stock)
    onProgress?.(`Restaurando ${triageUnits.length} unidades do Estoque Físico & Triagem...`, 60);
    for (const chunk of chunkArray(triageUnits, BATCH_SIZE)) {
      const batch = writeBatch(db);
      chunk.forEach(u => {
        const uId = u.id || `tr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const docRef = doc(db, 'triage_units', uId);
        batch.set(docRef, { ...u, id: uId }, { merge: mode === 'merge' });
      });
      await batch.commit();
    }

    // 4. Restore Daily Inflows
    onProgress?.(`Restaurando ${dailyInflows.length} registros do Fluxo Diário de Entradas...`, 85);
    for (const chunk of chunkArray(dailyInflows, BATCH_SIZE)) {
      const batch = writeBatch(db);
      chunk.forEach(i => {
        const iId = i.id || `inflow-${i.date || Date.now()}`;
        const docRef = doc(db, 'daily_inflows', iId);
        batch.set(docRef, { ...i, id: iId }, { merge: mode === 'merge' });
      });
      await batch.commit();
    }

    // 5. Restore Cases if any
    if (cases.length > 0) {
      onProgress?.(`Restaurando ${cases.length} casos de garantia...`, 95);
      for (const chunk of chunkArray(cases, BATCH_SIZE)) {
        const batch = writeBatch(db);
        chunk.forEach(c => {
          const cId = c.id || `case-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const docRef = doc(db, 'cases', cId);
          batch.set(docRef, { ...c, id: cId }, { merge: mode === 'merge' });
        });
        await batch.commit();
      }
    }
  } catch (firestoreErr: any) {
    console.error('Firestore write error during backup restore:', firestoreErr);
    const errMsg = firestoreErr?.message || String(firestoreErr);

    if (errMsg.includes('not found') || errMsg.includes('Database') || errMsg.includes('offline')) {
      throw new Error(
        `O Firestore deste projeto não está respondendo (erro: ${errMsg}). ` +
        `Certifique-se de que o Firestore Database foi ativado no Firebase Console para o projeto atual.`
      );
    }
    throw firestoreErr;
  }

  // 6. Apply settings if available
  if (payload.settings?.enableSpreadsheetImport !== undefined) {
    localStorage.setItem(
      'rmaflow_enable_spreadsheet_import', 
      String(payload.settings.enableSpreadsheetImport)
    );
  }

  // Set seed flags to prevent mock initialization over restored data
  localStorage.setItem('base_products_seeded', 'true');
  localStorage.setItem('triage_units_seeded', 'true');
  localStorage.setItem('cases_seeded', 'true');
  localStorage.setItem('daily_inflows_seeded', 'true');

  onProgress?.('Finalizando restauração e gravando log de auditoria...', 100);

  // 7. Audit log record
  const modeLabel = mode === 'replace' ? 'Substituição Completa' : 'Mesclagem (Merge)';
  try {
    await createAuditLog(
      'BACKUP_RESTORED',
      `Restaurou backup no modo ${modeLabel}. Total restaurado: ${products.length} produtos no catálogo, ${triageUnits.length} unidades de estoque/triagem, ${dailyInflows.length} entradas diárias e ${cases.length} casos.`
    );
  } catch (logErr) {
    console.warn('Audit log recording error on backup restore:', logErr);
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
 * Evaluates if hourly, end of day, weekly, or monthly triggers are due.
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
  const currentDayOfWeek = now.getDay(); // 0-6
  const currentDayOfMonth = now.getDate(); // 1-31
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const lastRun = config.lastRun || {};

  // Concurrency Guard: Mutex in localStorage to avoid multiple tabs running simultaneously
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
      return { triggered: true, type: 'hourly', snapshotId: res.snapshot.id };
    }
  }

  // 2. Check End of Day Trigger (e.g. 18:00)
  if (config.endOfDay.enabled && config.endOfDay.time) {
    const [eodHourStr, eodMinStr] = config.endOfDay.time.split(':');
    const eodHour = parseInt(eodHourStr || '18', 10);
    const eodMin = parseInt(eodMinStr || '0', 10);

    const isAfterTarget = currentHour > eodHour || (currentHour === eodHour && currentMinute >= eodMin);
    const lastEodDate = lastRun.endOfDay ? lastRun.endOfDay.split('T')[0] : null;

    if (isAfterTarget && lastEodDate !== todayYmd) {
      localStorage.setItem(mutexKey, String(Date.now()));
      const res = await createCloudSnapshot('end_of_day', undefined, userInfo);
      return { triggered: true, type: 'end_of_day', snapshotId: res.snapshot.id };
    }
  }

  // 3. Check Weekly Trigger (e.g. Friday 18:30)
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
      return { triggered: true, type: 'weekly', snapshotId: res.snapshot.id };
    }
  }

  // 4. Check Monthly Trigger (e.g. Day 1 19:00)
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
      return { triggered: true, type: 'monthly', snapshotId: res.snapshot.id };
    }
  }

  return { triggered: false };
};
