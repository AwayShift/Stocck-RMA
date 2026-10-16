/**
 * Funções utilitárias para formatação e validação de código numérico de 4 dígitos.
 * 
 * Regra:
 * O código não contém mais 'STI', apenas os 4 números (ex: '1234').
 */

/**
 * Extrai apenas os dígitos numéricos (até 4) de qualquer string recebida ou colada.
 * Ex: 'STI1234' -> '1234', '1234' -> '1234', '#STI-1234' -> '1234', '#1234' -> '1234'
 */
export function extractStiDigits(code?: string | null): string {
  if (!code) return '';
  const trimmed = code.trim().replace(/^[#\s\-_]+/, '');
  // Remove qualquer prefixo legado 'STI' se vier de dados antigos ou colado
  const withoutPrefix = trimmed.replace(/^STI/i, '');
  // Extrai somente números, limitando a 4 dígitos
  return withoutPrefix.replace(/\D/g, '').slice(0, 4);
}

/**
 * Converte dígitos limpos em código padrão de 4 números.
 * Ex: '1234' -> '1234', '' -> ''
 */
export function formatStiFromDigits(digits?: string | null): string {
  if (!digits) return '';
  return extractStiDigits(digits);
}

/**
 * Formata a entrada do usuário em tempo real enquanto digita ou cola.
 * - Não insere 'STI', mantendo exclusivamente os 4 números.
 * - Remove espaços, caracteres especiais e letras.
 * - Limita rigorosamente a no máximo 4 dígitos numéricos.
 */
export function formatStiInput(input: string): string {
  if (!input) return '';
  return extractStiDigits(input);
}

/**
 * Valida se a string atende rigorosamente aos 4 dígitos numéricos.
 * Ex: '1234' -> true, 'STI1234' -> true (após normalização), '123' -> false, '12345' -> false
 */
export function isValidStiCode(code?: string | null): boolean {
  if (!code) return false;
  const digits = extractStiDigits(code);
  return digits.length === 4;
}

/**
 * Normaliza qualquer código legado, colado ou digitado para o padrão exclusivo de 4 números.
 * Ex: 'STI1234' -> '1234', '#STI 1234' -> '1234', '1234' -> '1234', '#1234' -> '1234'.
 */
export function normalizeStiCode(code?: string | null): string {
  if (!code) return '';
  const trimmed = code.trim().replace(/^#/, '').trim();
  const digits = extractStiDigits(trimmed);

  if (digits.length === 4) {
    return digits;
  }

  // Se já for apenas dígitos de outro tamanho legado
  if (digits.length > 0) {
    return digits;
  }

  return trimmed;
}

/**
 * Formata o código para exibição em badges visuais (ex: '#1234').
 */
export function formatStiBadge(code?: string | null): string {
  if (!code) return '';
  const normalized = normalizeStiCode(code);
  if (!normalized) return '';
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}
