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
  BackupTriggerType
} from '../types';
import { createAuditLog } from './dbService';

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

  const [productsSnap, unitsSnap, inflowsSnap, casesSnap, logsSnap] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'triage_units')),
    getDocs(collection(db, 'daily_inflows')),
    getDocs(collection(db, 'cases')),
    getDocs(query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(1000)))
  ]);

  const products: BaseProduct[] = productsSnap.docs.map(d => ({ ...(d.data() as BaseProduct), id: d.id }));
  const triageUnits: TriageUnit[] = unitsSnap.docs.map(d => ({ ...(d.data() as TriageUnit), id: d.id }));
  const dailyInflows: DailyInflowRecord[] = inflowsSnap.docs.map(d => ({ ...(d.data() as DailyInflowRecord), id: d.id }));
  const cases: CaseTracking[] = casesSnap.docs.map(d => ({ ...(d.data() as CaseTracking), id: d.id }));
  const logs = logsSnap.docs.map(d => ({ ...d.data(), id: d.id }));

  const counts = {
    products: products.length,
    triageUnits: triageUnits.length,
    dailyInflows: dailyInflows.length,
    cases: cases.length,
    logs: logs.length
  };

  const enableSpreadsheetImport = localStorage.getItem('rmaflow_enable_spreadsheet_import') !== 'false';

  const metadata: SystemBackupMetadata = {
    version: BACKUP_SCHEMA_VERSION,
    appName: 'StocckRMA Triagem & Estoque Pro',
    systemIdentifier: APP_IDENTIFIER,
    exportedAt: now.toISOString(),
    exportedAtFormatted: formatBrDate(now),
    exportedBy: {
      uid: auth.currentUser?.uid,
      email: userInfo?.email || auth.currentUser?.email || 'operador@stocckrma.local',
      name: userInfo?.name || auth.currentUser?.displayName || 'Operador Corporativo'
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
      logs
    },
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
 * Seamlessly supports single-document legacy backups and chunked subcollection payloads.
 */
export const fetchCloudSnapshotPayloadJson = async (snapshot: CloudBackupRecord): Promise<string> => {
  // If payloadJson exists, is non-empty, and not marked as chunked
  if (snapshot.payloadJson && snapshot.payloadJson.length > 20 && !snapshot.chunked) {
    return snapshot.payloadJson;
  }

  // Otherwise, load ordered chunks from subcollection
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
 * Create a secure online cloud snapshot ("Plano B") stored in Firestore `_system_backups` collection
 * Automatically chunks large payloads across subdocuments to strictly respect Firestore limits.
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
      uid: auth.currentUser?.uid,
      email: userInfo?.email || auth.currentUser?.email || 'sistema@stocckrma.local',
      name: userInfo?.name || auth.currentUser?.displayName || (triggerType === 'manual' ? 'Operador' : 'Robô Automático')
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
 * Load Auto-Backup schedule settings from Firestore/LocalStorage
 */
export const loadAutoBackupConfig = async (): Promise<AutoBackupScheduleConfig> => {
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

  const localSaved = localStorage.getItem('stocckrma_auto_backup_config');
  if (localSaved) {
    try {
      return { ...DEFAULT_AUTO_BACKUP_CONFIG, ...JSON.parse(localSaved) };
    } catch (e) {
      console.warn('Error parsing local auto backup config:', e);
    }
  }

  return DEFAULT_AUTO_BACKUP_CONFIG;
};

/**
 * Save Auto-Backup schedule settings to Firestore & LocalStorage
 */
export const saveAutoBackupConfig = async (
  config: AutoBackupScheduleConfig
): Promise<void> => {
  localStorage.setItem('stocckrma_auto_backup_config', JSON.stringify(config));
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
 * Restore Firestore collections from a validated SystemBackupPayload
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
  const products = Array.isArray(data?.products) ? data.products : [];
  const triageUnits = Array.isArray(data?.triageUnits) ? data.triageUnits : [];
  const dailyInflows = Array.isArray(data?.dailyInflows) ? data.dailyInflows : [];
  const cases = Array.isArray(data?.cases) ? data.cases : [];

  const BATCH_SIZE = 350; // Under Firestore limit of 500

  // 1. If REPLACE mode, clear current collections first
  if (mode === 'replace') {
    onProgress?.('Limpando coleções atuais do Firestore...', 10);
    
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
