/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PendingItem, TriageUnit } from '../types';

/**
 * Extrai o número sequencial de um código de registro de pendência (Ex: "REG-00012" => 12).
 */
export function extractRegistrationSequence(reg: string | undefined | null): number {
  if (!reg) return 0;
  const clean = reg.trim().toUpperCase();
  if (clean === 'REG-S/N' || clean === 'S/N' || clean === 'REG-NOVO') return 0;
  const match = clean.match(/(\d+)/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  return isNaN(val) ? 0 : val;
}

/**
 * Gera o próximo número de registro sequencial para uma nova pendência (Ex: "REG-00001").
 * Analisa tanto pendências quanto unidades de triagem para evitar colisões de sequência.
 */
export function generatePendingRegistrationNumber(
  existingItems: PendingItem[],
  triageUnits?: TriageUnit[]
): string {
  let maxSeq = 0;
  if (Array.isArray(existingItems)) {
    for (const item of existingItems) {
      const seq = extractRegistrationSequence(item?.registrationNumber);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  if (Array.isArray(triageUnits)) {
    for (const unit of triageUnits) {
      const seq = extractRegistrationSequence(unit?.pendingRegistrationNumber);
      if (seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  return `REG-${String(nextSeq).padStart(5, '0')}`;
}

/**
 * Normaliza um número de registro digitado pelo usuário (Ex: "1" => "REG-00001", "reg-12" => "REG-00012").
 */
export function normalizeRegistrationNumber(input: string | undefined | null): string {
  if (!input) return '';
  const clean = input.trim().toUpperCase();
  if (!clean || clean === 'REG-S/N' || clean === 'S/N' || clean === 'REG-NOVO' || clean === '-') return '';
  if (/^REG-\d+$/.test(clean)) {
    // Normaliza para 5 dígitos
    const numPart = clean.replace('REG-', '');
    const val = parseInt(numPart, 10);
    return `REG-${String(val).padStart(5, '0')}`;
  }
  if (/^\d+$/.test(clean)) {
    const val = parseInt(clean, 10);
    return `REG-${String(val).padStart(5, '0')}`;
  }
  return clean;
}

/**
 * Garante que uma pendência possua um número de registro formatado.
 * Tenta recuperar de vínculos existentes antes de gerar nova numeração sequencial.
 */
export function ensurePendingRegistrationNumber(
  item: PendingItem,
  existingItems: PendingItem[],
  triageUnits?: TriageUnit[]
): string {
  if (item?.registrationNumber && item.registrationNumber.trim()) {
    const normalized = normalizeRegistrationNumber(item.registrationNumber);
    if (normalized) return normalized;
  }

  // 1. Tentar recuperar de unidade vinculada no estoque físico
  if (triageUnits && Array.isArray(triageUnits)) {
    const linked = triageUnits.find(u => 
      (item.linkedUnitId && u.id === item.linkedUnitId) ||
      (item.transferredUnitId && u.id === item.transferredUnitId) ||
      (u.pendingItemId && u.pendingItemId === item.id) ||
      (item.orderNumber && u.orderNumber && item.orderNumber.trim() === u.orderNumber.trim())
    );
    if (linked?.pendingRegistrationNumber && linked.pendingRegistrationNumber.trim()) {
      const norm = normalizeRegistrationNumber(linked.pendingRegistrationNumber);
      if (norm) return norm;
    }
  }

  // 2. Tentar recuperar de anotações técnicas detailedNotes (tags de resiliência)
  const rawNotes = item?.detailedNotes || '';
  if (rawNotes.includes('[REG_NUM:')) {
    const match = rawNotes.match(/\[REG_NUM:(.*?)\]/);
    if (match && match[1]) {
      const norm = normalizeRegistrationNumber(match[1]);
      if (norm) return norm;
    }
  }

  return generatePendingRegistrationNumber(existingItems, triageUnits);
}

/**
 * Recupera ou gera o número de registro correto para uma pendência que esteja sem número ("REG-S/N").
 */
export function healPendingItemRegistrationNumber(
  item: PendingItem,
  allItems: PendingItem[],
  triageUnits?: TriageUnit[]
): string {
  return ensurePendingRegistrationNumber(item, allItems, triageUnits);
}

/**
 * Regra 1: "um pedido só pode ter um registro de pendência"
 * Valida se já existe uma pendência registrada para o mesmo número de pedido.
 */
export function validateUniqueOrderNumber(
  orderNumber: string | undefined | null,
  currentPendingId: string | undefined | null,
  pendingItems: PendingItem[]
): { valid: boolean; error?: string; existingItem?: PendingItem } {
  if (!orderNumber || !orderNumber.trim()) {
    return { valid: true };
  }

  const cleanOrder = orderNumber.trim().toLowerCase();
  const duplicate = (pendingItems || []).find(p => {
    if (!p || p.id === currentPendingId) return false;
    // Ignorar pendências canceladas para não travar novos pedidos legítimos caso tenha sido descartada
    if (p.status === 'Cancelado') return false;
    const pOrder = (p.orderNumber || '').trim().toLowerCase();
    return pOrder === cleanOrder;
  });

  if (duplicate) {
    const regLabel = duplicate.registrationNumber || duplicate.id;
    return {
      valid: false,
      error: `O pedido "${orderNumber.trim()}" já possui a pendência [${regLabel}] cadastrada (${duplicate.productName || 'Produto'}). Pelas regras do sistema, cada pedido só pode ter um único registro de pendência.`,
      existingItem: duplicate
    };
  }

  return { valid: true };
}

/**
 * Regra 2: "a pendência só pode ser registrada em um produto"
 * Valida se o registro de pendência pode ser vinculado ao produto no estoque.
 */
export function validatePendingItemLink(
  registrationNumberOrId: string | undefined | null,
  currentUnitId: string | undefined | null,
  pendingItems: PendingItem[],
  triageUnits: TriageUnit[]
): { 
  valid: boolean; 
  error?: string; 
  pendingItem?: PendingItem; 
  linkedUnit?: TriageUnit 
} {
  if (!registrationNumberOrId || !registrationNumberOrId.trim()) {
    return { valid: true };
  }

  const cleanQuery = registrationNumberOrId.trim().toUpperCase();
  const normalizedReg = normalizeRegistrationNumber(cleanQuery);

  // Localiza a pendência pelo número de registro normalizado, pelo código bruto ou pelo ID
  const pending = (pendingItems || []).find(p => {
    if (!p) return false;
    if (p.registrationNumber && (
      p.registrationNumber.toUpperCase() === cleanQuery ||
      p.registrationNumber.toUpperCase() === normalizedReg
    )) {
      return true;
    }
    return p.id === registrationNumberOrId.trim();
  });

  if (!pending) {
    return {
      valid: false,
      error: `Nenhuma pendência encontrada com o registro "${registrationNumberOrId}". Verifique o número informado.`
    };
  }

  // Verifica se a pendência já está vinculada a OUTRO produto no estoque físico
  const otherLinkedUnit = (triageUnits || []).find(u => {
    if (!u || u.id === currentUnitId) return false;
    // Verifica se a unidade aponta para este número de registro ou ID da pendência
    if (u.pendingRegistrationNumber && (
      u.pendingRegistrationNumber.toUpperCase() === (pending.registrationNumber || '').toUpperCase() ||
      u.pendingRegistrationNumber.toUpperCase() === normalizedReg
    )) {
      return true;
    }
    if (u.pendingItemId && u.pendingItemId === pending.id) {
      return true;
    }
    // Também checa se a própria pendência aponta para esta unidade ativa e não é a unidade atual
    if (pending.transferredUnitId && pending.transferredUnitId === u.id && (u.pendingRegistrationNumber || u.pendingItemId)) {
      return true;
    }
    return false;
  });

  if (otherLinkedUnit) {
    const unitIdent = otherLinkedUnit.trackingCode || otherLinkedUnit.baseProductName || otherLinkedUnit.id;
    return {
      valid: false,
      error: `A pendência [${pending.registrationNumber || cleanQuery}] já está vinculada ao produto "${unitIdent}" (${otherLinkedUnit.baseProductSku}) no estoque. Pelas regras do sistema, uma pendência só pode ser registrada em um único produto.`,
      pendingItem: pending,
      linkedUnit: otherLinkedUnit
    };
  }

  return {
    valid: true,
    pendingItem: pending
  };
}

/**
 * Localiza um item de pendência por número de registro (ou normalizado) ou por ID.
 */
export function findPendingItemByRegistrationNumber(
  registrationNumber: string | undefined | null,
  pendingItems: PendingItem[]
): PendingItem | undefined {
  if (!registrationNumber || !registrationNumber.trim()) return undefined;
  const clean = registrationNumber.trim().toUpperCase();
  const normalized = normalizeRegistrationNumber(clean);
  return (pendingItems || []).find(p => {
    if (!p) return false;
    if (p.registrationNumber && (
      p.registrationNumber.toUpperCase() === clean ||
      p.registrationNumber.toUpperCase() === normalized
    )) {
      return true;
    }
    return p.id === registrationNumber.trim();
  });
}
