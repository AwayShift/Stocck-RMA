/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BaseProduct, TriageUnit, DailyInflowRecord, PendingItem, CaseTracking, UserAccount } from '../types';
import { compressText, decompressText } from './compressionService';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  personalAccessToken?: string;
}

const STORAGE_SUPABASE_CONFIG_KEY = 'stocckrma_supabase_config';
const STORAGE_SUPABASE_PAT_KEY = 'stocckrma_supabase_pat';
const STORAGE_DB_PROVIDER_KEY = 'stocckrma_active_db_provider';

export type DatabaseProvider = 'supabase';

// Default / fallback configurations or environment variables
export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  url: ((import.meta as any).env?.VITE_SUPABASE_URL as string) || '',
  anonKey: ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || '',
  personalAccessToken: ((import.meta as any).env?.VITE_SUPABASE_MANAGEMENT_TOKEN as string) || ''
};

// In-memory runtime cache to guarantee resilience even if browser storage is blocked/sandboxed
let inMemorySupabasePat: string = '';

export const getSupabaseManagementToken = (): string => {
  try {
    if (inMemorySupabasePat && inMemorySupabasePat.trim()) {
      return inMemorySupabasePat.trim();
    }
    const savedPat = localStorage.getItem(STORAGE_SUPABASE_PAT_KEY);
    if (savedPat && savedPat.trim()) {
      inMemorySupabasePat = savedPat.trim();
      return inMemorySupabasePat;
    }
    const sessionPat = sessionStorage.getItem(STORAGE_SUPABASE_PAT_KEY);
    if (sessionPat && sessionPat.trim()) {
      inMemorySupabasePat = sessionPat.trim();
      return inMemorySupabasePat;
    }
    const config = getSupabaseConfig();
    if (config.personalAccessToken && config.personalAccessToken.trim()) {
      inMemorySupabasePat = config.personalAccessToken.trim();
      return inMemorySupabasePat;
    }
    const envToken = ((import.meta as any).env?.VITE_SUPABASE_MANAGEMENT_TOKEN as string) || '';
    if (envToken && envToken.trim()) {
      inMemorySupabasePat = envToken.trim();
      return inMemorySupabasePat;
    }
  } catch (err) {
    console.error('Error loading Supabase PAT:', err);
  }
  return '';
};

export const saveSupabaseManagementToken = (token: string): void => {
  try {
    const clean = token.trim();
    inMemorySupabasePat = clean;

    if (clean) {
      localStorage.setItem(STORAGE_SUPABASE_PAT_KEY, clean);
      try {
        sessionStorage.setItem(STORAGE_SUPABASE_PAT_KEY, clean);
      } catch {}
      
      // Also save in SupabaseConfig so it is retained across all components
      const config = getSupabaseConfig();
      config.personalAccessToken = clean;
      saveSupabaseConfig(config);
      
      window.dispatchEvent(new CustomEvent('supabase-pat-changed', { detail: { token: clean } }));

      // Persist to central cloud database immediately
      import('./integrationsConfigService').then(({ persistSystemIntegrationsToCloud }) => {
        persistSystemIntegrationsToCloud({ supabasePat: clean }).catch(() => {});
      }).catch(() => {});
    } else {
      // Explicit removal
      localStorage.removeItem(STORAGE_SUPABASE_PAT_KEY);
      try {
        sessionStorage.removeItem(STORAGE_SUPABASE_PAT_KEY);
      } catch {}
      const config = getSupabaseConfig();
      if (config.personalAccessToken) {
        delete config.personalAccessToken;
        saveSupabaseConfig(config);
      }
      window.dispatchEvent(new CustomEvent('supabase-pat-changed', { detail: { token: '' } }));
    }
  } catch (err) {
    console.error('Error saving Supabase PAT:', err);
  }
};

export const extractSupabaseProjectRef = (url?: string): string => {
  const targetUrl = url || getSupabaseConfig().url;
  if (!targetUrl) return '';
  try {
    const parsed = new URL(targetUrl);
    // e.g. "abcdefghijk.supabase.co" -> "abcdefghijk"
    const hostParts = parsed.hostname.split('.');
    if (hostParts.length > 0 && hostParts[0] !== 'localhost') {
      return hostParts[0];
    }
  } catch (e) {
    // If not a full URL, check for standard supabase format
    const match = targetUrl.match(/https?:\/\/([^.]+)\.supabase\.(co|in|net)/);
    if (match && match[1]) return match[1];
  }
  return '';
};

import { 
  getLocalSupabaseCalibration, 
  setLocalSupabaseCalibration, 
  SupabaseCalibration 
} from './integrationsConfigService';

export interface OfficialSupabaseUsage {
  isOfficial: boolean;
  tokenValid: boolean;
  tokenSource?: 'vercel_environment' | 'manual_input' | 'server_environment' | string;
  projectRef: string;
  projectName?: string;
  projectStatus?: string;
  plan?: string;
  region?: string;
  isCalibrated?: boolean;
  calibratedAt?: string;
  egressGb: string;
  egressRawBytes: number;
  egressLimitGb: string;
  egressPercent: number;
  hasOfficialBilling?: boolean;
  databaseSizeGb: string;
  databaseSizeRawBytes: number;
  databaseSizeLimitGb: string;
  databaseSizePercent: number;
  logIngestionGb: string;
  logIngestionRawBytes: number;
  logIngestionLimitGb: string;
  logIngestionPercent: number;
  logQueryGb: string;
  logQueryLimitGb: string;
  logQueryPercent: number;
  storageSizeGb: string;
  storageSizeRawBytes: number;
  storageLimitGb: string;
  storagePercent: number;
  storageObjectsCount?: number;
  mau: number;
  mauLimit: number;
  mauPercent: number;
  tables?: Array<{
    tableName: string;
    schemaName: string;
    sizePretty: string;
    bytes: number;
  }>;
  cachedEgressGb: string;
  realtimePeakConnections: number;
  realtimePeakLimit: number;
  realtimeMessages: number;
  realtimeMessagesLimit: string;
  edgeFunctionInvocations: number;
  edgeFunctionLimit: string;
  ssoUsers: number;
  imageTransformations: number;
  billingCycleStart?: string;
  billingCycleEnd?: string;
  daysRemainingInCycle?: number;
  estimatedCostUsd?: number;
  rawResponse?: any;
  error?: string;
}

