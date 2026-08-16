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
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import { BaseProduct, TriageUnit, PlatformType, DestinationSectorType, CaseTracking, DailyInflowRecord, UserAccount } from '../types';

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

// Corporate Audit Logging helper
export const createAuditLog = async (action: string, details: string) => {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    await addDoc(collection(db, 'logs'), {
      userId: user.uid,
      userEmail: user.email || 'unknown',
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
};

// Image Upload with compressed base64
export const uploadFileToStorage = async (file: File, folder: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve(base64);
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => reject(new Error('Failed to read image.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
};

// REAL-TIME FIRESTORE EVENT LISTENERS

export const subscribeBaseProducts = (
  callback: (products: BaseProduct[]) => void,
  errorCallback?: (err: any) => void
) => {
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
  const inflowRef = doc(db, 'daily_inflows', docId);
  const docSnap = await getDoc(inflowRef);
  const isUpdate = docSnap.exists();
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
    createdAt: isUpdate ? (docSnap.data()?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(inflowRef, payload);
  await createAuditLog(
    isUpdate ? 'UPDATE_DAILY_INFLOW' : 'CREATE_DAILY_INFLOW',
    `${isUpdate ? 'Atualizou' : 'Registrou'} lançamento de entradas para ${record.date}. Total: ${total} unidades (RMA: ${record.rma}, Estoque: ${record.estoque}, Openbox: ${record.openbox}, ES: ${record.es})`
  );
};

export const saveBatchDailyInflows = async (records: DailyInflowRecord[]): Promise<number> => {
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

  await createAuditLog(
    'IMPORT_EXCEL_INFLOWS',
    `Importou ${count} registro(s) diários via planilha Excel para o Fluxo de Entradas.`
  );
  return count;
};

export const deleteDailyInflow = async (id: string): Promise<void> => {
  const inflowRef = doc(db, 'daily_inflows', id);
  const docSnap = await getDoc(inflowRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    await deleteDoc(inflowRef);
    await createAuditLog('DELETE_DAILY_INFLOW', `Excluiu lançamento de entrada do dia: ${data.date}`);
  }
};

export const saveCaseTracking = async (caseData: CaseTracking): Promise<void> => {
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
  const caseRef = doc(db, 'cases', id);
  const docSnap = await getDoc(caseRef);
  if (docSnap.exists()) {
    await deleteDoc(caseRef);
  }
};

// BASE CRUD ACTIONS

export const getBaseProducts = async (): Promise<BaseProduct[]> => {
  const snapshot = await getDocs(collection(db, 'products'));
  const list: BaseProduct[] = [];
  snapshot.forEach((doc) => {
    list.push({ id: doc.id, ...doc.data() } as BaseProduct);
  });
  return list;
};

export const getTriageUnits = async (): Promise<TriageUnit[]> => {
  const snapshot = await getDocs(collection(db, 'triage_units'));
  const list: TriageUnit[] = [];
  snapshot.forEach((doc) => {
    list.push({ id: doc.id, ...doc.data() } as TriageUnit);
  });
  return list;
};

export const saveBaseProduct = async (product: BaseProduct): Promise<void> => {
  const productRef = doc(db, 'products', product.id);
  const docSnap = await getDoc(productRef);
  const isUpdate = docSnap.exists();
  
  await setDoc(productRef, {
    name: product.name,
    sku: product.sku,
    voltage: product.voltage,
    description: product.description || '',
    imageUrl: product.imageUrl || '',
    images: product.images || [],
    imagesProduct: product.imagesProduct || [],
    imagesBox: product.imagesBox || [],
    imagesAccessories: product.imagesAccessories || [],
    accessories: product.accessories || '',
    brand: product.brand || '',
    category: product.category || ''
  });

  await createAuditLog(
    isUpdate ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT',
    `${isUpdate ? 'Atualizou' : 'Criou'} produto master SKU: ${product.sku} - ${product.name}`
  );
};

export const saveBatchBaseProducts = async (
  productsToSave: BaseProduct[],
  existingProducts: BaseProduct[]
): Promise<{ added: number; updated: number }> => {
  let added = 0;
  let updated = 0;

  for (const item of productsToSave) {
    const cleanSku = item.sku.trim().toUpperCase();
    const existing = existingProducts.find(
      p => p.sku.trim().toUpperCase() === cleanSku || p.id === item.id
    );

    const docId = existing ? existing.id : (item.id || `bp-${cleanSku.replace(/[^A-Z0-9_-]/gi, '_')}-${Date.now()}`);
    const productRef = doc(db, 'products', docId);

    const payload = {
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
      category: item.category !== undefined ? item.category : (existing?.category || '')
    };

    await setDoc(productRef, payload, { merge: true });

    if (existing) {
      updated++;
    } else {
      added++;
    }
  }

  await createAuditLog(
    'IMPORT_EXCEL_CATALOG',
    `Importou planilha no Catálogo de Base: ${added} novo(s) produto(s) adicionados e ${updated} atualizados.`
  );

  return { added, updated };
};

export const deleteBaseProduct = async (id: string): Promise<void> => {
  const productRef = doc(db, 'products', id);
  const docSnap = await getDoc(productRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    await deleteDoc(productRef);
    await createAuditLog('DELETE_PRODUCT', `Deletou o produto master SKU: ${data.sku} - ${data.name}`);
  }
};

export const saveTriageUnit = async (unit: TriageUnit): Promise<void> => {
  const unitRef = doc(db, 'triage_units', unit.id);
  const docSnap = await getDoc(unitRef);
  const isUpdate = docSnap.exists();

  await setDoc(unitRef, {
    trackingCode: unit.trackingCode,
    serialNumber: unit.serialNumber || '',
    baseProductId: unit.baseProductId,
    baseProductName: unit.baseProductName,
    baseProductSku: unit.baseProductSku,
    baseProductVoltage: unit.baseProductVoltage,
    platform: unit.platform,
    customerReason: unit.customerReason,
    deviceStatus: unit.deviceStatus,
    packageStatus: unit.packageStatus,
    accessoriesInclusion: unit.accessoriesInclusion,
    destinationSector: unit.destinationSector,
    notes: unit.notes,
    photosProduct: unit.photosProduct,
    photosBox: unit.photosBox,
    photosAccessories: unit.photosAccessories,
    createdAt: unit.createdAt,
    status: unit.status,
    ...(unit.checkoutDate ? { checkoutDate: unit.checkoutDate } : {})
  });

  await createAuditLog(
    isUpdate ? 'UPDATE_TRIAGE' : 'CREATE_TRIAGE',
    `${isUpdate ? 'Atualizou' : 'Registrou'} entrada de RMA de ${unit.platform}. Rastreamento: ${unit.trackingCode}`
  );
};

export const deleteTriageUnit = async (id: string): Promise<void> => {
  const unitRef = doc(db, 'triage_units', id);
  const docSnap = await getDoc(unitRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    await deleteDoc(unitRef);
    await createAuditLog('DELETE_TRIAGE', `Excluiu triagem do registro de RMA: ${data.trackingCode} (${data.baseProductName})`);
  }
};

export const checkoutTriageUnit = async (id: string): Promise<void> => {
  const unitRef = doc(db, 'triage_units', id);
  const docSnap = await getDoc(unitRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    const checkoutDate = new Date().toISOString();
    await updateDoc(unitRef, {
      status: 'Baixado',
      checkoutDate: checkoutDate
    });
    await createAuditLog('CHECKOUT_TRIAGE', `Baixou do estoque o RMA: ${data.trackingCode}. Destinado para: ${data.destinationSector}`);
  }
};

export const resetCatalogProducts = async (): Promise<number> => {
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
// USER MANAGEMENT & RBAC FIRESTORE HELPERS
// ==========================================

/**
 * Subscribe to all users in the 'users' collection (Real-time for Admin view)
 */
export const subscribeToUsers = (callback: (users: UserAccount[]) => void) => {
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
 * Update any user's role (Admin / Operator) in Firestore
 */
export const updateUserRoleInDb = async (
  uid: string, 
  newRole: 'admin' | 'operator',
  targetEmail?: string
): Promise<void> => {
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    role: newRole,
    updatedAt: new Date().toISOString()
  });

  const roleLabel = newRole === 'admin' ? 'Administrador (Acesso Total)' : 'Logística / Operador';
  await createAuditLog('UPDATE_USER_ROLE', `Alterou permissões de acesso do usuário ${targetEmail || uid} para: ${roleLabel}`);
};

/**
 * Delete a user profile document from Firestore
 */
export const deleteUserDocumentFromDb = async (uid: string, targetEmail?: string): Promise<void> => {
  const userDocRef = doc(db, 'users', uid);
  await deleteDoc(userDocRef);
  try {
    await createAuditLog('DELETE_USER', `Removeu o registro do usuário ${targetEmail || uid} do Firestore`);
  } catch (logErr) {
    console.warn('Non-blocking audit log creation error on user delete:', logErr);
  }
};

/**
 * Ensure user document exists in Firestore / Auto-heal missing profiles
 */
export const ensureUserProfileExists = async (currentUser: any): Promise<UserAccount | null> => {
  if (!currentUser || !currentUser.uid) return null;
  try {
    const userDocRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(userDocRef);
    
    if (!snap.exists()) {
      const isMasterAdmin = currentUser.email === 'alessandro.away6@gmail.com';
      const initialProfile: UserAccount = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Operador Corporativo',
        role: isMasterAdmin ? 'admin' : 'operator',
        createdAt: new Date().toISOString()
      };
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
    return null;
  }
};

