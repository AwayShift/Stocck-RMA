/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import { 
  collection, 
  getDocs, 
  doc, 
  writeBatch,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { 
  BaseProduct, 
  TriageUnit, 
  DailyInflowRecord, 
  CaseTracking, 
  SystemBackupPayload, 
  SystemBackupMetadata,
  BackupValidationResult 
} from '../types';
import { createAuditLog } from './dbService';

const BACKUP_SCHEMA_VERSION = '1.2.0';
const APP_IDENTIFIER = 'stocckrma-pro-flow';

/**
 * Format date for friendly human reading in BR format
 */
const formatBrDate = (date: Date): string => {
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
 * Export full Firestore database state to a secure JSON file downloaded on client PC
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

  // 1. Fetch live data from Firestore collections
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

  // 2. Read local client preferences
  const enableSpreadsheetImport = localStorage.getItem('rmaflow_enable_spreadsheet_import') !== 'false';

  // 3. Build structured backup payload
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

  const backupPayload: SystemBackupPayload = {
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

  // 4. Generate JSON string and Blob
  const jsonContent = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  
  // Calculate size in KB/MB
  const sizeBytes = blob.size;
  const fileSizeFormatted = sizeBytes > 1024 * 1024 
    ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(sizeBytes / 1024).toFixed(1)} KB`;

  // 5. Trigger browser download
  const filename = `Backup_StocckRMA_${formatFilenameTimestamp(now)}.json`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // 6. Save last backup info to localStorage for instant UI display
  localStorage.setItem('stocckrma_last_backup_date', now.toISOString());
  localStorage.setItem('stocckrma_last_backup_filename', filename);
  localStorage.setItem('stocckrma_last_backup_stats', JSON.stringify(counts));

  // 7. Record Corporate Audit Log
  try {
    await createAuditLog(
      'BACKUP_EXPORTED',
      `Exportou cópia de segurança local (${filename}) com ${products.length} produtos, ${triageUnits.length} unidades em estoque e ${dailyInflows.length} registros de fluxo diário. Tamanho: ${fileSizeFormatted}.`
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

  // Check if it's a standard SystemBackupPayload
  let payload: SystemBackupPayload;

  if (parsed.metadata && parsed.data) {
    payload = parsed as SystemBackupPayload;
  } else if (Array.isArray(parsed.products) || Array.isArray(parsed.triageUnits)) {
    // Graceful backward compatibility with direct data exports
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