export const fetchOfficialSupabaseUsage = async (
  customProjectRef?: string,
  customToken?: string,
  customCalibration?: SupabaseCalibration | null
): Promise<OfficialSupabaseUsage> => {
  const token = (customToken || getSupabaseManagementToken()).trim();
  const projectRef = (customProjectRef || extractSupabaseProjectRef()).trim();
  const activeCalibration = customCalibration !== undefined ? customCalibration : getLocalSupabaseCalibration();

  let resultJson: any = null;
  let fetchError: string | null = null;

  // 1. Query proxy API route (/api/supabase-usage on Vercel or local Express server)
  try {
    const proxyRes = await fetch('/api/supabase-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        projectRef: projectRef || undefined, 
        token: token || undefined, 
        calibration: activeCalibration || undefined,
        calibratedEgressGb: activeCalibration?.egressGb
      })
    });

    const contentType = proxyRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      resultJson = await proxyRes.json();
    }
  } catch (err: any) {
    fetchError = err?.message || 'Falha ao conectar com o endpoint de métricas (/api/supabase-usage)';
  }



  // If both failed or token was reported invalid
  if (!resultJson || !resultJson.success) {
    const errorMsg = resultJson?.error || fetchError || 'Não foi possível verificar o token ou consultar as métricas do Supabase.';
    const isCalibrated = Boolean(activeCalibration);
    const calEgress = activeCalibration?.egressGb ?? 0;
    const calDb = activeCalibration?.databaseSizeGb ?? 0;
    const calLog = activeCalibration?.logIngestionGb ?? 0;
    const calLogQ = activeCalibration?.logQueryGb ?? 0;
    const calStorage = activeCalibration?.storageSizeGb ?? 0;

    return {
      isOfficial: false,
      tokenValid: false,
      isCalibrated,
      calibratedAt: activeCalibration?.calibratedAt,
      projectRef,
      error: errorMsg,
      egressGb: `${calEgress.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} GB`,
      egressRawBytes: Math.round(calEgress * 1024 * 1024 * 1024),
      egressLimitGb: '5 GB',
      egressPercent: Math.min(100, Math.round((calEgress / 5.0) * 100)),
      databaseSizeGb: `${calDb.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} GB`,
      databaseSizeRawBytes: Math.round(calDb * 1024 * 1024 * 1024),
      databaseSizeLimitGb: '0,5 GB',
      databaseSizePercent: Math.min(100, Math.round((calDb / 0.5) * 100)),
      logIngestionGb: `${calLog.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} GB`,
      logIngestionRawBytes: Math.round(calLog * 1024 * 1024 * 1024),
      logIngestionLimitGb: '1 GB',
      logIngestionPercent: Math.min(100, Math.round((calLog / 1.0) * 100)),
      logQueryGb: `${calLogQ.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} GB`,
      logQueryLimitGb: '100 GB',
      logQueryPercent: Math.min(100, Math.round((calLogQ / 100.0) * 100)),
      storageSizeGb: `${calStorage.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} GB`,
      storageSizeRawBytes: Math.round(calStorage * 1024 * 1024 * 1024),
      storageLimitGb: '1 GB',
      storagePercent: Math.min(100, Math.round((calStorage / 1.0) * 100)),
      mau: 3,
      mauLimit: 50000,
      mauPercent: 1,
      cachedEgressGb: '0 GB',
      realtimePeakConnections: 4,
      realtimePeakLimit: 200,
      realtimeMessages: 0,
      realtimeMessagesLimit: '2M',
      edgeFunctionInvocations: 0,
      edgeFunctionLimit: '500K',
      ssoUsers: 0,
      imageTransformations: 0
    };
  }

  const projectData = resultJson.project || {};
  const isCalibrated = Boolean(activeCalibration && (
    activeCalibration.egressGb !== undefined ||
    activeCalibration.databaseSizeGb !== undefined ||
    activeCalibration.logIngestionGb !== undefined ||
    activeCalibration.storageSizeGb !== undefined
  ));

  // Database size (PostgreSQL)
  let dbSizeBytes = Number(resultJson.dbSizeBytes || 0);
  if (activeCalibration?.databaseSizeGb !== undefined && activeCalibration.databaseSizeGb > 0) {
    dbSizeBytes = Math.round(activeCalibration.databaseSizeGb * 1024 * 1024 * 1024);
  }
  const dbSizeGbVal = dbSizeBytes / (1024 * 1024 * 1024);
  const dbSizeLimitGbVal = 0.5;
  const dbSizePercent = Math.min(100, Math.round((dbSizeGbVal / dbSizeLimitGbVal) * 100));

  // Egress (Transferência de Rede no ciclo)
  let egressBytes = Number(resultJson.egressBytes || 0);
  if (activeCalibration?.egressGb !== undefined && activeCalibration.egressGb >= 0) {
    egressBytes = Math.round(activeCalibration.egressGb * 1024 * 1024 * 1024);
  }
  const egressGbVal = egressBytes / (1024 * 1024 * 1024);
  const egressLimitGbVal = 5.0;
  const egressPercent = Math.min(100, Math.round((egressGbVal / egressLimitGbVal) * 100));

  // Log Ingestion (1 GB limit)
  let logIngestionBytes = Number(resultJson.logIngestionBytes || 0);
  if (activeCalibration?.logIngestionGb !== undefined && activeCalibration.logIngestionGb >= 0) {
    logIngestionBytes = Math.round(activeCalibration.logIngestionGb * 1024 * 1024 * 1024);
  }
  const logIngestionGbVal = logIngestionBytes / (1024 * 1024 * 1024);
  const logIngestionLimitGbVal = 1.0;
  const logIngestionPercent = Math.min(100, Math.round((logIngestionGbVal / logIngestionLimitGbVal) * 100));

  // Log Query (100 GB limit)
  let logQueryBytes = Number(resultJson.logQueryBytes || 0);
  if (activeCalibration?.logQueryGb !== undefined && activeCalibration.logQueryGb >= 0) {
    logQueryBytes = Math.round(activeCalibration.logQueryGb * 1024 * 1024 * 1024);
  }
  const logQueryGbVal = logQueryBytes / (1024 * 1024 * 1024);
  const logQueryLimitGbVal = 100.0;
  const logQueryPercent = Math.min(100, Math.round((logQueryGbVal / logQueryLimitGbVal) * 100));

  // Storage
  let storageBytes = Number(resultJson.storageBytes || 0);
  if (activeCalibration?.storageSizeGb !== undefined && activeCalibration.storageSizeGb >= 0) {
    storageBytes = Math.round(activeCalibration.storageSizeGb * 1024 * 1024 * 1024);
  }
  const storageGbVal = storageBytes / (1024 * 1024 * 1024);
  const storageLimitGbVal = 1.0;
  const storagePercent = storageLimitGbVal > 0 ? Math.min(100, Math.round((storageGbVal / storageLimitGbVal) * 100)) : 0;

  // MAU
  const mauVal = Number(resultJson.authUsersCount || 3);
  const mauLimitVal = 50000;
  const mauPercent = Math.min(100, Math.round((mauVal / mauLimitVal) * 100));

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.max(1, endOfMonth.getDate() - now.getDate());

  const usageResult: OfficialSupabaseUsage = {
    isOfficial: true,
    tokenValid: true,
    tokenSource: resultJson.tokenSource || (token ? 'manual_input' : 'vercel_environment'),
    projectRef: resultJson.projectRef || projectRef,
    projectName: projectData?.name || `Stocck-RMA (${projectRef})`,
    projectStatus: resultJson.projectStatus || projectData?.status || 'Ativo',
    plan: (projectData?.plan || 'Free Plan').replace('_', ' '),
    region: resultJson.region || projectData?.region || 'sa-east-1 (São Paulo)',
    isCalibrated,
    calibratedAt: activeCalibration?.calibratedAt,
    egressGb: egressGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
    egressRawBytes: egressBytes,
    egressLimitGb: `${egressLimitGbVal.toLocaleString('pt-BR')} GB`,
    egressPercent,
    hasOfficialBilling: resultJson.hasOfficialBilling,
    databaseSizeGb: dbSizeGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
    databaseSizeRawBytes: dbSizeBytes,
    databaseSizeLimitGb: `${dbSizeLimitGbVal.toLocaleString('pt-BR')} GB`,
    databaseSizePercent: dbSizePercent,
    logIngestionGb: logIngestionGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
    logIngestionRawBytes: logIngestionBytes,
    logIngestionLimitGb: `${logIngestionLimitGbVal.toLocaleString('pt-BR')} GB`,
    logIngestionPercent,
    logQueryGb: logQueryGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
    logQueryLimitGb: `${logQueryLimitGbVal.toLocaleString('pt-BR')} GB`,
    logQueryPercent,
    storageSizeGb: storageGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
    storageSizeRawBytes: storageBytes,
    storageLimitGb: `${storageLimitGbVal.toLocaleString('pt-BR')} GB`,
    storagePercent,
    storageObjectsCount: resultJson.storageObjectsCount || 0,
    mau: mauVal,
    mauLimit: mauLimitVal,
    mauPercent,
    tables: resultJson.tables || [],
    cachedEgressGb: '0 GB',
    realtimePeakConnections: 4,
    realtimePeakLimit: 200,
    realtimeMessages: 0,
    realtimeMessagesLimit: '2M',
    edgeFunctionInvocations: 0,
    edgeFunctionLimit: '500K',
    ssoUsers: 0,
    imageTransformations: 0,
    daysRemainingInCycle: daysRemaining,
    estimatedCostUsd: 0.00,
    rawResponse: resultJson
  };

  // Cache metrics remotely in the cloud so other devices have access immediately
  import('./integrationsConfigService').then(({ persistSystemIntegrationsToCloud, setLocalCachedSupabaseMetrics }) => {
    setLocalCachedSupabaseMetrics(usageResult);
    persistSystemIntegrationsToCloud({ cachedSupabaseMetrics: usageResult }).catch(() => {});
  }).catch(() => {});

  return usageResult;
};

