/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  startAfter,
  serverTimestamp,
  writeBatch,
  DocumentSnapshot,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { BaseProduct, TriageUnit, PlatformType, DestinationSectorType, CaseTracking, DailyInflowRecord, UserAccount, PendingItem, PendingStatusType } from '../types';
import { recordFirestoreOperation } from './quotaTracker';
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
  mapSupabaseToPendingItem,
  mapUserToSupabase,
  mapSupabaseToUser
} from './supabase';
import { getCurrentActiveAuthUser } from './supabaseAuth';

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

// Helper to check if running inside Tauri (Always false in our 100% Web application)
export const isTauriEnvironment = (): boolean => {
  return false;
};

// SVG Placeholder images to load beautiful, non-empty initial states for mock data
const createMockSvgBase64 = (title: string, category: 'product' | 'box' | 'acc', color: string): string => {
  const icon = category === 'product' ? '📦' : category === 'box' ? '📦' : '🔌';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
    <rect width="100%" height="100%" fill="#1A2536" />
    <rect x="10" y="10" width="280" height="180" rx="8" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4,4" />
    <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="bold" font-size="32">${icon}</text>
    <text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="14" fill="#94A3B8">${title}</text>
    <text x="50%" y="80%" dominant-baseline="middle" text-anchor="middle" font-family="Courier, monospace" font-size="10" fill="#64748B">Triagem Automática - Logística</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
};

// Initial base products seed
const DEFAULT_BASE_PRODUCTS: BaseProduct[] = [
  { id: 'bp-1', name: 'Aspirador de Pó Vertical Ultra 1600W', sku: 'ASP-VRT-1600', voltage: '220V', brand: 'Mondial', category: 'Eletroportáteis', description: 'Aspirador potente de alto rendimento para carpetes e pisos duros.', imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=500&auto=format&fit=crop&q=60' },
  { id: 'bp-2', name: 'Fritadeira Elétrica AirFryer Touch 4.5L', sku: 'AIR-FRY-45L', voltage: '110V', brand: 'Philips Walita', category: 'Cozinha', description: 'Airfryer digital com tecnologia RapidAir e painel touch inteligente.', imageUrl: 'https://images.unsplash.com/photo-1621972750749-0fbb1abb7736?w=500&auto=format&fit=crop&q=60' },
  { id: 'bp-3', name: 'Cafeteira Espresso Gourmet Pro', sku: 'CAF-ESP-PRO', voltage: 'Bivolt', brand: 'Oster', category: 'Cozinha', description: 'Cafeteira expressa com bomba de 19 bar e espumador de leite integrado.', imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=60' },
  { id: 'bp-4', name: 'Batedeira Planetária Turbo 800W', sku: 'BAT-PLAN-800', voltage: '110V', brand: 'Arno', category: 'Cozinha', description: 'Batedeira planetária de alta performance com 8 velocidades e 3 batedores.', imageUrl: 'https://images.unsplash.com/photo-1578643463396-0997cb5328c1?w=500&auto=format&fit=crop&q=60' },
  { id: 'bp-5', name: 'Mesa Digitalizadora Pro Creatives 10x6', sku: 'TAB-DIG-PRO', voltage: 'N/A', brand: 'Wacom', category: 'Tecnologia', description: 'Mesa digitalizadora profissional com caneta sensível à pressão de 8192 níveis.', imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=60' },
];

const getTodayIso = (hoursOffset: number = 0): string => {
  const date = new Date();
  if (hoursOffset) {
    date.setHours(date.getHours() + hoursOffset);
  }
  return date.toISOString();
};

const DEFAULT_TRIAGE_UNITS: TriageUnit[] = [
  {
    id: 'tr-1',
    trackingCode: 'ML-827491023',
    serialNumber: 'SN-AF45L-2025-8891',
    baseProductId: 'bp-2',
    baseProductName: 'Fritadeira Elétrica AirFryer Touch 4.5L',
    baseProductSku: 'AIR-FRY-45L',
    baseProductVoltage: '110V',
    platform: 'Mercado Livre',
    customerReason: 'Produto alegadamente esquenta muito nas laterais. O cliente achou perigoso e pediu devolução com menos de 3 dias de recebido.',
    deviceStatus: 'Usado',
    packageStatus: 'Danificada',
    accessoriesInclusion: 'Todos os acessórios inclusos (Manual, Grade interna, Cabo de energia).',
    destinationSector: 'Openbox',
    notes: '<p><strong>Laudo Técnico de Triagem:</strong></p><p>O equipamento foi submetido a testes de aquecimento por 15 minutos na temperatura máxima. O calor nas paredes externas é normal do isolamento padrão desse lote. Não apresenta curtos ou falha de ventilação.</p><p><em>Ação recomendada:</em> Higienização completa da gaveta e reembalagem para o setor de Openbox devido a pequenos arranhões superficiais.</p>',
    photosProduct: [createMockSvgBase64('AirFryer - Lateral', 'product', '#F59E0B')],
    photosBox: [createMockSvgBase64('Caixa ML - Amassada', 'box', '#F59E0B')],
    photosAccessories: [createMockSvgBase64('Cabo e Grelha', 'acc', '#F59E0B')],
    createdAt: getTodayIso(-2),
    status: 'Estoque'
  },
  {
    id: 'tr-2',
    trackingCode: 'SHP-992817441',
    serialNumber: 'SN-ASP1600-220V-3042',
    baseProductId: 'bp-1',
    baseProductName: 'Aspirador de Pó Vertical Ultra 1600W',
    baseProductSku: 'ASP-VRT-1600',
    baseProductVoltage: '220V',
    platform: 'Shopee',
    customerReason: 'Disse que o aspirador não tem força nenhuma e faz muito barulho estridente.',
    deviceStatus: 'Danificado',
    packageStatus: 'Sem Embalagem',
    accessoriesInclusion: 'Sem manual. Falta o bico de frestas. Apenas mangueira principal e corpo inclusos.',
    destinationSector: 'RMA',
    notes: '<p><strong>Laudo Técnico de Triagem:</strong></p><p>Ao ligar o aspirador, o motor emite faíscas visíveis próximas ao coletor de carvão e apresenta perda drástica de rotação. O filtro HEPA está completamente saturado de terra úmida, o que provavelmente sobrecarregou e queimou o induzido do motor.</p><p><em>Ação recomendada:</em> Substituição completa do motor e higienização interna da câmara de sucção. Aguardando peças em RMA.</p>',
    photosProduct: [createMockSvgBase64('Aspirador - Motor Centelhando', 'product', '#EF4444')],
    photosBox: [],
    photosAccessories: [createMockSvgBase64('Acessórios Faltando', 'acc', '#EF4444')],
    createdAt: getTodayIso(-4),
    status: 'Estoque'
  }
];

// Corporate Audit Logging helper (silent mode while audit module is restructured)
export const createAuditLog = async (
  _action: string, 
  _details: string,
  _overrideEmail?: string,
  _overrideUid?: string
) => {
  // Audit log creation intentionally disabled for performance and database hygiene
  return;
};

// Purge all legacy audit logs from Supabase & Firestore
export const purgeExistingAuditLogs = async (): Promise<void> => {
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('audit_logs').delete().neq('id', '___non_existent___');
    }
  } catch (e) {
    console.warn('Purge audit_logs table error:', e);
  }
};

import { processSafeImageUpload } from './imageSecurityService';
import { uploadImageToCloudStorage } from './storageService';

// Image Upload with 3MB limit, WebP conversion, security validation and Supabase Storage bucket integration
export const uploadFileToStorage = async (file: File, folder: string = 'media'): Promise<string> => {
  return await uploadImageToCloudStorage(file, folder);
};

// REAL-TIME EVENT LISTENERS (SUPABASE REALTIME & FIRESTORE SNAPSHOTS)

export const subscribeBaseProducts = (
  callback: (products: BaseProduct[]) => void,
  errorCallback?: (err: any) => void
) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('products').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
        if (error) {
          if (errorCallback) errorCallback(error);
        } else if (data) {
          callback(data.map(mapSupabaseToProduct));
        }
      });
      const channel = supabase.channel('realtime_products')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
          const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
          if (data) callback(data.map(mapSupabaseToProduct));
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  return onSnapshot(collection(db, 'products'), (snapshot) => {
    const products: BaseProduct[] = [];
    snapshot.forEach((doc) => {
      products.push({ id: doc.id, ...doc.data() } as BaseProduct);
    });
    callback(products);
  }, (err) => {
    console.error('Failed to subscribe products:', err);
    if (errorCallback) {
      errorCallback(err);
    }
  });
};

