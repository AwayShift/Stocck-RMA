/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BaseProduct {
  id: string;
  name: string;
  sku: string;
  voltage: '110V' | '220V' | 'Bivolt' | 'N/A';
  description?: string;
  imageUrl?: string;
  images?: string[];
  imagesProduct?: string[];
  imagesBox?: string[];
  imagesAccessories?: string[];
  accessories?: string;
  brand?: string;
  category?: string;
}

export type PlatformType = 'Mercado Livre' | 'Shopee' | 'Amazon' | 'Kabum';
export type CasePlatformType = 'Mercado Livre' | 'Shopee' | 'Amazon';
export type DeviceStatusType = 'Novo' | 'Usado' | 'Danificado';
export type PackageStatusType = 'Perfeita' | 'Danificada' | 'Sem Embalagem';
export type DestinationSectorType = 'Principal' | 'Openbox' | 'RMA';

export interface CaseTracking {
  id: string;
  code: string;
  platform: CasePlatformType;
  createdAt: string;
  reason: string;
  resolution: string;
  status?: 'Pendente' | 'Resolvido';
  value?: number;
  notes?: string;
}

export interface TriageUnit {
  id: string;
  trackingCode: string; // Código de rastreamento / número do caso
  serialNumber?: string; // Número de série do produto
  baseProductId: string;
  baseProductName: string;
  baseProductSku: string;
  baseProductVoltage: string;
  platform: PlatformType;
  customerReason: string;
  deviceStatus: DeviceStatusType;
  packageStatus: PackageStatusType;
  accessoriesInclusion: string;
  destinationSector: DestinationSectorType;
  notes: string; // HTML rich-text de Quill
  photosProduct: string[]; // Base64 compressed strings
  photosBox: string[]; // Base64 compressed strings
  photosAccessories: string[]; // Base64 compressed strings
  createdAt: string; // ISO String
  status: 'Estoque' | 'Baixado';
  checkoutDate?: string | null;
  source?: 'manual' | 'excel' | 'migration';
  isMigration?: boolean;
}

/**
 * Helper to identify units created via spreadsheet inventory migration,
 * so they are kept in stock inventory but ignored from operational RMA inflow counts.
 */
export function isMigrationUnit(u: {
  isMigration?: boolean;
  source?: string;
  id?: string;
  customerReason?: string;
  notes?: string;
}): boolean {
  if (!u) return false;
  if (u.isMigration) return true;
  if (u.source === 'excel' || u.source === 'migration') return true;
  if (u.id && (
    u.id.startsWith('tr-excel-') || 
    u.id.startsWith('excel-') || 
    u.id.startsWith('mig-') || 
    u.id.startsWith('migration-')
  )) return true;
  if (u.customerReason) {
    const cr = u.customerReason.toLowerCase();
    if (
      cr.includes('importação de planilha') ||
      cr.includes('importacao de planilha') ||
      cr.includes('inventário openbox (importação') ||
      cr.includes('inventario openbox (importacao') ||
      cr.includes('migração de sistema') ||
      cr.includes('migracao de sistema')
    ) return true;
  }
  if (u.notes) {
    const nt = u.notes.toLowerCase();
    if (
      nt.includes('item importado via planilha') ||
      nt.includes('importação de planilha de inventário') ||
      nt.includes('importacao de planilha de inventario') ||
      nt.includes('inventário openbox') ||
      nt.includes('inventario openbox')
    ) return true;
  }
  return false;
}

export interface DashboardMetrics {
  totalReceivedToday: number;
  byPlatform: Record<PlatformType, number>;
  bySector: Record<DestinationSectorType, number>;
}

export interface DailyInflowRecord {
  id: string;
  date: string; // ISO 'YYYY-MM-DD'
  rma: number;
  estoque: number;
  openbox: number;
  es: number;
  totalDia: number;
  notes?: string;
  source?: 'excel' | 'manual' | 'auto';
  createdAt?: string;
  updatedAt?: string;
}

export interface InflowWeekSummary {
  weekNumber: number;
  weekLabel: string;
  startDate: string;
  endDate: string;
  records: DailyInflowRecord[];
  totalWeek: number;
  totalRma: number;
  totalEstoque: number;
  totalOpenbox: number;
  totalEs: number;
}

export interface UserAccount {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  createdAt?: string;
  lastLogin?: string;
}

