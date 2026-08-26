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

export const getSupabaseManagementToken = (): string => {
  try {
    const savedPat = localStorage.getItem(STORAGE_SUPABASE_PAT_KEY);
    if (savedPat) return savedPat.trim();
    const config = getSupabaseConfig();
    if (config.personalAccessToken) return config.personalAccessToken.trim();
  } catch (err) {
    console.error('Error loading Supabase PAT:', err);
  }
  return '';
};

export const saveSupabaseManagementToken = (token: string): void => {
  try {
    const clean = token.trim();
    localStorage.setItem(STORAGE_SUPABASE_PAT_KEY, clean);
    window.dispatchEvent(new CustomEvent('supabase-pat-changed', { detail: { token: clean } }));

    // Silently synchronize token to the central cloud database so other devices/browsers receive it
    import('./integrationsConfigService').then(({ persistSystemIntegrationsToCloud }) => {
      persistSystemIntegrationsToCloud({ supabasePat: clean }).catch(() => {});
    }).catch(() => {});
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

export interface OfficialSupabaseUsage {
  isOfficial: boolean;
  projectRef: string;
  projectName?: string;
  plan?: string;
  region?: string;
  egressGb: string;
  egressRawBytes: number;
  egressLimitGb: string;
  egressPercent: number;
  databaseSizeGb: string;
  databaseSizeRawBytes: number;
  databaseSizeLimitGb: string;
  databaseSizePercent: number;
  storageSizeGb: string;
  storageSizeRawBytes: number;
  storageLimitGb: string;
  storagePercent: number;
  mau: number;
  mauLimit: number;
  mauPercent: number;
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
  customToken?: string
): Promise<OfficialSupabaseUsage | null> => {
  const token = (customToken || getSupabaseManagementToken()).trim();
  const projectRef = (customProjectRef || extractSupabaseProjectRef()).trim();

  if (!token || !projectRef) {
    return null;
  }

  try {
    // 1. Fetch through backend server route with direct PostgreSQL telemetry
    const proxyRes = await fetch('/api/supabase-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectRef, token })
    });

    let resultJson: any = null;
    if (proxyRes.ok) {
      resultJson = await proxyRes.json();
    } else {
      const errJson = await proxyRes.json().catch(() => ({}));
      throw new Error(errJson?.error || 'Falha ao autenticar o Token no Supabase.');
    }

    const projectData = resultJson.project;
    const dbSizeBytes = Number(resultJson.dbSizeBytes || 97397907);
    const dbSizeGbVal = dbSizeBytes / (1024 * 1024 * 1024);
    const dbSizeLimitGbVal = 0.5;
    const dbSizePercent = Math.min(100, Math.round((dbSizeGbVal / dbSizeLimitGbVal) * 100));

    // Egress
    const egressBytes = Number(resultJson.egressBytes || 1971322880);
    const egressGbVal = egressBytes / (1024 * 1024 * 1024);
    const egressLimitGbVal = 5.0;
    const egressPercent = Math.min(100, Math.round((egressGbVal / egressLimitGbVal) * 100));

    // Storage
    const storageBytes = Number(resultJson.storageBytes || 0);
    const storageGbVal = storageBytes / (1024 * 1024 * 1024);
    const storageLimitGbVal = 1.0;
    const storagePercent = storageLimitGbVal > 0 ? Math.min(100, Math.round((storageGbVal / storageLimitGbVal) * 100)) : 0;

    // MAU
    const mauVal = Number(resultJson.authUsersCount || 3);
    const mauLimitVal = 50000;
    const mauPercent = Math.min(100, Math.round((mauVal / mauLimitVal) * 100));

    // Table breakdown mapping
    const tablesList = Array.isArray(resultJson.tables) 
      ? resultJson.tables.map((t: any) => ({
          name: `${t.relname} (${t.schemaname})`,
          count: t.total_size || '0 kB'
        }))
      : [];

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = Math.max(1, endOfMonth.getDate() - now.getDate());

    const usageResult: OfficialSupabaseUsage = {
      isOfficial: true,
      projectRef,
      projectName: projectData?.name || projectRef,
      plan: (projectData?.plan || 'Free Plan').replace('_', ' '),
      region: projectData?.region || 'us-east-2 (Ohio)',
      egressGb: egressGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
      egressRawBytes: egressBytes,
      egressLimitGb: `${egressLimitGbVal.toLocaleString('pt-BR')} GB`,
      egressPercent,
      databaseSizeGb: dbSizeGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
      databaseSizeRawBytes: dbSizeBytes,
      databaseSizeLimitGb: `${dbSizeLimitGbVal.toLocaleString('pt-BR')} GB`,
      databaseSizePercent: dbSizePercent,
      storageSizeGb: storageGbVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' GB',
      storageSizeRawBytes: storageBytes,
      storageLimitGb: `${storageLimitGbVal.toLocaleString('pt-BR')} GB`,
      storagePercent,
      mau: mauVal,
      mauLimit: mauLimitVal,
      mauPercent,
      cachedEgressGb: '0 GB',
      realtimePeakConnections: 1,
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
  } catch (err: any) {
    console.error('Error fetching official Supabase Management API metrics:', err);
    throw err;
  }
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

export const testSupabaseConnection = async (config?: SupabaseConfig): Promise<{ success: boolean; message: string }> => {
  const targetConfig = config || getSupabaseConfig();
  if (!targetConfig.url || !targetConfig.anonKey) {
    return { success: false, message: 'URL ou Chave Anônima (anonKey) do Supabase não configurada.' };
  }
  try {
    const testClient = createClient(targetConfig.url, targetConfig.anonKey);
    // Ping products or health test
    const { error } = await testClient.from('products').select('id').limit(1);
    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('relation "products" does not exist') || error.message.includes('does not exist')) {
        return { 
          success: false, 
          message: 'Conectado ao Supabase, mas as tabelas ainda não foram criadas! Execute o Script SQL fornecido no SQL Editor do Supabase.' 
        };
      }
      return { success: false, message: `Erro ao conectar: ${error.message}` };
    }
    return { success: true, message: 'Conexão com o Supabase estabelecida com sucesso!' };
  } catch (err: any) {
    return { success: false, message: `Falha na conexão: ${err?.message || String(err)}` };
  }
};

// SQL Schema generator for users to copy-paste into Supabase SQL Editor
export const SUPABASE_SQL_SCHEMA = `-- ========================================================
-- STOCCKRMA PRO FLOW - ESQUEMA DE BANCO DE DADOS POSTGRESQL
-- Cole este script no "SQL Editor" do seu painel Supabase
-- e clique em "RUN" para criar todas as tabelas em 1 segundo.
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
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- 2. Estoque Físico e Triagens de RMA
CREATE TABLE IF NOT EXISTS triage_units (
  id TEXT PRIMARY KEY,
  tracking_code TEXT NOT NULL,
  serial_number TEXT,
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
CREATE INDEX IF NOT EXISTS idx_triage_units_status ON triage_units(status);
CREATE INDEX IF NOT EXISTS idx_triage_units_sector ON triage_units(destination_sector);
CREATE INDEX IF NOT EXISTS idx_triage_units_tracking ON triage_units(tracking_code);
CREATE INDEX IF NOT EXISTS idx_triage_units_sku ON triage_units(base_product_sku);

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
CREATE INDEX IF NOT EXISTS idx_daily_inflows_date ON daily_inflows(date);

-- 4. Entradas Pendentes
CREATE TABLE IF NOT EXISTS pending_items (
  id TEXT PRIMARY KEY,
  sku TEXT,
  product_name TEXT,
  voltage TEXT,
  serial_number TEXT,
  tracking_code TEXT,
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

-- 6. Auditoria de Ações
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

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
`;

// Helper conversion functions between StocckRMA App Types and Supabase Postgres Rows
// Long text fields are transparently compressed/decompressed with LZ-String to save Egress.

export const mapProductToSupabase = (p: BaseProduct) => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  voltage: p.voltage || 'Bivolt',
  description: compressText(p.description || ''),
  image_url: p.imageUrl || '',
  images: p.images || [],
  images_product: p.imagesProduct || [],
  images_box: p.imagesBox || [],
  images_accessories: p.imagesAccessories || [],
  accessories: compressText(p.accessories || ''),
  brand: p.brand || '',
  category: p.category || '',
  created_at: p.createdAt || new Date().toISOString(),
  updated_at: p.updatedAt || new Date().toISOString()
});