export const subscribeTriageUnits = (
  callback: (units: TriageUnit[]) => void,
  errorCallback?: (err: any) => void
) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('triage_units').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
        if (error) {
          if (errorCallback) errorCallback(error);
        } else if (data) {
          callback(data.map(mapSupabaseToTriageUnit));
        }
      });
      const channel = supabase.channel('realtime_triage_units')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'triage_units' }, async () => {
          const { data } = await supabase.from('triage_units').select('*').order('created_at', { ascending: false });
          if (data) callback(data.map(mapSupabaseToTriageUnit));
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  return onSnapshot(collection(db, 'triage_units'), (snapshot) => {
    const units: TriageUnit[] = [];
    snapshot.forEach((doc) => {
      units.push({ id: doc.id, ...doc.data() } as TriageUnit);
    });
    // Sort descending by date
    units.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(units);
  }, (err) => {
    console.error('Failed to subscribe triage units:', err);
    if (errorCallback) {
      errorCallback(err);
    }
  });
};

export const subscribeAuditLogs = (callback: (logs: any[]) => void) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(60).then(({ data }) => {
        if (data) {
          callback(data.map(r => ({
            id: r.id,
            userId: r.user_id,
            userEmail: r.user_email,
            action: r.action,
            details: r.details,
            timestamp: r.timestamp
          })));
        }
      });
      const channel = supabase.channel('realtime_audit_logs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, async () => {
          const { data } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(60);
          if (data) {
            callback(data.map(r => ({
              id: r.id,
              userId: r.user_id,
              userEmail: r.user_email,
              action: r.action,
              details: r.details,
              timestamp: r.timestamp
            })));
          }
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  return onSnapshot(collection(db, 'logs'), (snapshot) => {
    const logs: any[] = [];
    snapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    // Sort newest first
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(logs);
  }, (err) => {
    console.error('Failed to subscribe logs:', err);
  });
};

export const subscribeCaseTracking = (
  callback: (cases: CaseTracking[]) => void,
  errorCallback?: (err: any) => void
) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('cases').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
        if (error) {
          if (errorCallback) errorCallback(error);
        } else if (data) {
          callback(data.map(r => ({
            id: r.id,
            code: r.code,
            platform: r.platform,
            createdAt: r.created_at,
            reason: r.reason,
            resolution: r.resolution,
            status: r.status,
            notes: r.notes,
            value: r.value
          })));
        }
      });
      const channel = supabase.channel('realtime_cases')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, async () => {
          const { data } = await supabase.from('cases').select('*').order('created_at', { ascending: false });
          if (data) {
            callback(data.map(r => ({
              id: r.id,
              code: r.code,
              platform: r.platform,
              createdAt: r.created_at,
              reason: r.reason,
              resolution: r.resolution,
              status: r.status,
              notes: r.notes,
              value: r.value
            })));
          }
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  return onSnapshot(collection(db, 'cases'), (snapshot) => {
    const cases: CaseTracking[] = [];
    snapshot.forEach((doc) => {
      cases.push({ id: doc.id, ...doc.data() } as CaseTracking);
    });
    // Sort newest first by createdAt
    cases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(cases);
  }, (err) => {
    console.error('Failed to subscribe case tracking:', err);
    if (errorCallback) {
      errorCallback(err);
    }
  });
};

export const subscribeDailyInflows = (
  callback: (inflows: DailyInflowRecord[]) => void,
  errorCallback?: (err: any) => void
) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('daily_inflows').select('*').order('date', { ascending: true }).then(({ data, error }) => {
        if (error) {
          if (errorCallback) errorCallback(error);
        } else if (data) {
          callback(data.map(mapSupabaseToDailyInflow));
        }
      });
      const channel = supabase.channel('realtime_daily_inflows')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_inflows' }, async () => {
          const { data } = await supabase.from('daily_inflows').select('*').order('date', { ascending: true });
          if (data) callback(data.map(mapSupabaseToDailyInflow));
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  return onSnapshot(collection(db, 'daily_inflows'), (snapshot) => {
    const inflows: DailyInflowRecord[] = [];
    snapshot.forEach((doc) => {
      inflows.push({ id: doc.id, ...doc.data() } as DailyInflowRecord);
    });
    // Sort by date ascending
    inflows.sort((a, b) => a.date.localeCompare(b.date));
    callback(inflows);
  }, (err) => {
    console.error('Failed to subscribe daily inflows:', err);
    if (errorCallback) {
      errorCallback(err);
    }
  });
};

export const subscribePendingItems = (
  callback: (items: PendingItem[]) => void,
  errorCallback?: (err: any) => void
) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.from('pending_items').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
        if (error) {
          if (errorCallback) errorCallback(error);
        } else if (data) {
          callback(data.map(mapSupabaseToPendingItem));
        }
      });
      const channel = supabase.channel('realtime_pending_items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_items' }, async () => {
          const { data } = await supabase.from('pending_items').select('*').order('created_at', { ascending: false });
          if (data) callback(data.map(mapSupabaseToPendingItem));
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  return onSnapshot(collection(db, 'pending_items'), (snapshot) => {
    const items: PendingItem[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as PendingItem);
    });
    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(items);
  }, (err) => {
    console.error('Failed to subscribe pending items:', err);
    if (errorCallback) {
      errorCallback(err);
    }
  });
};

// PENDING ITEMS CRUD & TRANSFER ACTIONS