export const getSupabaseConfig = (): SupabaseConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_SUPABASE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading Supabase config:', err);
  }
  return DEFAULT_SUPABASE_CONFIG;
};

export const saveSupabaseConfig = (config: SupabaseConfig): void => {
  try {
    localStorage.setItem(STORAGE_SUPABASE_CONFIG_KEY, JSON.stringify(config));
    // Reset cached client
    supabaseClientInstance = null;
    window.dispatchEvent(new CustomEvent('supabase-config-changed', { detail: config }));
  } catch (err) {
    console.error('Error saving Supabase config:', err);
  }
};

export const getActiveDbProvider = (): DatabaseProvider => {
  return 'supabase';
};

export const setActiveDbProvider = (provider: DatabaseProvider): void => {
  try {
    localStorage.setItem(STORAGE_DB_PROVIDER_KEY, provider);
    window.dispatchEvent(new CustomEvent('db-provider-changed', { detail: { provider } }));
  } catch (err) {
    console.error('Error saving active DB provider:', err);
  }
};

export const resetSupabaseConfigToDefault = (): void => {
  try {
    localStorage.removeItem(STORAGE_SUPABASE_CONFIG_KEY);
    supabaseClientInstance = null;
    window.dispatchEvent(new CustomEvent('supabase-config-changed', { detail: DEFAULT_SUPABASE_CONFIG }));
  } catch (err) {
    console.error('Error resetting Supabase config:', err);
  }
};

let supabaseClientInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseClientInstance) return supabaseClientInstance;
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }
  try {
    supabaseClientInstance = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    return supabaseClientInstance;
  } catch (err) {
    console.error('Error initializing Supabase client:', err);
    return null;
  }
};

export const testSupabaseConnection = async (config?: SupabaseConfig): Promise<{ 
  success: boolean; 
  connected: boolean; 
  tablesCreated: boolean; 
  message: string 
}> => {
  const targetConfig = config || getSupabaseConfig();
  if (!targetConfig.url || !targetConfig.anonKey) {
    return { 
      success: false, 
      connected: false, 
      tablesCreated: false, 
      message: 'URL ou Chave Anônima (anonKey) do Supabase não configurada.' 
    };
  }
  try {
    const testClient = createClient(targetConfig.url, targetConfig.anonKey);
    // Ping products or health test
    const { error } = await testClient.from('products').select('id').limit(1);
    if (error) {
      const isMissingTable = error.code === 'PGRST116' || 
        error.code === '42P01' || 
        error.message?.includes('relation "products" does not exist') || 
        error.message?.includes('does not exist');

      if (isMissingTable) {
        return { 
          success: true, 
          connected: true,
          tablesCreated: false, 
          message: 'Conectado ao Supabase com sucesso! Porém as tabelas ainda não foram criadas. Execute o Script SQL fornecido no SQL Editor.' 
        };
      }
      return { 
        success: false, 
        connected: false, 
        tablesCreated: false, 
        message: `Erro ao conectar ao Supabase: ${error.message}` 
      };
    }
    return { 
      success: true, 
      connected: true, 
      tablesCreated: true, 
      message: 'Conexão e tabelas validadas com sucesso no Supabase!' 
    };
  } catch (err: any) {
    return { 
      success: false, 
      connected: false, 
      tablesCreated: false, 
      message: `Falha na conexão: ${err?.message || String(err)}` 
    };
  }
};

// SQL Schema generator for users to copy-paste into Supabase SQL Editor
export const SUPABASE_REALTIME_ENABLE_SQL = `-- ========================================================
-- ATIVAR SINCRONIZAÇÃO INSTANTÂNEA REALTIME NO SUPABASE
-- Cole e execute este script no "SQL Editor" do seu Supabase
-- para que qualquer alteração seja transmitida instantaneamente (0ms) via WebSocket!
-- ========================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE triage_units;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_inflows;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_items;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE triage_units REPLICA IDENTITY FULL;
ALTER TABLE daily_inflows REPLICA IDENTITY FULL;
ALTER TABLE pending_items REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
`;

export const SUPABASE_QUICK_PATCH_SQL = `-- ========================================================
-- ATUALIZAÇÃO RÁPIDA DE COLUNAS & REALTIME NO SUPABASE (STOCCKRMA)
-- Execute este script no "SQL Editor" do seu painel Supabase
-- para habilitar colunas nativas e sincronização instantânea WebSocket.
-- ========================================================

ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS exclude_from_daily_count BOOLEAN DEFAULT FALSE;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS pending_registration_number TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS pending_item_id TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS linked_unit_id TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS linked_unit_tracking_code TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS transferred_to_stock BOOLEAN DEFAULT FALSE;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS transferred_unit_id TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS destination_sector_suggested TEXT;
CREATE INDEX IF NOT EXISTS idx_pending_items_reg ON pending_items(registration_number);
CREATE INDEX IF NOT EXISTS idx_triage_units_pending_reg ON triage_units(pending_registration_number);

-- Habilitar transmissão instantânea via Supabase Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE triage_units;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_inflows;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_items;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE triage_units REPLICA IDENTITY FULL;
ALTER TABLE daily_inflows REPLICA IDENTITY FULL;
ALTER TABLE pending_items REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
`;

