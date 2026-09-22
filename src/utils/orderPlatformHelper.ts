import { PlatformType } from '../types';

export interface OrderDetectionResult {
  platform: PlatformType;
  label: string;
  isAmazonVariant: boolean;
  confidence: 'high' | 'exact';
  hint?: string;
}

/**
 * Normaliza e identifica a plataforma de venda de acordo com o padrão do número de pedido:
 * 
 * - Mercado Livre: 2000018084300220 (sequência puramente numérica, tipicamente 10 a 18 dígitos, ex: 16 dígitos)
 * - Shopee: 260826B2XBBKNP (alfanumérico sem hífens, mistura números e letras maiúsculas, 12 a 18 caracteres)
 * - Amazon / Amazon Ta Novo: 702-5651199-8083453 (padrão 3-7-7 com hífens)
 * - Kabum: 49444972-A (números com hífen e letra final, ex: 7 a 9 dígitos + '-A')
 */
export function detectPlatformFromOrderNumber(
  rawOrderNumber: string | undefined | null,
  currentPlatform?: PlatformType | string | null
): PlatformType | null {
  const result = inspectOrderNumber(rawOrderNumber, currentPlatform);
  return result ? result.platform : null;
}

export function inspectOrderNumber(
  rawOrderNumber: string | undefined | null,
  currentPlatform?: PlatformType | string | null
): OrderDetectionResult | null {
  if (!rawOrderNumber) return null;
  const clean = rawOrderNumber.trim();
  if (clean.length < 4) return null;

  // 1. Amazon / Amazon Ta Novo (Ex: 702-5651199-8083453)
  // Formato oficial de 3 blocos: 3 dígitos - 7 dígitos - 7 dígitos
  const amazonExactRegex = /^\d{3}-\d{7}-\d{7}$/;
  const amazonPartialRegex = /^\d{3}-\d{7}(-\d{1,7})?$/;

  if (amazonExactRegex.test(clean) || amazonPartialRegex.test(clean)) {
    const isTaNovo = currentPlatform === 'Amazon Ta Novo';
    return {
      platform: isTaNovo ? 'Amazon Ta Novo' : 'Amazon',
      label: isTaNovo ? 'Amazon Ta Novo' : 'Amazon',
      isAmazonVariant: true,
      confidence: amazonExactRegex.test(clean) ? 'exact' : 'high',
      hint: isTaNovo 
        ? 'Padrão Amazon / Ta Novo detectado' 
        : 'Padrão Amazon detectado (clique para alternar para Ta Novo)'
    };
  }

  // 2. Kabum (Ex: 49444972-A, 12345678-B, KB-12345678)
  // Formato: 6 a 10 dígitos, seguido de hífen e sufixo alfanumérico (ex: -A, -B, -01), ou prefixo KB-/KABUM-
  const kabumExactRegex = /^(\d{6,10}-[A-Za-z0-9]{1,3}|KB-?\d+|KABUM-?\d+)$/i;
  const kabumSuffixRegex = /^\d{5,12}-[A-Za-z]$/i;

  if (kabumExactRegex.test(clean) || kabumSuffixRegex.test(clean)) {
    return {
      platform: 'Kabum',
      label: 'Kabum',
      isAmazonVariant: false,
      confidence: 'exact',
      hint: 'Padrão Kabum detectado'
    };
  }

  // 3. Shopee (Ex: 260826B2XBBKNP, 240826A1B2C3D4, SPXBR...)
  // Formato: Alfanumérico sem hífens, mistura letras e números, 12 a 18 caracteres
  // Muitas vezes inicia com 6 números (data YYMMDD) seguido de letras/números maiúsculos
  const isAlphaNumericOnly = /^[A-Za-z0-9]+$/.test(clean);
  const hasLetters = /[A-Za-z]/.test(clean);
  const hasDigits = /\d/.test(clean);

  if (isAlphaNumericOnly && hasLetters && hasDigits) {
    // Se tiver letras e números sem hífen e tamanho característico da Shopee (10 a 20 chars)
    if (clean.length >= 10 && clean.length <= 22) {
      return {
        platform: 'Shopee',
        label: 'Shopee',
        isAmazonVariant: false,
        confidence: 'exact',
        hint: 'Padrão Shopee detectado'
      };
    }
    // Prefixo específico Shopee Xpress
    if (/^SPX/i.test(clean)) {
      return {
        platform: 'Shopee',
        label: 'Shopee',
        isAmazonVariant: false,
        confidence: 'high',
        hint: 'Padrão Shopee (SPX) detectado'
      };
    }
  }

  // 4. Mercado Livre (Ex: 2000018084300220)
  // Formato: Sequência puramente numérica com 10 a 20 dígitos (comumente 16 dígitos começando com 2000...)
  const isPureDigits = /^\d+$/.test(clean);
  if (isPureDigits) {
    if (clean.length >= 10 && clean.length <= 20) {
      return {
        platform: 'Mercado Livre',
        label: 'Mercado Livre',
        isAmazonVariant: false,
        confidence: 'exact',
        hint: 'Padrão Mercado Livre detectado'
      };
    }
  }

  return null;
}

/**
 * Normaliza a formatação do número de pedido se aplicável (ex: Shopee em maiúsculas, Kabum com sufixo maiúsculo)
 */
export function normalizeOrderNumberForPlatform(rawOrderNumber: string, platform?: PlatformType | string | null): string {
  if (!rawOrderNumber) return '';
  const clean = rawOrderNumber.trim();

  // Para Shopee, números de pedido são letras maiúsculas
  if (platform === 'Shopee') {
    return clean.toUpperCase();
  }

  // Para Kabum, o sufixo (ex: -a -> -A) fica em maiúsculo
  if (platform === 'Kabum') {
    return clean.replace(/-([a-z])$/i, (_, letter) => `-${letter.toUpperCase()}`);
  }

  return clean;
}