export const savePendingItem = async (item: PendingItem): Promise<PendingItem> => {
  let userUid = '';
  let userEmail = '';
  let userName = 'Operador';

  if (getActiveDbProvider() === 'supabase') {
    const authUser = await getCurrentActiveAuthUser();
    if (authUser) {
      userUid = authUser.uid;
      userEmail = authUser.email;
      userName = authUser.name;
    }
  }

  if (!userEmail && auth.currentUser) {
    userUid = auth.currentUser.uid;
    userEmail = auth.currentUser.email || '';
    userName = auth.currentUser.displayName || 'Operador';
  }

  const now = new Date().toISOString();

  const payload: PendingItem = {
    ...item,
    sku: (item.sku || '').trim().toUpperCase(),
    productName: (item.productName || '').trim(),
    voltage: item.voltage || 'Bivolt',
    serialNumber: (item.serialNumber || '').trim(),
    trackingCode: (item.trackingCode || '').trim(),
    platform: item.platform || 'Mercado Livre',
    pendingReason: (item.pendingReason || '').trim(),
    detailedNotes: (item.detailedNotes || '').trim(),
    status: item.status || 'Pendente',
    photos: Array.isArray(item.photos) ? item.photos : [],
    createdAt: item.createdAt || now,
    updatedAt: now,
    createdBy: item.createdBy || {
      uid: userUid,
      email: userEmail,
      name: userName
    }
  };

  if (item.resolvedAt !== undefined) payload.resolvedAt = item.resolvedAt;
  if (item.transferredToStock !== undefined) payload.transferredToStock = item.transferredToStock;
  if (item.transferredUnitId !== undefined) payload.transferredUnitId = item.transferredUnitId;
  if (item.destinationSectorSuggested !== undefined) payload.destinationSectorSuggested = item.destinationSectorSuggested;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('pending_items').upsert(mapPendingItemToSupabase(payload));
      createAuditLog(
        'SAVE_PENDING_ITEM',
        `Salvou item em pendência (Supabase) SKU: [${payload.sku}] ${payload.productName}. Motivo: ${payload.pendingReason}`
      );
      return payload;
    }
  }

  const itemRef = doc(db, 'pending_items', item.id);
  await setDoc(itemRef, payload, { merge: true });
  recordFirestoreOperation('write', 1);

  createAuditLog(
    'SAVE_PENDING_ITEM',
    `Salvou item em pendência SKU: [${payload.sku}] ${payload.productName}. Motivo: ${payload.pendingReason}`
  );

  return payload;
};

export const deletePendingItem = async (id: string, sku?: string, name?: string): Promise<void> => {
  const cleanId = (id || '').trim();
  if (!cleanId) return;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('pending_items').delete().eq('id', cleanId);
      if (error) {
        console.error('Supabase delete pending_items error:', error);
        throw new Error(`Falha ao excluir item em pendência no Supabase: ${error.message}`);
      }
      createAuditLog('DELETE_PENDING_ITEM', `Excluiu item em pendência SKU: ${sku || cleanId} ${name ? `- ${name}` : ''}`);
      return;
    }
  }

  const itemRef = doc(db, 'pending_items', cleanId);
  await deleteDoc(itemRef);
  recordFirestoreOperation('delete', 1);
  createAuditLog('DELETE_PENDING_ITEM', `Excluiu item em pendência SKU: ${sku || cleanId} ${name ? `- ${name}` : ''}`);
};

export const updatePendingItemStatus = async (id: string, status: PendingStatusType): Promise<void> => {
  const now = new Date().toISOString();

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const updateData: any = {
        status,
        updated_at: now
      };
      if (status === 'Resolvido') {
        updateData.resolved_at = now;
      }
      await supabase.from('pending_items').update(updateData).eq('id', id);
      createAuditLog('UPDATE_PENDING_STATUS', `Alterou status da pendência ID ${id} para: ${status}`);
      return;
    }
  }

  const itemRef = doc(db, 'pending_items', id);
  const updateData: any = {
    status,
    updatedAt: now
  };
  if (status === 'Resolvido') {
    updateData.resolvedAt = now;
  }
  await updateDoc(itemRef, updateData);
  recordFirestoreOperation('write', 1);
  createAuditLog('UPDATE_PENDING_STATUS', `Alterou status da pendência ID ${id} para: ${status}`);
};