export const SUPABASE_SQL_SCHEMA = `-- ========================================================
-- STOCCKRMA PRO FLOW - ESQUEMA DE BANCO DE DADOS POSTGRESQL
-- Cole este script no "SQL Editor" do seu painel Supabase
-- e clique em "RUN" para criar ou atualizar todas as tabelas.
-- ========================================================

-- 1. Catálogo Base de Produtos
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  voltage TEXT DEFAULT 'Bivolt',
  description TEXT,
  image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  images_product JSONB DEFAULT '[]'::jsonb,
  images_box JSONB DEFAULT '[]'::jsonb,
  images_accessories JSONB DEFAULT '[]'::jsonb,
  accessories TEXT,
  brand TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir colunas adicionais para products caso a tabela já exista
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images_product JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images_box JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images_accessories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS accessories TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS voltage TEXT DEFAULT 'Bivolt';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- 2. Estoque Físico e Triagens de RMA
CREATE TABLE IF NOT EXISTS triage_units (
  id TEXT PRIMARY KEY,
  tracking_code TEXT,
  serial_number TEXT,
  order_number TEXT,
  base_product_id TEXT,
  base_product_name TEXT,
  base_product_sku TEXT,
  base_product_voltage TEXT,
  platform TEXT,
  customer_reason TEXT,
  device_status TEXT,
  package_status TEXT,
  accessories_inclusion TEXT,
  destination_sector TEXT,
  notes TEXT,
  photos_product JSONB DEFAULT '[]'::jsonb,
  photos_box JSONB DEFAULT '[]'::jsonb,
  photos_accessories JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'Estoque',
  checkout_date TIMESTAMPTZ,
  source TEXT,
  is_migration BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir compatibilidade e colunas adicionais em triage_units já existentes ANTES de criar índices
ALTER TABLE triage_units ALTER COLUMN tracking_code DROP NOT NULL;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS base_product_id TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS base_product_name TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS base_product_sku TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS base_product_voltage TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS customer_reason TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS device_status TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS package_status TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS accessories_inclusion TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS destination_sector TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS photos_product JSONB DEFAULT '[]'::jsonb;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS photos_box JSONB DEFAULT '[]'::jsonb;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS photos_accessories JSONB DEFAULT '[]'::jsonb;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Estoque';
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS checkout_date TIMESTAMPTZ;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS is_migration BOOLEAN DEFAULT FALSE;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS exclude_from_daily_count BOOLEAN DEFAULT FALSE;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS pending_registration_number TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS pending_item_id TEXT;
ALTER TABLE triage_units ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_triage_units_status ON triage_units(status);
CREATE INDEX IF NOT EXISTS idx_triage_units_sector ON triage_units(destination_sector);
CREATE INDEX IF NOT EXISTS idx_triage_units_tracking ON triage_units(tracking_code);
CREATE INDEX IF NOT EXISTS idx_triage_units_order ON triage_units(order_number);
CREATE INDEX IF NOT EXISTS idx_triage_units_sku ON triage_units(base_product_sku);
CREATE INDEX IF NOT EXISTS idx_triage_units_pending_reg ON triage_units(pending_registration_number);

-- 3. Histórico de Entradas / Fluxo Diário
CREATE TABLE IF NOT EXISTS daily_inflows (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  rma INT DEFAULT 0,
  estoque INT DEFAULT 0,
  openbox INT DEFAULT 0,
  es INT DEFAULT 0,
  total_dia INT DEFAULT 0,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS rma INT DEFAULT 0;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS estoque INT DEFAULT 0;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS openbox INT DEFAULT 0;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS es INT DEFAULT 0;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS total_dia INT DEFAULT 0;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE daily_inflows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_daily_inflows_date ON daily_inflows(date);

-- 4. Entradas Pendentes
CREATE TABLE IF NOT EXISTS pending_items (
  id TEXT PRIMARY KEY,
  sku TEXT,
  product_name TEXT,
  voltage TEXT,
  serial_number TEXT,
  tracking_code TEXT,
  order_number TEXT,
  platform TEXT,
  pending_reason TEXT,
  detailed_notes TEXT,
  status TEXT DEFAULT 'Pendente',
  photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by JSONB,
  resolved_at TIMESTAMPTZ,
  transferred_to_stock BOOLEAN DEFAULT FALSE,
  transferred_unit_id TEXT,
  destination_sector_suggested TEXT
);

ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS voltage TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS pending_reason TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS detailed_notes TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pendente';
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Média';
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS created_by JSONB;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS transferred_to_stock BOOLEAN DEFAULT FALSE;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS transferred_unit_id TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS destination_sector_suggested TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS linked_unit_id TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS linked_unit_tracking_code TEXT;
ALTER TABLE pending_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pending_items_sku ON pending_items(sku);
CREATE INDEX IF NOT EXISTS idx_pending_items_status ON pending_items(status);
CREATE INDEX IF NOT EXISTS idx_pending_items_tracking ON pending_items(tracking_code);
CREATE INDEX IF NOT EXISTS idx_pending_items_order ON pending_items(order_number);
CREATE INDEX IF NOT EXISTS idx_pending_items_reg ON pending_items(registration_number);

-- 5. Casos e Rastreamento
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  resolution TEXT,
  status TEXT DEFAULT 'Pendente',
  value NUMERIC,
  notes TEXT
);

ALTER TABLE cases ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pendente';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS value NUMERIC;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS notes TEXT;

-- 6. Auditoria de Ações
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();

-- 7. Snapshots e Histórico de Backup
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY,
  backup_id TEXT,
  filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by JSONB,
  trigger_type TEXT,
  checksum TEXT,
  total_items INT,
  file_size_formatted TEXT,
  size_bytes BIGINT,
  chunk_index INT DEFAULT 0,
  total_chunks INT DEFAULT 1,
  data JSONB
);

-- Garantir colunas caso a tabela já tenha sido criada anteriormente
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS backup_id TEXT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS created_by JSONB;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS trigger_type TEXT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS checksum TEXT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS total_items INT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS file_size_formatted TEXT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS chunk_index INT DEFAULT 0;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS total_chunks INT DEFAULT 1;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE backup_snapshots ALTER COLUMN data DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_backup_id ON backup_snapshots(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_chunk_index ON backup_snapshots(chunk_index);

-- 8. Perfis e Papéis de Usuários (Sincronizado com Autenticação do Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'operator',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'operator';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 9. Storage Bucket para Imagens (Limite 3MB, Formato WebP)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  3145728, -- 3MB exatos em bytes
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

-- 10. Funções RPC de Agregação Matemática (Processamento 100% no PostgreSQL)
CREATE OR REPLACE FUNCTION get_stock_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_stock INT;
  v_rma_stock INT;
  v_openbox_stock INT;
  v_es_stock INT;
  v_total_products INT;
  v_pending_count INT;
BEGIN
  SELECT COUNT(*) INTO v_total_products FROM products;
  SELECT COUNT(*) INTO v_total_stock FROM triage_units WHERE status = 'Estoque';
  SELECT COUNT(*) INTO v_rma_stock FROM triage_units WHERE status = 'Estoque' AND destination_sector = 'RMA';
  SELECT COUNT(*) INTO v_openbox_stock FROM triage_units WHERE status = 'Estoque' AND destination_sector = 'Openbox';
  SELECT COUNT(*) INTO v_es_stock FROM triage_units WHERE status = 'Estoque' AND destination_sector = 'E.S';
  SELECT COUNT(*) INTO v_pending_count FROM pending_items WHERE status = 'Pendente';

  RETURN jsonb_build_object(
    'total_products', v_total_products,
    'total_stock', v_total_stock,
    'rma_stock', v_rma_stock,
    'openbox_stock', v_openbox_stock,
    'es_stock', v_es_stock,
    'pending_items', v_pending_count
  );
END;
$$;

-- Desativar ou configurar políticas de acesso aberto para a chave Anon Key
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_inflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access products" ON products;
CREATE POLICY "Public access products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access triage_units" ON triage_units;
CREATE POLICY "Public access triage_units" ON triage_units FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access daily_inflows" ON daily_inflows;
CREATE POLICY "Public access daily_inflows" ON daily_inflows FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access pending_items" ON pending_items;
CREATE POLICY "Public access pending_items" ON pending_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access cases" ON cases;
CREATE POLICY "Public access cases" ON cases FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access audit_logs" ON audit_logs;
CREATE POLICY "Public access audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access backup_snapshots" ON backup_snapshots;
CREATE POLICY "Public access backup_snapshots" ON backup_snapshots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access users" ON users;
CREATE POLICY "Public access users" ON users FOR ALL USING (true) WITH CHECK (true);

-- Políticas para o Storage Bucket product-images
DROP POLICY IF EXISTS "Public storage select product-images" ON storage.objects;
CREATE POLICY "Public storage select product-images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public storage insert product-images" ON storage.objects;
CREATE POLICY "Public storage insert product-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public storage update product-images" ON storage.objects;
CREATE POLICY "Public storage update product-images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public storage delete product-images" ON storage.objects;
CREATE POLICY "Public storage delete product-images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images');

-- 11. Habilitação de Realtime Instantâneo (WebSocket broadcast entre abas e dispositivos)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE triage_units;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_inflows;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_items;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE triage_units REPLICA IDENTITY FULL;
ALTER TABLE daily_inflows REPLICA IDENTITY FULL;
ALTER TABLE pending_items REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
`;

