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
}

export interface DashboardMetrics {
  totalReceivedToday: number;
  byPlatform: Record<PlatformType, number>;
  bySector: Record<DestinationSectorType, number>;
}