export const transferPendingItemToStock = async (
  pendingItem: PendingItem,
  destinationSector: DestinationSectorType,
  triageDetails?: {
    deviceStatus?: string;
    packageStatus?: string;
    accessoriesInclusion?: string;
    notes?: string;
  }
): Promise<TriageUnit> => {
  const newTriageId = `tr-pend-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  
  const newUnit: TriageUnit = {
    id: newTriageId,
    trackingCode: pendingItem.trackingCode || '',
    serialNumber: pendingItem.serialNumber || '',
    baseProductId: `bp-custom-${(pendingItem.sku || 'ITEM').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    baseProductName: pendingItem.productName || 'Produto Transferido de Pendências',
    baseProductSku: pendingItem.sku || 'SEM-SKU',
    baseProductVoltage: pendingItem.voltage || 'Bivolt',
    platform: (pendingItem.platform as any) || 'Mercado Livre',
    customerReason: `Liberado de Pendências: ${pendingItem.pendingReason}. ${pendingItem.detailedNotes || ''}`,
    deviceStatus: triageDetails?.deviceStatus || 'Usado',
    packageStatus: triageDetails?.packageStatus || 'Danificada',
    accessoriesInclusion: triageDetails?.accessoriesInclusion || 'Item liberado após resolução de pendência.',
    destinationSector: destinationSector,
    notes: triageDetails?.notes || `<p><strong>Item Liberado da Aba de Pendências:</strong></p><p>Motivo original: ${pendingItem.pendingReason}</p><p>${pendingItem.detailedNotes || ''}</p>`,
    photosProduct: pendingItem.photos || [],
    photosBox: [],
    photosAccessories: [],
    createdAt: new Date().toISOString(),
    status: 'Estoque'
  };

  // 1. Save unit to physical stock
  await saveTriageUnit(newUnit);

  // 2. Mark pending item as resolved and transferred
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('pending_items').update({
        status: 'Resolvido',
        transferred_to_stock: true,
        transferred_unit_id: newTriageId,
        destination_sector_suggested: destinationSector,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', pendingItem.id);

      await createAuditLog(
        'TRANSFER_PENDING_TO_STOCK',
        `Transferiu item da pendência [${pendingItem.sku}] para o estoque físico no setor [${destinationSector}] (Supabase). Triagem ID: ${newTriageId}`
      );

      return newUnit;
    }
  }

  const itemRef = doc(db, 'pending_items', pendingItem.id);
  await updateDoc(itemRef, {
    status: 'Resolvido',
    transferredToStock: true,
    transferredUnitId: newTriageId,
    destinationSectorSuggested: destinationSector,
    resolvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await createAuditLog(
    'TRANSFER_PENDING_TO_STOCK',
    `Transferiu item da pendência [${pendingItem.sku}] para o estoque físico no setor [${destinationSector}]. Triagem ID: ${newTriageId}`
  );

  return newUnit;
};

// SEED HELPERS

const seedBaseProducts = async () => {
  try {
    for (const p of DEFAULT_BASE_PRODUCTS) {
      await setDoc(doc(db, 'products', p.id), {
        name: p.name,
        sku: p.sku,
        voltage: p.voltage,
        description: p.description || '',
        imageUrl: p.imageUrl || '',
        images: p.imageUrl ? [p.imageUrl] : [],
        accessories: p.accessories || '',
        brand: p.brand || '',
        category: p.category || ''
      });
    }
    console.log('Base products seeded successfully.');
  } catch (err) {
    console.error('Error seeding products:', err);
  }
};

const seedTriageUnits = async () => {
  try {
    for (const u of DEFAULT_TRIAGE_UNITS) {
      await setDoc(doc(db, 'triage_units', u.id), {
        trackingCode: u.trackingCode,
        serialNumber: u.serialNumber || '',
        baseProductId: u.baseProductId,
        baseProductName: u.baseProductName,
        baseProductSku: u.baseProductSku,
        baseProductVoltage: u.baseProductVoltage,
        platform: u.platform,
        customerReason: u.customerReason,
        deviceStatus: u.deviceStatus,
        packageStatus: u.packageStatus,
        accessoriesInclusion: u.accessoriesInclusion,
        destinationSector: u.destinationSector,
        notes: u.notes,
        photosProduct: u.photosProduct,
        photosBox: u.photosBox,
        photosAccessories: u.photosAccessories,
        createdAt: u.createdAt,
        status: u.status
      });
    }
    console.log('Triage units seeded successfully.');
  } catch (err) {
    console.error('Error seeding triage units:', err);
  }
};

const DEFAULT_CASES: CaseTracking[] = [
  {
    id: 'case-1',
    code: '2001020392010230',
    platform: 'Mercado Livre',
    createdAt: '2026-07-19',
    reason: 'Não devolveu',
    resolution: 'Favorável',
    status: 'Resolvido',
    notes: 'Solicitação de reembolso aberta devido à devolução vazia do cliente. Aprovado pelo suporte da plataforma.'
  },
  {
    id: 'case-2',
    code: '8273910283091',
    platform: 'Amazon',
    createdAt: '2026-07-18',
    reason: 'Falta acessórios / produto diferente',
    resolution: 'Pendente de Resolução',
    status: 'Pendente',
    notes: 'Contestação encaminhada com fotos do recebido no galpão.'
  }
];

// Default daily inflows matching the user's provided spreadsheet image
export const DEFAULT_DAILY_INFLOWS: DailyInflowRecord[] = [
  {
    id: 'inflow-2026-05-25',
    date: '2026-05-25',
    rma: 23,
    estoque: 25,
    openbox: 2,
    es: 0,
    totalDia: 50,
    source: 'excel',
    notes: 'Carga recebida na segunda-feira',
    createdAt: '2026-05-25T08:30:00.000Z',
    updatedAt: '2026-05-25T08:30:00.000Z'
  },
  {
    id: 'inflow-2026-05-26',
    date: '2026-05-26',
    rma: 11,
    estoque: 15,
    openbox: 1,
    es: 44,
    totalDia: 71,
    source: 'excel',
    notes: 'Lote ES recebido via transporte terceirizado',
    createdAt: '2026-05-26T08:30:00.000Z',
    updatedAt: '2026-05-26T08:30:00.000Z'
  },
  {
    id: 'inflow-2026-05-27',
    date: '2026-05-27',
    rma: 11,
    estoque: 25,
    openbox: 5,
    es: 54,
    totalDia: 95,
    source: 'excel',
    notes: 'Pico de triagem quarta-feira',
    createdAt: '2026-05-27T08:30:00.000Z',
    updatedAt: '2026-05-27T08:30:00.000Z'
  },
  {
    id: 'inflow-2026-05-28',
    date: '2026-05-28',
    rma: 15,
    estoque: 24,
    openbox: 2,
    es: 0,
    totalDia: 41,
    source: 'excel',
    notes: 'Entradas regulares',
    createdAt: '2026-05-28T08:30:00.000Z',
    updatedAt: '2026-05-28T08:30:00.000Z'
  },
  {
    id: 'inflow-2026-05-29',
    date: '2026-05-29',
    rma: 2,
    estoque: 6,
    openbox: 2,
    es: 0,
    totalDia: 10,
    source: 'excel',
    notes: 'Fechamento semanal',
    createdAt: '2026-05-29T08:30:00.000Z',
    updatedAt: '2026-05-29T08:30:00.000Z'
  }
];

const seedCaseTracking = async () => {
  try {
    for (const c of DEFAULT_CASES) {
      await setDoc(doc(db, 'cases', c.id), {
        code: c.code,
        platform: c.platform,
        createdAt: c.createdAt,
        reason: c.reason,
        resolution: c.resolution,
        status: c.status || 'Pendente',
        notes: c.notes || ''
      });
    }
    console.log('Case tracking seeded successfully.');
  } catch (err) {
    console.error('Error seeding case tracking:', err);
  }
};

export const seedDailyInflows = async () => {
  try {
    for (const item of DEFAULT_DAILY_INFLOWS) {
      await setDoc(doc(db, 'daily_inflows', item.id), {
        date: item.date,
        rma: item.rma,
        estoque: item.estoque,
        openbox: item.openbox,
        es: item.es,
        totalDia: item.totalDia,
        source: item.source || 'excel',
        notes: item.notes || '',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString()
      });
    }
    console.log('Daily inflows seeded successfully.');
  } catch (err) {
    console.error('Error seeding daily inflows:', err);
  }
};

export const saveDailyInflow = async (record: DailyInflowRecord): Promise<void> => {
  const docId = record.id || `inflow-${record.date}`;
  const total = Number(record.rma || 0) + Number(record.estoque || 0) + Number(record.openbox || 0) + Number(record.es || 0);

  const payload: DailyInflowRecord = {
    id: docId,
    date: record.date,
    rma: Number(record.rma || 0),
    estoque: Number(record.estoque || 0),
    openbox: Number(record.openbox || 0),
    es: Number(record.es || 0),
    totalDia: total,
    notes: record.notes || '',
    source: record.source || 'manual',
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('daily_inflows').upsert(mapDailyInflowToSupabase(payload));
      await createAuditLog(
        'SAVE_DAILY_INFLOW',
        `Registrou lançamento de entradas para ${record.date} (Supabase). Total: ${total} unidades (RMA: ${record.rma}, Estoque: ${record.estoque}, Openbox: ${record.openbox}, ES: ${record.es})`
      );
      return;
    }
  }

  const inflowRef = doc(db, 'daily_inflows', docId);
  const docSnap = await getDoc(inflowRef);
  recordFirestoreOperation('read', 1);
  const isUpdate = docSnap.exists();

  if (isUpdate) {
    payload.createdAt = docSnap.data()?.createdAt || payload.createdAt;
  }

  await setDoc(inflowRef, payload);
  recordFirestoreOperation('write', 1);
  await createAuditLog(
    isUpdate ? 'UPDATE_DAILY_INFLOW' : 'CREATE_DAILY_INFLOW',
    `${isUpdate ? 'Atualizou' : 'Registrou'} lançamento de entradas para ${record.date}. Total: ${total} unidades (RMA: ${record.rma}, Estoque: ${record.estoque}, Openbox: ${record.openbox}, ES: ${record.es})`
  );
};

export const saveBatchDailyInflows = async (records: DailyInflowRecord[]): Promise<number> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const rows = records.map(record => {
        const docId = record.id || `inflow-${record.date}`;
        const total = Number(record.rma || 0) + Number(record.estoque || 0) + Number(record.openbox || 0) + Number(record.es || 0);
        return mapDailyInflowToSupabase({
          id: docId,
          date: record.date,
          rma: Number(record.rma || 0),
          estoque: Number(record.estoque || 0),
          openbox: Number(record.openbox || 0),
          es: Number(record.es || 0),
          totalDia: total,
          notes: record.notes || '',
          source: 'excel',
          createdAt: record.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
      await supabase.from('daily_inflows').upsert(rows);
      await createAuditLog(
        'IMPORT_EXCEL_INFLOWS',
        `Importou ${records.length} registro(s) diários via planilha Excel no Supabase.`
      );
      return records.length;
    }
  }

  let count = 0;
  for (const record of records) {
    const docId = record.id || `inflow-${record.date}`;
    const inflowRef = doc(db, 'daily_inflows', docId);
    const total = Number(record.rma || 0) + Number(record.estoque || 0) + Number(record.openbox || 0) + Number(record.es || 0);

    await setDoc(inflowRef, {
      id: docId,
      date: record.date,
      rma: Number(record.rma || 0),
      estoque: Number(record.estoque || 0),
      openbox: Number(record.openbox || 0),
      es: Number(record.es || 0),
      totalDia: total,
      notes: record.notes || '',
      source: 'excel',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    count++;
  }
  recordFirestoreOperation('write', count);

  await createAuditLog(
    'IMPORT_EXCEL_INFLOWS',
    `Importou ${count} registro(s) diários via planilha Excel para o Fluxo de Entradas.`
  );
  return count;
};

export const deleteDailyInflow = async (id: string): Promise<void> => {
  const cleanId = (id || '').trim();
  if (!cleanId) return;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('daily_inflows').delete().eq('id', cleanId);
      if (error) {
        console.error('Supabase delete daily_inflows error:', error);
        throw new Error(`Falha ao excluir fluxo diário no Supabase: ${error.message}`);
      }
      await createAuditLog('DELETE_DAILY_INFLOW', `Excluiu lançamento de entrada ID: ${cleanId} (Supabase)`);
      return;
    }
  }

  const inflowRef = doc(db, 'daily_inflows', cleanId);
  const docSnap = await getDoc(inflowRef);
  recordFirestoreOperation('read', 1);
  if (docSnap.exists()) {
    const data = docSnap.data();
    await deleteDoc(inflowRef);
    recordFirestoreOperation('delete', 1);
    await createAuditLog('DELETE_DAILY_INFLOW', `Excluiu lançamento de entrada do dia: ${data.date}`);
  }
};

export const saveCaseTracking = async (caseData: CaseTracking): Promise<void> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('cases').upsert({
        id: caseData.id,
        code: caseData.code,
        platform: caseData.platform,
        created_at: caseData.createdAt,
        reason: caseData.reason,
        resolution: caseData.resolution,
        status: caseData.status || 'Pendente',
        notes: caseData.notes || '',
        value: caseData.value !== undefined ? caseData.value : null
      });
      return;
    }
  }

  const caseRef = doc(db, 'cases', caseData.id);
  await setDoc(caseRef, {
    code: caseData.code,
    platform: caseData.platform,
    createdAt: caseData.createdAt,
    reason: caseData.reason,
    resolution: caseData.resolution,
    status: caseData.status || 'Pendente',
    notes: caseData.notes || '',
    ...(caseData.value !== undefined ? { value: caseData.value } : {})
  });
};