export function isValidUUID(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Generates a valid UUID v4 compliant string
 * Ensures universal compatibility with both UUID and TEXT columns in PostgreSQL
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper conversion functions between StocckRMA App Types and Supabase Postgres Rows
// Long text fields are transparently compressed/decompressed with LZ-String to save Egress.

export const mapProductToSupabase = (p: BaseProduct) => {
  const cleanId = (p.id && p.id.trim()) ? p.id.trim() : generateUUID();
  const now = new Date().toISOString();
  return {
    id: cleanId,
    name: p.name || 'Produto Sem Nome',
    sku: (p.sku || '').trim().toUpperCase(),
    voltage: p.voltage || 'Bivolt',
    description: compressText(p.description || ''),
    image_url: p.imageUrl || '',
    images: Array.isArray(p.images) ? p.images : (p.imageUrl ? [p.imageUrl] : []),
    images_product: Array.isArray(p.imagesProduct) ? p.imagesProduct : [],
    images_box: Array.isArray(p.imagesBox) ? p.imagesBox : [],
    images_accessories: Array.isArray(p.imagesAccessories) ? p.imagesAccessories : [],
    accessories: compressText(p.accessories || ''),
    brand: p.brand || '',
    category: p.category || '',
    created_at: p.createdAt || now,
    updated_at: p.updatedAt || now
  };
};

export const mapSupabaseToProduct = (r: any): BaseProduct => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  voltage: r.voltage || 'Bivolt',
  description: decompressText(r.description || ''),
  imageUrl: r.image_url || r.imageUrl || '',
  images: Array.isArray(r.images) ? r.images : [],
  imagesProduct: Array.isArray(r.images_product || r.imagesProduct) ? (r.images_product || r.imagesProduct) : [],
  imagesBox: Array.isArray(r.images_box || r.imagesBox) ? (r.images_box || r.imagesBox) : [],
  imagesAccessories: Array.isArray(r.images_accessories || r.imagesAccessories) ? (r.images_accessories || r.imagesAccessories) : [],
  accessories: decompressText(r.accessories || ''),
  brand: r.brand || '',
  category: r.category || '',
  createdAt: r.created_at || r.createdAt,
  updatedAt: r.updated_at || r.updatedAt
});

// Dynamic schema feature detection & persistent fallbacks to prevent HTTP 400 Bad Request errors
const STORAGE_FEAT_EXCLUDE_DAILY_COL = 'stocckrma_feat_exclude_daily_col';
let memoryHasExcludeCol: boolean | null = null;

export const getHasExcludeDailyCol = (): boolean | null => {
  if (memoryHasExcludeCol !== null) return memoryHasExcludeCol;
  try {
    const val = localStorage.getItem(STORAGE_FEAT_EXCLUDE_DAILY_COL);
    if (val === 'true') memoryHasExcludeCol = true;
    else if (val === 'false') memoryHasExcludeCol = false;
  } catch {}
  return memoryHasExcludeCol;
};

export const setHasExcludeDailyCol = (supported: boolean): void => {
  memoryHasExcludeCol = supported;
  try {
    localStorage.setItem(STORAGE_FEAT_EXCLUDE_DAILY_COL, supported ? 'true' : 'false');
  } catch {}
};

const STORAGE_FEAT_PENDING_EXTENDED_KEY = 'stocckrma_feat_pending_extended_col';
let memoryHasPendingExtended: boolean | null = null;

export const getHasPendingExtendedCols = (): boolean | null => {
  if (memoryHasPendingExtended !== null) return memoryHasPendingExtended;
  try {
    const val = localStorage.getItem(STORAGE_FEAT_PENDING_EXTENDED_KEY);
    if (val === 'true') memoryHasPendingExtended = true;
    else if (val === 'false') memoryHasPendingExtended = false;
  } catch {}
  return memoryHasPendingExtended;
};

export const setHasPendingExtendedCols = (supported: boolean): void => {
  memoryHasPendingExtended = supported;
  try {
    localStorage.setItem(STORAGE_FEAT_PENDING_EXTENDED_KEY, supported ? 'true' : 'false');
  } catch {}
};

const STORAGE_FEAT_TRIAGE_CREATED_BY_COL = 'stocckrma_feat_triage_created_by_col';
let memoryHasTriageCreatedByCol: boolean | null = null;

export const getHasTriageCreatedByCol = (): boolean => {
  if (memoryHasTriageCreatedByCol !== null) return memoryHasTriageCreatedByCol;
  try {
    const val = localStorage.getItem(STORAGE_FEAT_TRIAGE_CREATED_BY_COL);
    if (val === 'true') memoryHasTriageCreatedByCol = true;
    else memoryHasTriageCreatedByCol = false;
  } catch {
    memoryHasTriageCreatedByCol = false;
  }
  return memoryHasTriageCreatedByCol;
};

export const setHasTriageCreatedByCol = (supported: boolean): void => {
  memoryHasTriageCreatedByCol = supported;
  try {
    localStorage.setItem(STORAGE_FEAT_TRIAGE_CREATED_BY_COL, supported ? 'true' : 'false');
  } catch {}
};

const STORAGE_FEAT_PENDING_REGISTRATION_COL = 'stocckrma_feat_pending_registration_col';
let memoryHasPendingRegistrationCol: boolean | null = null;

export const getHasPendingRegistrationCol = (): boolean | null => {
  if (memoryHasPendingRegistrationCol !== null) return memoryHasPendingRegistrationCol;
  try {
    const val = localStorage.getItem(STORAGE_FEAT_PENDING_REGISTRATION_COL);
    if (val === 'true') memoryHasPendingRegistrationCol = true;
    else if (val === 'false') memoryHasPendingRegistrationCol = false;
  } catch {}
  return memoryHasPendingRegistrationCol;
};

export const setHasPendingRegistrationCol = (supported: boolean): void => {
  memoryHasPendingRegistrationCol = supported;
  try {
    localStorage.setItem(STORAGE_FEAT_PENDING_REGISTRATION_COL, supported ? 'true' : 'false');
  } catch {}
};

const STORAGE_FEAT_TRIAGE_PENDING_COLS = 'stocckrma_feat_triage_pending_cols';
let memoryHasTriagePendingCols: boolean | null = null;

export const getHasTriagePendingCols = (): boolean | null => {
  if (memoryHasTriagePendingCols !== null) return memoryHasTriagePendingCols;
  try {
    const val = localStorage.getItem(STORAGE_FEAT_TRIAGE_PENDING_COLS);
    if (val === 'true') memoryHasTriagePendingCols = true;
    else if (val === 'false') memoryHasTriagePendingCols = false;
  } catch {}
  return memoryHasTriagePendingCols;
};

export const setHasTriagePendingCols = (supported: boolean): void => {
  memoryHasTriagePendingCols = supported;
  try {
    localStorage.setItem(STORAGE_FEAT_TRIAGE_PENDING_COLS, supported ? 'true' : 'false');
  } catch {}
};

const STORAGE_FEAT_TRIAGE_TRANSFER_COLS = 'stocckrma_feat_triage_transfer_cols';
let memoryHasTriageTransferCols: boolean | null = null;

export const getHasTriageTransferCols = (): boolean | null => {
  if (memoryHasTriageTransferCols !== null) return memoryHasTriageTransferCols;
  try {
    const val = localStorage.getItem(STORAGE_FEAT_TRIAGE_TRANSFER_COLS);
    if (val === 'true') memoryHasTriageTransferCols = true;
    else if (val === 'false') memoryHasTriageTransferCols = false;
  } catch {}
  return memoryHasTriageTransferCols;
};

export const setHasTriageTransferCols = (supported: boolean): void => {
  memoryHasTriageTransferCols = supported;
  try {
    localStorage.setItem(STORAGE_FEAT_TRIAGE_TRANSFER_COLS, supported ? 'true' : 'false');
  } catch {}
};