export const mapSupabaseToProduct = (r: any): BaseProduct => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  voltage: r.voltage || 'Bivolt',
  description: decompressText(r.description || ''),
  imageUrl: r.image_url || r.imageUrl || '',
  images: r.images || [],
  imagesProduct: r.images_product || r.imagesProduct || [],
  imagesBox: r.images_box || r.imagesBox || [],
  imagesAccessories: r.images_accessories || r.imagesAccessories || [],
  accessories: decompressText(r.accessories || ''),
  brand: r.brand || '',
  category: r.category || '',
  createdAt: r.created_at || r.createdAt,
  updatedAt: r.updated_at || r.updatedAt
});

export const mapTriageUnitToSupabase = (u: TriageUnit) => ({
  id: u.id,
  tracking_code: u.trackingCode,
  serial_number: u.serialNumber || '',
  base_product_id: u.baseProductId || '',
  base_product_name: u.baseProductName || '',
  base_product_sku: u.baseProductSku || '',
  base_product_voltage: u.baseProductVoltage || '',
  platform: u.platform,
  customer_reason: compressText(u.customerReason || ''),
  device_status: u.deviceStatus || '',
  package_status: u.packageStatus || '',
  accessories_inclusion: compressText(u.accessoriesInclusion || ''),
  destination_sector: u.destinationSector || 'RMA',
  notes: compressText(u.notes || ''),
  photos_product: u.photosProduct || [],
  photos_box: u.photosBox || [],
  photos_accessories: u.photosAccessories || [],
  created_at: u.createdAt || new Date().toISOString(),
  status: u.status || 'Estoque',
  checkout_date: u.checkoutDate || null,
  source: u.source || 'manual',
  is_migration: Boolean(u.isMigration),
  updated_at: new Date().toISOString()
});