export const deleteCaseTracking = async (id: string): Promise<void> => {
  const cleanId = (id || '').trim();
  if (!cleanId) return;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('cases').delete().eq('id', cleanId);
      if (error) {
        console.error('Supabase delete cases error:', error);
        throw new Error(`Falha ao excluir caso no Supabase: ${error.message}`);
      }
      return;
    }
  }

  const caseRef = doc(db, 'cases', cleanId);
  const docSnap = await getDoc(caseRef);
  if (docSnap.exists()) {
    await deleteDoc(caseRef);
  }
};

// BASE CRUD & PAGINATED ACTIONS

export const getInitialBaseProducts = async (pageSize: number = 2500): Promise<PaginatedResult<BaseProduct>> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(pageSize);
      if (!error && data) {
        const list = data.map(mapSupabaseToProduct);
        return {
          data: list,
          lastDoc: null,
          hasMore: data.length === pageSize
        };
      }
    }
  }

  try {
    const q = query(
      collection(db, 'products'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));

    if (snapshot.empty) {
      const fallbackQ = query(collection(db, 'products'), limit(pageSize));
      const fallbackSnap = await getDocs(fallbackQ);
      recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
      const list: BaseProduct[] = [];
      fallbackSnap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as BaseProduct);
      });
      return {
        data: list,
        lastDoc: fallbackSnap.docs[fallbackSnap.docs.length - 1] || null,
        hasMore: fallbackSnap.docs.length === pageSize
      };
    }

    const list: BaseProduct[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as BaseProduct);
    });

    return {
      data: list,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  } catch (err) {
    console.error('Error fetching initial base products with orderBy, applying fallback:', err);
    const fallbackQ = query(collection(db, 'products'), limit(pageSize));
    const fallbackSnap = await getDocs(fallbackQ);
    recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
    const list: BaseProduct[] = [];
    fallbackSnap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as BaseProduct);
    });
    return {
      data: list,
      lastDoc: fallbackSnap.docs[fallbackSnap.docs.length - 1] || null,
      hasMore: fallbackSnap.docs.length === pageSize
    };
  }
};

export const getMoreBaseProducts = async (
  lastDoc: QueryDocumentSnapshot | null,
  pageSize: number = 2500
): Promise<PaginatedResult<BaseProduct>> => {
  if (getActiveDbProvider() === 'supabase') {
    return { data: [], lastDoc: null, hasMore: false };
  }

  if (!lastDoc) {
    return { data: [], lastDoc: null, hasMore: false };
  }

  try {
    const q = query(
      collection(db, 'products'),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(pageSize)
    );
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));

    if (snapshot.empty) {
      const fallbackQ = query(
        collection(db, 'products'),
        startAfter(lastDoc),
        limit(pageSize)
      );
      const fallbackSnap = await getDocs(fallbackQ);
      recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
      const list: BaseProduct[] = [];
      fallbackSnap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as BaseProduct);
      });
      return {
        data: list,
        lastDoc: fallbackSnap.docs[fallbackSnap.docs.length - 1] || null,
        hasMore: fallbackSnap.docs.length === pageSize
      };
    }

    const list: BaseProduct[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as BaseProduct);
    });

    return {
      data: list,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  } catch (err) {
    console.error('Error in getMoreBaseProducts:', err);
    return { data: [], lastDoc: null, hasMore: false };
  }
};

export const getInitialTriageUnits = async (pageSize: number = 2500): Promise<PaginatedResult<TriageUnit>> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('triage_units')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(pageSize);
      if (!error && data) {
        const list = data.map(mapSupabaseToTriageUnit);
        return {
          data: list,
          lastDoc: null,
          hasMore: data.length === pageSize
        };
      }
    }
  }

  try {
    const q = query(
      collection(db, 'triage_units'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));
    if (snapshot.empty) {
      const fallbackSnap = await getDocs(query(collection(db, 'triage_units'), limit(pageSize)));
      recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
      const list: TriageUnit[] = [];
      fallbackSnap.forEach(d => list.push({ id: d.id, ...d.data() } as TriageUnit));
      return {
        data: list,
        lastDoc: fallbackSnap.docs[fallbackSnap.docs.length - 1] || null,
        hasMore: fallbackSnap.docs.length === pageSize
      };
    }
    const list: TriageUnit[] = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as TriageUnit));
    return {
      data: list,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  } catch (err) {
    console.error('Error fetching initial triage units:', err);
    const fallbackSnap = await getDocs(query(collection(db, 'triage_units'), limit(pageSize)));
    recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
    const list: TriageUnit[] = [];
    fallbackSnap.forEach(d => list.push({ id: d.id, ...d.data() } as TriageUnit));
    return {
      data: list,
      lastDoc: fallbackSnap.docs[fallbackSnap.docs.length - 1] || null,
      hasMore: fallbackSnap.docs.length === pageSize
    };
  }
};

export const getMoreTriageUnits = async (
  lastDoc: QueryDocumentSnapshot | null,
  pageSize: number = 2500
): Promise<PaginatedResult<TriageUnit>> => {
  if (getActiveDbProvider() === 'supabase') {
    return { data: [], lastDoc: null, hasMore: false };
  }

  if (!lastDoc) return { data: [], lastDoc: null, hasMore: false };
  try {
    const q = query(
      collection(db, 'triage_units'),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(pageSize)
    );
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));
    const list: TriageUnit[] = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as TriageUnit));
    return {
      data: list,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  } catch (err) {
    console.error('Error fetching more triage units:', err);
    return { data: [], lastDoc: null, hasMore: false };
  }
};