export const getTriageColumns = (): string => {
  let cols = 'id, tracking_code, serial_number, order_number, base_product_id, base_product_name, base_product_sku, base_product_voltage, platform, customer_reason, device_status, package_status, accessories_inclusion, destination_sector, notes, photos_product, photos_box, photos_accessories, created_at, updated_at, status, checkout_date, source, is_migration';
  if (getHasExcludeDailyCol() !== false) {
    cols += ', exclude_from_daily_count';
  }
  if (getHasTriageCreatedByCol() === true) {
    cols += ', created_by';
  }
  return cols;
};

export const getPendingColumns = (): string => {
  if (getHasPendingExtendedCols() === false) {
    return 'id, sku, product_name, voltage, serial_number, tracking_code, order_number, platform, pending_reason, detailed_notes, photos, status, priority, created_by, created_at, updated_at';
  }
  return 'id, sku, product_name, voltage, serial_number, tracking_code, order_number, platform, pending_reason, detailed_notes, photos, destination_sector_suggested, status, priority, created_by, transferred_to_stock, transferred_unit_id, created_at, updated_at, resolved_at';
};

export const mapTriageUnitToSupabase = (u: TriageUnit) => {
  const cleanId = (u.id && u.id.trim()) ? u.id.trim() : generateUUID();
  const now = new Date().toISOString();
  let validCreatedAt = u.createdAt;
  if (!validCreatedAt || isNaN(Date.parse(validCreatedAt))) {
    validCreatedAt = now;
  }
  let validCheckoutDate: string | null = null;
  if (u.checkoutDate && !isNaN(Date.parse(u.checkoutDate))) {
    validCheckoutDate = new Date(u.checkoutDate).toISOString();
  }

  // Dual persistence: embed metadata tag [EXCLUDE_DAILY_COUNT] and [CREATED_BY:...] in notes so that even if
  // the remote database does not yet have those columns,
  // the state is 100% persisted and synced across all devices and sessions!
  let rawNotes = u.notes || '';
  if (u.excludeFromDailyCount) {
    if (!rawNotes.includes('[EXCLUDE_DAILY_COUNT]')) {
      rawNotes = rawNotes ? `${rawNotes}\n[EXCLUDE_DAILY_COUNT]` : '[EXCLUDE_DAILY_COUNT]';
    }
  } else {
    rawNotes = rawNotes.replace(/\[EXCLUDE_DAILY_COUNT\]\s*/g, '').trim();
  }

  if (u.createdBy && (u.createdBy.name || u.createdBy.email)) {
    const creatorMeta = `[CREATED_BY:${JSON.stringify({
      uid: u.createdBy.uid || '',
      email: u.createdBy.email || '',
      name: u.createdBy.name || ''
    })}]`;
    rawNotes = rawNotes.replace(/\[CREATED_BY:\{.*?\}\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${creatorMeta}` : creatorMeta;
  }

  if (u.pendingRegistrationNumber) {
    const regMeta = `[PENDING_REG:${u.pendingRegistrationNumber}]`;
    rawNotes = rawNotes.replace(/\[PENDING_REG:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${regMeta}` : regMeta;
  } else {
    rawNotes = rawNotes.replace(/\[PENDING_REG:.*?\]\s*/g, '').trim();
  }

  if (u.pendingItemId) {
    const idMeta = `[PENDING_ID:${u.pendingItemId}]`;
    rawNotes = rawNotes.replace(/\[PENDING_ID:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${idMeta}` : idMeta;
  } else {
    rawNotes = rawNotes.replace(/\[PENDING_ID:.*?\]\s*/g, '').trim();
  }

  const isRealStockOrigin = Boolean(
    u.originSector && 
    u.originSector.trim().toLowerCase() !== 'pendências' && 
    u.originSector.trim().toLowerCase() !== 'pendencias' && 
    u.originSector.trim().toLowerCase() !== 'sem setor'
  );

  if (isRealStockOrigin) {
    const originMeta = `[ORIGIN_SECTOR:${u.originSector}]`;
    rawNotes = rawNotes.replace(/\[ORIGIN_SECTOR:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${originMeta}` : originMeta;
  } else {
    rawNotes = rawNotes.replace(/\[ORIGIN_SECTOR:.*?\]\s*/g, '').trim();
  }

  if (u.initialEntryDate) {
    const initDateMeta = `[INITIAL_ENTRY_DATE:${u.initialEntryDate}]`;
    rawNotes = rawNotes.replace(/\[INITIAL_ENTRY_DATE:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${initDateMeta}` : initDateMeta;
  } else {
    rawNotes = rawNotes.replace(/\[INITIAL_ENTRY_DATE:.*?\]\s*/g, '').trim();
  }

  if (u.transferredAt && isRealStockOrigin) {
    const transMeta = `[TRANSFERRED_AT:${u.transferredAt}]`;
    rawNotes = rawNotes.replace(/\[TRANSFERRED_AT:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${transMeta}` : transMeta;
  } else {
    rawNotes = rawNotes.replace(/\[TRANSFERRED_AT:.*?\]\s*/g, '').trim();
  }

  const payload: any = {
    id: cleanId,
    tracking_code: u.trackingCode ?? '',
    serial_number: u.serialNumber ?? '',
    order_number: u.orderNumber ?? '',
    base_product_id: u.baseProductId ?? '',
    base_product_name: u.baseProductName ?? '',
    base_product_sku: u.baseProductSku ?? '',
    base_product_voltage: u.baseProductVoltage || 'Bivolt',
    platform: u.platform || 'Mercado Livre',
    customer_reason: compressText(u.customerReason || ''),
    device_status: u.deviceStatus || 'Usado',
    package_status: u.packageStatus || 'Danificada',
    accessories_inclusion: compressText(u.accessoriesInclusion || ''),
    destination_sector: u.destinationSector || 'RMA',
    notes: compressText(rawNotes),
    photos_product: Array.isArray(u.photosProduct) ? u.photosProduct : [],
    photos_box: Array.isArray(u.photosBox) ? u.photosBox : [],
    photos_accessories: Array.isArray(u.photosAccessories) ? u.photosAccessories : [],
    created_at: validCreatedAt,
    status: u.status || 'Estoque',
    checkout_date: validCheckoutDate,
    source: u.source || 'manual',
    is_migration: Boolean(u.isMigration),
    updated_at: now
  };

  if (getHasTriageTransferCols() !== false) {
    payload.origin_sector = isRealStockOrigin ? u.originSector : null;
    payload.transferred_at = isRealStockOrigin && u.transferredAt ? u.transferredAt : null;
  }
  if (u.initialEntryDate && getHasTriageTransferCols() !== false) {
    payload.initial_entry_date = u.initialEntryDate;
  }

  if (u.pendingRegistrationNumber && getHasTriagePendingCols() !== false) {
    payload.pending_registration_number = u.pendingRegistrationNumber;
  }
  if (u.pendingItemId && getHasTriagePendingCols() !== false) {
    payload.pending_item_id = u.pendingItemId;
  }

  // Only include exclude_from_daily_count column if not known to be missing in PostgreSQL schema
  if (getHasExcludeDailyCol() !== false) {
    payload.exclude_from_daily_count = Boolean(u.excludeFromDailyCount);
  }

  // Only include created_by column if not known to be missing in PostgreSQL schema
  if (getHasTriageCreatedByCol() !== false && u.createdBy) {
    payload.created_by = u.createdBy;
  }

  return payload;
};

export const mapSupabaseToTriageUnit = (r: any): TriageUnit => {
  const decompressedNotes = decompressText(r.notes || '');
  const hasExcludeMarker = decompressedNotes.includes('[EXCLUDE_DAILY_COUNT]');

  let createdBy: { uid?: string; email?: string; name?: string } | undefined = undefined;
  if (r.created_by && typeof r.created_by === 'object') {
    createdBy = r.created_by;
  } else if (r.createdBy && typeof r.createdBy === 'object') {
    createdBy = r.createdBy;
  } else if (decompressedNotes.includes('[CREATED_BY:')) {
    try {
      const match = decompressedNotes.match(/\[CREATED_BY:(\{.*?\})\]/);
      if (match && match[1]) {
        createdBy = JSON.parse(match[1]);
      }
    } catch {}
  }

  let pendingRegistrationNumber: string | undefined = undefined;
  if (r.pending_registration_number) {
    pendingRegistrationNumber = r.pending_registration_number;
  } else if (r.pendingRegistrationNumber) {
    pendingRegistrationNumber = r.pendingRegistrationNumber;
  } else if (decompressedNotes.includes('[PENDING_REG:')) {
    const regMatch = decompressedNotes.match(/\[PENDING_REG:(.*?)\]/);
    if (regMatch && regMatch[1]) {
      pendingRegistrationNumber = regMatch[1].trim();
    }
  }

  let pendingItemId: string | undefined = undefined;
  if (r.pending_item_id) {
    pendingItemId = r.pending_item_id;
  } else if (r.pendingItemId) {
    pendingItemId = r.pendingItemId;
  } else if (decompressedNotes.includes('[PENDING_ID:')) {
    const idMatch = decompressedNotes.match(/\[PENDING_ID:(.*?)\]/);
    if (idMatch && idMatch[1]) {
      pendingItemId = idMatch[1].trim();
    }
  }

  let originSector: string | undefined = undefined;
  if (r.origin_sector) {
    originSector = r.origin_sector;
  } else if (r.originSector) {
    originSector = r.originSector;
  } else if (decompressedNotes.includes('[ORIGIN_SECTOR:')) {
    const originMatch = decompressedNotes.match(/\[ORIGIN_SECTOR:(.*?)\]/);
    if (originMatch && originMatch[1]) {
      originSector = originMatch[1].trim();
    }
  }

  // Pendências não é setor de estoque físico; se for 'Pendências' ou 'Sem Setor', anula
  if (originSector) {
    const s = originSector.trim().toLowerCase();
    if (s === 'pendências' || s === 'pendencias' || s === 'sem setor') {
      originSector = undefined;
    }
  }

  let initialEntryDate: string | undefined = undefined;
  if (r.initial_entry_date) {
    initialEntryDate = r.initial_entry_date;
  } else if (r.initialEntryDate) {
    initialEntryDate = r.initialEntryDate;
  } else if (decompressedNotes.includes('[INITIAL_ENTRY_DATE:')) {
    const initMatch = decompressedNotes.match(/\[INITIAL_ENTRY_DATE:(.*?)\]/);
    if (initMatch && initMatch[1]) {
      initialEntryDate = initMatch[1].trim();
    }
  }

  let transferredAt: string | undefined = undefined;
  if (r.transferred_at) {
    transferredAt = r.transferred_at;
  } else if (r.transferredAt) {
    transferredAt = r.transferredAt;
  } else if (decompressedNotes.includes('[TRANSFERRED_AT:')) {
    const transMatch = decompressedNotes.match(/\[TRANSFERRED_AT:(.*?)\]/);
    if (transMatch && transMatch[1]) {
      transferredAt = transMatch[1].trim();
    }
  }

  const cleanNotes = decompressedNotes
    .replace(/\[EXCLUDE_DAILY_COUNT\]\s*/g, '')
    .replace(/\[CREATED_BY:\{.*?\}\]\s*/g, '')
    .replace(/\[PENDING_REG:.*?\]\s*/g, '')
    .replace(/\[PENDING_ID:.*?\]\s*/g, '')
    .replace(/\[ORIGIN_SECTOR:.*?\]\s*/g, '')
    .replace(/\[INITIAL_ENTRY_DATE:.*?\]\s*/g, '')
    .replace(/\[TRANSFERRED_AT:.*?\]\s*/g, '')
    .trim();

  return {
    id: r.id,
    trackingCode: r.tracking_code ?? r.trackingCode ?? '',
    serialNumber: r.serial_number ?? r.serialNumber ?? '',
    orderNumber: r.order_number ?? r.orderNumber ?? '',
    baseProductId: r.base_product_id ?? r.baseProductId ?? '',
    baseProductName: r.base_product_name ?? r.baseProductName ?? '',
    baseProductSku: r.base_product_sku ?? r.baseProductSku ?? '',
    baseProductVoltage: r.base_product_voltage ?? r.baseProductVoltage ?? 'Bivolt',
    platform: r.platform || 'Mercado Livre',
    customerReason: decompressText(r.customer_reason || r.customerReason || ''),
    deviceStatus: r.device_status || r.deviceStatus || '',
    packageStatus: r.package_status || r.packageStatus || '',
    accessoriesInclusion: decompressText(r.accessories_inclusion || r.accessoriesInclusion || ''),
    destinationSector: r.destination_sector || r.destinationSector || 'RMA',
    originSector: originSector as any,
    initialEntryDate: initialEntryDate,
    transferredAt: transferredAt,
    notes: cleanNotes,
    photosProduct: Array.isArray(r.photos_product || r.photosProduct) ? (r.photos_product || r.photosProduct) : [],
    photosBox: Array.isArray(r.photos_box || r.photosBox) ? (r.photos_box || r.photosBox) : [],
    photosAccessories: Array.isArray(r.photos_accessories || r.photosAccessories) ? (r.photos_accessories || r.photosAccessories) : [],
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    status: r.status || 'Estoque',
    checkoutDate: r.checkout_date || r.checkoutDate || null,
    source: r.source || 'manual',
    isMigration: Boolean(r.is_migration ?? r.isMigration),
    excludeFromDailyCount: Boolean(
      r.exclude_from_daily_count === true ||
      r.excludeFromDailyCount === true ||
      hasExcludeMarker
    ),
    pendingRegistrationNumber: pendingRegistrationNumber,
    pendingItemId: pendingItemId,
    createdBy: createdBy
  };
};

export const mapDailyInflowToSupabase = (d: DailyInflowRecord) => {
  const cleanId = (d.id && isValidUUID(d.id.trim())) 
    ? d.id.trim() 
    : (d.id && !d.id.startsWith('triage-auto-') && !d.id.startsWith('inflow-') ? d.id.trim() : generateUUID());
  const now = new Date().toISOString();
  return {
    id: cleanId,
    date: d.date,
    rma: d.rma || 0,
    estoque: d.estoque || 0,
    openbox: d.openbox || 0,
    es: d.es || 0,
    total_dia: d.totalDia || (Number(d.rma || 0) + Number(d.estoque || 0) + Number(d.openbox || 0) + Number(d.es || 0)),
    notes: compressText(d.notes || ''),
    source: d.source || 'manual',
    created_at: d.createdAt || now,
    updated_at: d.updatedAt || now
  };
};

export const mapSupabaseToDailyInflow = (r: any): DailyInflowRecord => ({
  id: r.id,
  date: r.date,
  rma: Number(r.rma) || 0,
  estoque: Number(r.estoque) || 0,
  openbox: Number(r.openbox) || 0,
  es: Number(r.es) || 0,
  totalDia: Number(r.total_dia ?? r.totalDia) || 0,
  notes: decompressText(r.notes || ''),
  source: r.source || 'manual',
  createdAt: r.created_at || r.createdAt,
  updatedAt: r.updated_at || r.updatedAt
});

export const mapPendingItemToSupabase = (p: PendingItem) => {
  const cleanId = (p.id && p.id.trim()) ? p.id.trim() : generateUUID();
  const now = new Date().toISOString();

  let rawNotes = p.detailedNotes || '';
  if (p.registrationNumber) {
    const regMeta = `[REG_NUM:${p.registrationNumber}]`;
    rawNotes = rawNotes.replace(/\[REG_NUM:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${regMeta}` : regMeta;
  }
  const unitIdToLink = p.transferredUnitId || p.linkedUnitId;
  if (unitIdToLink) {
    const linkMeta = `[LINKED_UNIT:${unitIdToLink}]`;
    rawNotes = rawNotes.replace(/\[LINKED_UNIT:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${linkMeta}` : linkMeta;
  }
  if (p.linkedUnitTrackingCode) {
    const stiMeta = `[LINKED_STI:${p.linkedUnitTrackingCode}]`;
    rawNotes = rawNotes.replace(/\[LINKED_STI:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${stiMeta}` : stiMeta;
  }
  if (p.customerReason) {
    const crMeta = `[CUSTOMER_REASON:${p.customerReason}]`;
    rawNotes = rawNotes.replace(/\[CUSTOMER_REASON:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${crMeta}` : crMeta;
  }
  if (p.deviceStatus) {
    const dsMeta = `[DEVICE_STATUS:${p.deviceStatus}]`;
    rawNotes = rawNotes.replace(/\[DEVICE_STATUS:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${dsMeta}` : dsMeta;
  }
  if (p.packageStatus) {
    const psMeta = `[PACKAGE_STATUS:${p.packageStatus}]`;
    rawNotes = rawNotes.replace(/\[PACKAGE_STATUS:.*?\]\s*/g, '').trim();
    rawNotes = rawNotes ? `${rawNotes}\n${psMeta}` : psMeta;
  }

  const payload: any = {
    id: cleanId,
    sku: p.sku || '',
    product_name: p.productName || '',
    voltage: p.voltage || 'Bivolt',
    serial_number: p.serialNumber || '',
    tracking_code: p.trackingCode || '',
    order_number: p.orderNumber || '',
    platform: p.platform || 'Mercado Livre',
    pending_reason: compressText(p.pendingReason || ''),
    detailed_notes: compressText(rawNotes),
    status: p.status || 'Pendente',
    priority: p.priority || 'Média',
    photos: Array.isArray(p.photos) ? p.photos : [],
    created_at: p.createdAt || now,
    updated_at: p.updatedAt || now,
    created_by: p.createdBy || null
  };

  if (p.registrationNumber && getHasPendingRegistrationCol() !== false) {
    payload.registration_number = p.registrationNumber;
  }

  // Only include extended columns if supported by remote schema
  if (getHasPendingExtendedCols() !== false) {
    payload.resolved_at = p.resolvedAt || null;
    payload.transferred_to_stock = Boolean(p.transferredToStock);
    payload.transferred_unit_id = unitIdToLink || null;
    payload.destination_sector_suggested = p.destinationSectorSuggested || 'RMA';
  }

  return payload;
};

export const mapSupabaseToPendingItem = (r: any): PendingItem => {
  const decompressedNotes = decompressText(r.detailed_notes || r.detailedNotes || '');

  let regNum: string | undefined = undefined;
  if (r.registration_number) {
    regNum = r.registration_number;
  } else if (r.registrationNumber) {
    regNum = r.registrationNumber;
  } else if (decompressedNotes.includes('[REG_NUM:')) {
    const match = decompressedNotes.match(/\[REG_NUM:(.*?)\]/);
    if (match && match[1]) regNum = match[1].trim();
  }

  let linkedUnitId: string | undefined = r.transferred_unit_id || r.transferredUnitId;
  if (!linkedUnitId && decompressedNotes.includes('[LINKED_UNIT:')) {
    const match = decompressedNotes.match(/\[LINKED_UNIT:(.*?)\]/);
    if (match && match[1]) linkedUnitId = match[1].trim();
  }

  let linkedUnitTrackingCode: string | undefined = undefined;
  if (decompressedNotes.includes('[LINKED_STI:')) {
    const match = decompressedNotes.match(/\[LINKED_STI:(.*?)\]/);
    if (match && match[1]) linkedUnitTrackingCode = match[1].trim();
  }

  let customerReason: string | undefined = r.customer_reason || r.customerReason;
  if (!customerReason && decompressedNotes.includes('[CUSTOMER_REASON:')) {
    const match = decompressedNotes.match(/\[CUSTOMER_REASON:(.*?)\]/);
    if (match && match[1]) customerReason = match[1].trim();
  }

  let deviceStatus: string | undefined = r.device_status || r.deviceStatus;
  if (!deviceStatus && decompressedNotes.includes('[DEVICE_STATUS:')) {
    const match = decompressedNotes.match(/\[DEVICE_STATUS:(.*?)\]/);
    if (match && match[1]) deviceStatus = match[1].trim();
  }

  let packageStatus: string | undefined = r.package_status || r.packageStatus;
  if (!packageStatus && decompressedNotes.includes('[PACKAGE_STATUS:')) {
    const match = decompressedNotes.match(/\[PACKAGE_STATUS:(.*?)\]/);
    if (match && match[1]) packageStatus = match[1].trim();
  }

  const cleanNotes = decompressedNotes
    .replace(/\[REG_NUM:.*?\]\s*/g, '')
    .replace(/\[LINKED_UNIT:.*?\]\s*/g, '')
    .replace(/\[LINKED_STI:.*?\]\s*/g, '')
    .replace(/\[CUSTOMER_REASON:.*?\]\s*/g, '')
    .replace(/\[DEVICE_STATUS:.*?\]\s*/g, '')
    .replace(/\[PACKAGE_STATUS:.*?\]\s*/g, '')
    .trim();

  return {
    id: r.id,
    sku: r.sku || '',
    productName: r.product_name || r.productName || '',
    voltage: r.voltage || 'Bivolt',
    serialNumber: r.serial_number || r.serialNumber || '',
    trackingCode: r.tracking_code || r.trackingCode || '',
    orderNumber: r.order_number || r.orderNumber || '',
    platform: r.platform || 'Mercado Livre',
    pendingReason: decompressText(r.pending_reason || r.pendingReason || ''),
    customerReason: customerReason || '',
    deviceStatus: deviceStatus || undefined,
    packageStatus: packageStatus || undefined,
    detailedNotes: cleanNotes,
    status: r.status || 'Pendente',
    priority: (r.priority as any) || 'Média',
    photos: Array.isArray(r.photos) ? r.photos : [],
    createdAt: r.created_at || r.createdAt,
    updatedAt: r.updated_at || r.updatedAt,
    createdBy: r.created_by || r.createdBy,
    resolvedAt: r.resolved_at || r.resolvedAt || null,
    transferredToStock: Boolean(r.transferred_to_stock ?? r.transferredToStock),
    transferredUnitId: linkedUnitId,
    destinationSectorSuggested: r.destination_sector_suggested || r.destinationSectorSuggested || 'RMA',
    registrationNumber: regNum,
    linkedUnitId: linkedUnitId,
    linkedUnitTrackingCode: linkedUnitTrackingCode
  };
};

export const mapUserToSupabase = (u: UserAccount) => ({
  uid: u.uid,
  email: u.email,
  name: u.name,
  role: u.role || 'operator',
  created_at: u.createdAt || new Date().toISOString(),
  last_login: u.lastLogin || new Date().toISOString(),
  updated_at: new Date().toISOString()
});

export const mapSupabaseToUser = (r: any): UserAccount => ({
  uid: r.uid || r.id,
  email: r.email || '',
  name: r.name || 'Usuário Corporativo',
  role: (r.role === 'admin' ? 'admin' : 'operator') as 'admin' | 'operator',
  createdAt: r.created_at || r.createdAt || '',
  lastLogin: r.last_login || r.lastLogin || ''
});