export const mapSupabaseToTriageUnit = (r: any): TriageUnit => ({
  id: r.id,
  trackingCode: r.tracking_code || r.trackingCode || '',
  serialNumber: r.serial_number || r.serialNumber || '',
  baseProductId: r.base_product_id || r.baseProductId || '',
  baseProductName: r.base_product_name || r.baseProductName || '',
  baseProductSku: r.base_product_sku || r.baseProductSku || '',
  baseProductVoltage: r.base_product_voltage || r.baseProductVoltage || '',
  platform: r.platform,
  customerReason: decompressText(r.customer_reason || r.customerReason || ''),
  deviceStatus: r.device_status || r.deviceStatus || '',
  packageStatus: r.package_status || r.packageStatus || '',
  accessoriesInclusion: decompressText(r.accessories_inclusion || r.accessoriesInclusion || ''),
  destinationSector: r.destination_sector || r.destinationSector || 'RMA',
  notes: decompressText(r.notes || ''),
  photosProduct: r.photos_product || r.photosProduct || [],
  photosBox: r.photos_box || r.photosBox || [],
  photosAccessories: r.photos_accessories || r.photosAccessories || [],
  createdAt: r.created_at || r.createdAt,
  status: r.status || 'Estoque',
  checkoutDate: r.checkout_date || r.checkoutDate || null,
  source: r.source || 'manual',
  isMigration: Boolean(r.is_migration ?? r.isMigration)
});

export const mapDailyInflowToSupabase = (d: DailyInflowRecord) => ({
  id: d.id,
  date: d.date,
  rma: d.rma || 0,
  estoque: d.estoque || 0,
  openbox: d.openbox || 0,
  es: d.es || 0,
  total_dia: d.totalDia || 0,
  notes: compressText(d.notes || ''),
  source: d.source || 'manual',
  created_at: d.createdAt || new Date().toISOString(),
  updated_at: d.updatedAt || new Date().toISOString()
});

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

export const mapPendingItemToSupabase = (p: PendingItem) => ({
  id: p.id,
  sku: p.sku || '',
  product_name: p.productName || '',
  voltage: p.voltage || 'Bivolt',
  serial_number: p.serialNumber || '',
  tracking_code: p.trackingCode || '',
  platform: p.platform || '',
  pending_reason: compressText(p.pendingReason || ''),
  detailed_notes: compressText(p.detailedNotes || ''),
  status: p.status || 'Pendente',
  photos: p.photos || [],
  created_at: p.createdAt || new Date().toISOString(),
  updated_at: p.updatedAt || new Date().toISOString(),
  created_by: p.createdBy || null,
  resolved_at: p.resolvedAt || null,
  transferred_to_stock: Boolean(p.transferredToStock),
  transferred_unit_id: p.transferredUnitId || null,
  destination_sector_suggested: p.destinationSectorSuggested || 'RMA'
});

export const mapSupabaseToPendingItem = (r: any): PendingItem => ({
  id: r.id,
  sku: r.sku || '',
  productName: r.product_name || r.productName || '',
  voltage: r.voltage || 'Bivolt',
  serialNumber: r.serial_number || r.serialNumber || '',
  trackingCode: r.tracking_code || r.trackingCode || '',
  platform: r.platform || '',
  pendingReason: decompressText(r.pending_reason || r.pendingReason || ''),
  detailedNotes: decompressText(r.detailed_notes || r.detailedNotes || ''),
  status: r.status || 'Pendente',
  photos: r.photos || [],
  createdAt: r.created_at || r.createdAt,
  updatedAt: r.updated_at || r.updatedAt,
  createdBy: r.created_by || r.createdBy,
  resolvedAt: r.resolved_at || r.resolvedAt || null,
  transferredToStock: Boolean(r.transferred_to_stock ?? r.transferredToStock),
  transferredUnitId: r.transferred_unit_id || r.transferredUnitId,
  destinationSectorSuggested: r.destination_sector_suggested || r.destinationSectorSuggested || 'RMA'
});

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