export const getInitialPendingItems = async (pageSize: number = 1000): Promise<PendingItem[]> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('pending_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(pageSize);
      if (!error && data) {
        return data.map(mapSupabaseToPendingItem);
      }
    }
  }

  try {
    const q = query(collection(db, 'pending_items'), orderBy('createdAt', 'desc'), limit(pageSize));
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));
    if (snapshot.empty) {
      const fallbackSnap = await getDocs(query(collection(db, 'pending_items'), limit(pageSize)));
      recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
      const list: PendingItem[] = [];
      fallbackSnap.forEach(d => list.push({ id: d.id, ...d.data() } as PendingItem));
      return list;
    }
    const list: PendingItem[] = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as PendingItem));
    return list;
  } catch (err) {
    console.error('Error fetching pending items:', err);
    const fallbackSnap = await getDocs(query(collection(db, 'pending_items'), limit(pageSize)));
    recordFirestoreOperation('read', Math.max(1, fallbackSnap.size));
    const list: PendingItem[] = [];
    fallbackSnap.forEach(d => list.push({ id: d.id, ...d.data() } as PendingItem));
    return list;
  }
};

export const getInitialDailyInflows = async (limitCount: number = 1000): Promise<DailyInflowRecord[]> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('daily_inflows')
        .select('*')
        .order('date', { ascending: true })
        .limit(limitCount);
      if (!error && data) {
        return data.map(mapSupabaseToDailyInflow);
      }
    }
  }

  try {
    const q = query(collection(db, 'daily_inflows'), limit(limitCount));
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));
    const list: DailyInflowRecord[] = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as DailyInflowRecord));
    list.sort((a, b) => a.date.localeCompare(b.date));
    return list;
  } catch (err) {
    console.error('Error fetching daily inflows:', err);
    return [];
  }
};

export const getAuditLogs = async (limitCount: number = 50): Promise<any[]> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limitCount);
      if (!error && data) {
        return data.map(r => ({
          id: r.id,
          userId: r.user_id,
          userEmail: r.user_email,
          action: r.action,
          details: r.details,
          timestamp: r.timestamp
        }));
      }
    }
  }

  try {
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    recordFirestoreOperation('read', Math.max(1, snapshot.size));
    const list: any[] = [];
    snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list;
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return [];
  }
};

export const getBaseProducts = async (): Promise<BaseProduct[]> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
      if (data) return data.map(mapSupabaseToProduct);
    }
  }

  const snapshot = await getDocs(collection(db, 'products'));
  const list: BaseProduct[] = [];
  snapshot.forEach((docSnap) => {
    list.push({ id: docSnap.id, ...docSnap.data() } as BaseProduct);
  });
  return list;
};

export const getTriageUnits = async (): Promise<TriageUnit[]> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.from('triage_units').select('*').order('created_at', { ascending: false });
      if (data) return data.map(mapSupabaseToTriageUnit);
    }
  }

  const snapshot = await getDocs(collection(db, 'triage_units'));
  const list: TriageUnit[] = [];
  snapshot.forEach((docSnap) => {
    list.push({ id: docSnap.id, ...docSnap.data() } as TriageUnit);
  });
  return list;
};

export const saveBaseProduct = async (product: BaseProduct): Promise<BaseProduct> => {
  const now = new Date().toISOString();
  const savedItem: BaseProduct = {
    ...product,
    createdAt: product.createdAt || now,
    updatedAt: now,
    images: product.images || (product.imageUrl ? [product.imageUrl] : []),
    imagesProduct: product.imagesProduct || [],
    imagesBox: product.imagesBox || [],
    imagesAccessories: product.imagesAccessories || []
  };

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('products').upsert(mapProductToSupabase(savedItem));
      createAuditLog('SAVE_PRODUCT', `Salvou produto master (Supabase) SKU: ${product.sku} - ${product.name}`);
      return savedItem;
    }
  }

  const productRef = doc(db, 'products', product.id);
  // Zero-read write with merge
  await setDoc(productRef, savedItem, { merge: true });
  recordFirestoreOperation('write', 1);

  createAuditLog('SAVE_PRODUCT', `Salvou produto master SKU: ${product.sku} - ${product.name}`);

  return savedItem;
};

export const saveBatchBaseProducts = async (
  productsToSave: BaseProduct[],
  existingProducts: BaseProduct[]
): Promise<{ added: number; updated: number; savedProducts: BaseProduct[] }> => {
  let added = 0;
  let updated = 0;
  const savedProducts: BaseProduct[] = [];
  const now = new Date().toISOString();

  for (const item of productsToSave) {
    const cleanSku = item.sku.trim().toUpperCase();
    const existing = existingProducts.find(
      p => p.sku.trim().toUpperCase() === cleanSku || p.id === item.id
    );

    const docId = existing ? existing.id : (item.id || `bp-${cleanSku.replace(/[^A-Z0-9_-]/gi, '_')}-${Date.now()}`);

    const payload: BaseProduct = {
      id: docId,
      name: item.name.trim(),
      sku: cleanSku,
      voltage: item.voltage || existing?.voltage || 'Bivolt',
      description: item.description !== undefined ? item.description : (existing?.description || item.name.trim()),
      imageUrl: item.imageUrl || existing?.imageUrl || '',
      images: item.images || existing?.images || (item.imageUrl ? [item.imageUrl] : []),
      imagesProduct: item.imagesProduct || existing?.imagesProduct || [],
      imagesBox: item.imagesBox || existing?.imagesBox || [],
      imagesAccessories: item.imagesAccessories || existing?.imagesAccessories || [],
      accessories: item.accessories !== undefined ? item.accessories : (existing?.accessories || ''),
      brand: item.brand !== undefined ? item.brand : (existing?.brand || ''),
      category: item.category !== undefined ? item.category : (existing?.category || ''),
      createdAt: existing?.createdAt || item.createdAt || now,
      updatedAt: now
    };

    savedProducts.push(payload);

    if (existing) {
      updated++;
    } else {
      added++;
    }
  }

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const rows = savedProducts.map(mapProductToSupabase);
      await supabase.from('products').upsert(rows);
      createAuditLog(
        'IMPORT_EXCEL_CATALOG',
        `Importou planilha no Catálogo de Base (Supabase): ${added} novo(s) e ${updated} atualizado(s).`
      );
      return { added, updated, savedProducts };
    }
  }

  for (const payload of savedProducts) {
    const productRef = doc(db, 'products', payload.id);
    await setDoc(productRef, payload, { merge: true });
  }
  recordFirestoreOperation('write', savedProducts.length);

  createAuditLog(
    'IMPORT_EXCEL_CATALOG',
    `Importou planilha no Catálogo de Base: ${added} novo(s) produto(s) adicionados e ${updated} atualizados.`
  );

  return { added, updated, savedProducts };
};

export const deleteBaseProduct = async (id: string, sku?: string, name?: string): Promise<void> => {
  const cleanId = (id || '').trim();
  if (!cleanId) return;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('products').delete().eq('id', cleanId);
      if (error) {
        console.error('Supabase delete products error:', error);
        throw new Error(`Falha ao excluir produto no Supabase: ${error.message}`);
      }
      createAuditLog('DELETE_PRODUCT', `Deletou o produto master (Supabase) SKU: ${sku || cleanId} ${name ? `- ${name}` : ''}`);
      return;
    }
  }

  const productRef = doc(db, 'products', cleanId);
  await deleteDoc(productRef);
  recordFirestoreOperation('delete', 1);
  createAuditLog('DELETE_PRODUCT', `Deletou o produto master SKU: ${sku || cleanId} ${name ? `- ${name}` : ''}`);
};

export const saveTriageUnit = async (unit: TriageUnit): Promise<TriageUnit> => {
  const now = new Date().toISOString();
  const savedUnit: TriageUnit = {
    ...unit,
    createdAt: unit.createdAt || now
  };

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('triage_units').upsert(mapTriageUnitToSupabase(savedUnit));
      createAuditLog(
        'SAVE_TRIAGE',
        `Salvou entrada de RMA (Supabase) de ${unit.platform}. Rastreamento: ${unit.trackingCode} (${unit.baseProductName})`
      );
      return savedUnit;
    }
  }

  const unitRef = doc(db, 'triage_units', unit.id);
  // Zero-read write with setDoc
  await setDoc(unitRef, savedUnit, { merge: true });
  recordFirestoreOperation('write', 1);

  createAuditLog(
    'SAVE_TRIAGE',
    `Salvou entrada de RMA de ${unit.platform}. Rastreamento: ${unit.trackingCode} (${unit.baseProductName})`
  );

  return savedUnit;
};

export const deleteTriageUnit = async (id: string, trackingCode?: string, name?: string): Promise<void> => {
  const cleanId = (id || '').trim();
  if (!cleanId) return;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('triage_units').delete().eq('id', cleanId);
      if (error) {
        console.error('Supabase delete triage_units error:', error);
        throw new Error(`Falha ao excluir triagem no Supabase: ${error.message}`);
      }
      createAuditLog('DELETE_TRIAGE', `Excluiu triagem do registro de RMA (Supabase): ${trackingCode || cleanId} ${name ? `(${name})` : ''}`);
      return;
    }
  }

  const unitRef = doc(db, 'triage_units', cleanId);
  await deleteDoc(unitRef);
  recordFirestoreOperation('delete', 1);
  createAuditLog('DELETE_TRIAGE', `Excluiu triagem do registro de RMA: ${trackingCode || cleanId} ${name ? `(${name})` : ''}`);
};

export const checkoutTriageUnit = async (id: string, trackingCode?: string, destination?: string): Promise<void> => {
  const checkoutDate = new Date().toISOString();

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('triage_units').update({
        status: 'Baixado',
        checkout_date: checkoutDate
      }).eq('id', id);
      createAuditLog('CHECKOUT_TRIAGE', `Baixou do estoque o RMA (Supabase): ${trackingCode || id}. Destinado para: ${destination || 'Destino padrão'}`);
      return;
    }
  }

  const unitRef = doc(db, 'triage_units', id);
  await updateDoc(unitRef, {
    status: 'Baixado',
    checkoutDate: checkoutDate
  });
  recordFirestoreOperation('write', 1);
  createAuditLog('CHECKOUT_TRIAGE', `Baixou do estoque o RMA: ${trackingCode || id}. Destinado para: ${destination || 'Destino padrão'}`);
};

export const resetCatalogProducts = async (): Promise<number> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { count } = await supabase.from('products').delete({ count: 'exact' }).neq('id', '___all___');
      localStorage.setItem('base_products_seeded', 'true');
      try {
        await createAuditLog('RESET_CATALOG', `Executou limpeza total do Catálogo de Base no Supabase (${count || 0} produtos removidos).`);
      } catch (err) {
        console.warn('Audit log error:', err);
      }
      return count || 0;
    }
  }

  const productsSnap = await getDocs(collection(db, 'products'));
  const count = productsSnap.docs.length;
  for (const doc of productsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  localStorage.setItem('base_products_seeded', 'true');
  try {
    await createAuditLog('RESET_CATALOG', `Executou limpeza total do Catálogo de Base (${count} produtos removidos).`);
  } catch (err) {
    console.warn('Audit log creation warning:', err);
  }
  return count;
};

export const resetPhysicalStockUnits = async (): Promise<number> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { count } = await supabase.from('triage_units').delete({ count: 'exact' }).neq('id', '___all___');
      localStorage.setItem('triage_units_seeded', 'true');
      try {
        await createAuditLog('RESET_STOCK', `Executou limpeza total do Estoque Físico no Supabase (${count || 0} unidades removidas).`);
      } catch (err) {
        console.warn('Audit log error:', err);
      }
      return count || 0;
    }
  }

  const unitsSnap = await getDocs(collection(db, 'triage_units'));
  const count = unitsSnap.docs.length;
  for (const doc of unitsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  localStorage.setItem('triage_units_seeded', 'true');
  try {
    await createAuditLog('RESET_STOCK', `Executou limpeza total do Estoque Físico e Triagem de RMA (${count} unidades removidas).`);
  } catch (err) {
    console.warn('Audit log creation warning:', err);
  }
  return count;
};

export const resetDailyInflowsRecords = async (): Promise<number> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { count } = await supabase.from('daily_inflows').delete({ count: 'exact' }).neq('id', '___all___');
      localStorage.setItem('daily_inflows_seeded', 'true');
      try {
        await createAuditLog('RESET_INFLOWS', `Executou limpeza total do Fluxo Diário no Supabase (${count || 0} registros removidos).`);
      } catch (err) {
        console.warn('Audit log error:', err);
      }
      return count || 0;
    }
  }

  const inflowsSnap = await getDocs(collection(db, 'daily_inflows'));
  const count = inflowsSnap.docs.length;
  for (const doc of inflowsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  localStorage.setItem('daily_inflows_seeded', 'true');
  try {
    await createAuditLog('RESET_INFLOWS', `Executou limpeza total do Fluxo Diário de Entradas (${count} registros diários removidos).`);
  } catch (err) {
    console.warn('Audit log creation warning:', err);
  }
  return count;
};

export const resetAuditLogsRecords = async (): Promise<number> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { count } = await supabase.from('audit_logs').delete({ count: 'exact' }).neq('id', '___all___');
      try {
        await createAuditLog('RESET_LOGS', `Executou limpeza do histórico de logs no Supabase (${count || 0} logs anteriores apagados).`);
      } catch (err) {
        console.warn('Audit log error:', err);
      }
      return count || 0;
    }
  }

  const logsSnap = await getDocs(collection(db, 'logs'));
  const count = logsSnap.docs.length;
  for (const doc of logsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  try {
    await createAuditLog('RESET_LOGS', `Executou limpeza do histórico de logs (${count} logs anteriores apagados).`);
  } catch (err) {
    console.warn('Audit log creation warning:', err);
  }
  return count;
};

export const resetDatabaseToDefaults = async (): Promise<void> => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('products').delete().neq('id', '___all___');
      await supabase.from('triage_units').delete().neq('id', '___all___');
      await supabase.from('cases').delete().neq('id', '___all___');
      await supabase.from('daily_inflows').delete().neq('id', '___all___');
      await supabase.from('pending_items').delete().neq('id', '___all___');
      await supabase.from('audit_logs').delete().neq('id', '___all___');

      localStorage.setItem('base_products_seeded', 'true');
      localStorage.setItem('triage_units_seeded', 'true');
      localStorage.setItem('cases_seeded', 'true');
      localStorage.setItem('daily_inflows_seeded', 'true');

      try {
        await createAuditLog('RESET_DATABASE', 'Executou limpeza total do banco de dados no Supabase. Sistema limpo com 0 registros.');
      } catch (logErr) {
        console.warn('Audit log warning:', logErr);
      }
      return;
    }
  }

  // Clear products
  const productsSnap = await getDocs(collection(db, 'products'));
  for (const doc of productsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  
  // Clear triage units (physical stock)
  const unitsSnap = await getDocs(collection(db, 'triage_units'));
  for (const doc of unitsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  
  // Clear case tracking
  const casesSnap = await getDocs(collection(db, 'cases'));
  for (const doc of casesSnap.docs) {
    await deleteDoc(doc.ref);
  }
  
  // Clear daily inflows
  const inflowsSnap = await getDocs(collection(db, 'daily_inflows'));
  for (const doc of inflowsSnap.docs) {
    await deleteDoc(doc.ref);
  }

  // Clear all saved audit logs
  const logsSnap = await getDocs(collection(db, 'logs'));
  for (const doc of logsSnap.docs) {
    await deleteDoc(doc.ref);
  }

  // Set flags to true so no automatic mocks are created
  localStorage.setItem('base_products_seeded', 'true');
  localStorage.setItem('triage_units_seeded', 'true');
  localStorage.setItem('cases_seeded', 'true');
  localStorage.setItem('daily_inflows_seeded', 'true');
  
  try {
    await createAuditLog('RESET_DATABASE', 'Executou limpeza total do banco de dados (produtos, triagens, estoque, casos e logs). Sistema limpo com 0 registros.');
  } catch (logErr) {
    console.warn('Audit log creation warning after database reset:', logErr);
  }
};

// ==========================================
// USER MANAGEMENT & RBAC HELPERS (SUPABASE + FIRESTORE)
// ==========================================

/**
 * Subscribe to all users in the 'users' collection (Real-time for Admin view)
 */
export const subscribeToUsers = (callback: (users: UserAccount[]) => void) => {
  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      (async () => {
        try {
          const { data, error } = await supabase.from('users').select('*');
          if (error) {
            console.warn('Supabase users table note:', error.message);
            return;
          }
          if (data) {
            const list = data.map(mapSupabaseToUser);
            list.sort((a, b) => {
              if (a.role === 'admin' && b.role !== 'admin') return -1;
              if (a.role !== 'admin' && b.role === 'admin') return 1;
              return a.name.localeCompare(b.name);
            });
            callback(list);
          }
        } catch (err) {
          console.warn('Silent catch for Supabase users query:', err);
        }
      })();

      const channel = supabase.channel('realtime_users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
          try {
            const { data, error } = await supabase.from('users').select('*');
            if (error) return;
            if (data) {
              const list = data.map(mapSupabaseToUser);
              list.sort((a, b) => {
                if (a.role === 'admin' && b.role !== 'admin') return -1;
                if (a.role !== 'admin' && b.role === 'admin') return 1;
                return a.name.localeCompare(b.name);
              });
              callback(list);
            }
          } catch (e) {
            // Ignore background realtime errors
          }
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }

  const usersRef = collection(db, 'users');
  return onSnapshot(usersRef, (snapshot) => {
    const list: UserAccount[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        email: data.email || '',
        name: data.name || 'Usuário Corporativo',
        role: (data.role === 'admin' ? 'admin' : 'operator') as 'admin' | 'operator',
        createdAt: data.createdAt || '',
        lastLogin: data.lastLogin || ''
      };
    });
    // Sort: Admins first, then by name
    list.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return a.name.localeCompare(b.name);
    });
    callback(list);
  }, (err) => {
    console.error('Error subscribing to users collection:', err);
  });
};

/**
 * Update any user's role (Admin / Operator) in database
 */
export const updateUserRoleInDb = async (
  uid: string, 
  newRole: 'admin' | 'operator',
  targetEmail?: string
): Promise<void> => {
  const roleLabel = newRole === 'admin' ? 'Administrador (Acesso Total)' : 'Logística / Operador';

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('users').update({
        role: newRole,
        updated_at: new Date().toISOString()
      }).eq('uid', uid);
      await createAuditLog('UPDATE_USER_ROLE', `Alterou permissões de acesso do usuário ${targetEmail || uid} para: ${roleLabel} (Supabase)`);
      return;
    }
  }

  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    role: newRole,
    updatedAt: new Date().toISOString()
  });

  await createAuditLog('UPDATE_USER_ROLE', `Alterou permissões de acesso do usuário ${targetEmail || uid} para: ${roleLabel}`);
};

/**
 * Delete a user profile document from database
 */
export const deleteUserDocumentFromDb = async (uid: string, targetEmail?: string): Promise<void> => {
  const cleanUid = (uid || '').trim();
  if (!cleanUid) return;

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('uid', cleanUid);
      if (error) {
        console.error('Supabase delete users error:', error);
        throw new Error(`Falha ao excluir usuário no Supabase: ${error.message}`);
      }
      try {
        await createAuditLog('DELETE_USER', `Removeu o registro do usuário ${targetEmail || cleanUid} do Supabase`);
      } catch (logErr) {
        console.warn('Non-blocking audit log creation error on user delete:', logErr);
      }
      return;
    }
  }

  const userDocRef = doc(db, 'users', cleanUid);
  await deleteDoc(userDocRef);
  try {
    await createAuditLog('DELETE_USER', `Removeu o registro do usuário ${targetEmail || cleanUid} do Firestore`);
  } catch (logErr) {
    console.warn('Non-blocking audit log creation error on user delete:', logErr);
  }
};

/**
 * Ensure user document exists in database / Auto-heal missing profiles
 */
export const ensureUserProfileExists = async (currentUser: any): Promise<UserAccount | null> => {
  if (!currentUser || !currentUser.uid) return null;
  const isMasterAdmin = currentUser.email === 'alessandro.away6@gmail.com';
  const initialProfile: UserAccount = {
    uid: currentUser.uid,
    email: currentUser.email || '',
    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Operador Corporativo',
    role: isMasterAdmin ? 'admin' : 'operator',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  if (getActiveDbProvider() === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('uid', currentUser.uid).maybeSingle();
        if (error) {
          console.warn('Supabase user profile fetch note:', error.message);
          // If table doesn't exist, don't crash
          return initialProfile;
        }
        if (!data) {
          try {
            await supabase.from('users').upsert(mapUserToSupabase(initialProfile));
          } catch (e) {
            // ignore if table not created
          }
          return initialProfile;
        } else {
          const role = isMasterAdmin ? 'admin' : (data.role || 'operator');
          try {
            if (isMasterAdmin && data.role !== 'admin') {
              await supabase.from('users').update({ role: 'admin', last_login: new Date().toISOString() }).eq('uid', currentUser.uid);
            } else {
              await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('uid', currentUser.uid);
            }
          } catch (e) {
            // ignore
          }
          return {
            uid: data.uid,
            email: data.email || currentUser.email || '',
            name: data.name || currentUser.displayName || 'Operador Corporativo',
            role: role as 'admin' | 'operator',
            createdAt: data.created_at || '',
            lastLogin: new Date().toISOString()
          };
        }
      } catch (supaErr) {
        console.warn('Supabase user profile fetch error:', supaErr);
        return initialProfile;
      }
    }
  }

  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(userDocRef);
    
    if (!snap.exists()) {
      await setDoc(userDocRef, initialProfile);
      return initialProfile;
    } else {
      const data = snap.data();
      // If master admin and not yet admin, upgrade
      if (currentUser.email === 'alessandro.away6@gmail.com' && data.role !== 'admin') {
        await updateDoc(userDocRef, { role: 'admin' });
      }
      return {
        uid: snap.id,
        email: data.email || currentUser.email || '',
        name: data.name || currentUser.displayName || 'Operador Corporativo',
        role: (data.role === 'admin' ? 'admin' : 'operator') as 'admin' | 'operator',
        createdAt: data.createdAt || ''
      };
    }
  } catch (err) {
    console.error('Error ensuring user profile in Firestore:', err);
    return initialProfile;
  }
};

