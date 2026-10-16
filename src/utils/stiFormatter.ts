/**
 * Funções utilitárias para formatação e validação de código numérico de 4 dígitos e compatibilidade com códigos legados.
 * 
 * Regras do Sistema:
 * 1. Novos Códigos: O código não contém mais 'STI', apenas os 4 números (ex: '1234').
 * 2. Produtos com Código Antigo: Para produtos que já possuem o código antigo (ex: 'STI135638', 'STI1234', 'STI-001'),
 *    o código antigo é mantido intacto e o sistema NÃO exige um novo código para evitar conflitos de estoque.
 * 3. Busca por '#' (Exata): Se for inserido o caractere '#' antes do número (ex: '#1234'), a busca retorna exclusivamente
 *    a unidade com aquele código STI (sem buscar demais números como pedidos, seriais ou skus que contenham a sequência).
 */

/**
 * Verifica se uma string corresponde a um código legado/antigo (ex: começa com 'STI').
 */
export function isLegacyStiCode(code?: string | null): boolean {
  if (!code) return false;
  const trimmed = code.trim().replace(/^#/, '').trim();
  return /^STI/i.test(trimmed);
}

/**
 * Extrai apenas os dígitos numéricos (até 4) de qualquer string recebida para digitação de novo código.
 * Ex: '1234' -> '1234', '98765' -> '9876', '#1234' -> '1234'
 */
export function extractStiDigits(code?: string | null): string {
  if (!code) return '';
  const trimmed = code.trim().replace(/^[#\s\-_]+/, '');
  // Remove qualquer prefixo legado 'STI' se vier de dados antigos ou colado
  const withoutPrefix = trimmed.replace(/^STI/i, '').trim();
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
 * Se o produto já possui um código antigo legado (ex: 'STI135638'), mantém o código antigo.
 * Se for digitação/edição normal, mantém exclusivamente os 4 números sem STI.
 */
export function formatStiInput(input: string): string {
  if (!input) return '';
  if (isLegacyStiCode(input)) {
    return input.trim().replace(/^#/, '').trim();
  }
  return extractStiDigits(input);
}

/**
 * Valida se um código é válido:
 * - Válido se for um novo código composto estritamente por 4 números (ex: '1234').
 * - Válido se for um código antigo legado já existente (ex: 'STI135638', 'STI1234').
 * Desta forma, produtos com código antigo não são barrados nem forçados a gerar novos códigos.
 */
export function isValidStiCode(code?: string | null): boolean {
  if (!code) return false;
  const trimmed = code.trim().replace(/^#/, '').trim();
  if (!trimmed) return false;

  // Código antigo legado: mantém válido para não dar conflito
  if (isLegacyStiCode(trimmed)) {
    return trimmed.length >= 4;
  }

  // Novo padrão: estritamente 4 números
  const digits = extractStiDigits(trimmed);
  return digits.length === 4 && /^\d{4}$/.test(trimmed);
}

/**
 * Normaliza qualquer código:
 * - Para produtos que possuem o código antigo, mantém o código antigo intacto (ex: 'STI135638').
 * - Para novos códigos, normaliza exclusivamente para os 4 números (ex: '1234').
 */
export function normalizeStiCode(code?: string | null): string {
  if (!code) return '';
  const trimmed = code.trim().replace(/^#/, '').trim();
  if (!trimmed) return '';

  // Se for código antigo legado, preserva o código em maiúsculas sem cortar dígitos
  if (isLegacyStiCode(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Para novos códigos, extrai estritamente os 4 números
  const digits = extractStiDigits(trimmed);
  if (digits.length === 4) {
    return digits;
  }

  if (digits.length > 0) {
    return digits;
  }

  return trimmed;
}

/**
 * Formata o código para exibição em badges visuais (ex: '#1234' ou '#STI135638').
 */
export function formatStiBadge(code?: string | null): string {
  if (!code) return '';
  const normalized = normalizeStiCode(code);
  if (!normalized) return '';
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

/**
 * Detecta se o termo de busca é uma busca estrita por código STI utilizando o prefixo '#'.
 * Ex: '#1234', '# 1234', '#STI135638'
 */
export function isExactHashStiSearch(term?: string | null): boolean {
  if (!term) return false;
  const trimmed = term.trim();
  return /^#\s*\S+/.test(trimmed);
}

/**
 * Extrai o código buscado após o caractere '#'.
 * Ex: '#1234' -> '1234', '# 1234' -> '1234', '#STI135638' -> 'STI135638'
 */
export function extractHashStiQuery(term?: string | null): string {
  if (!term) return '';
  const trimmed = term.trim();
  const match = trimmed.match(/^#\s*(.+)$/);
  return match ? match[1].trim() : '';
}

/**
 * Verifica se o trackingCode de uma unidade/item corresponde estritamente à busca de código STI por '#'.
 * 
 * Regra:
 * Se o operador insere o caractere '#' antes do número (ex: '#1234'), a busca retorna APENAS
 * o código STI correspondente (exato), sem buscar demais números (pedidos, seriais, skus) que contenham a mesma sequência.
 */
export function matchesExactHashSti(trackingCode: string | undefined | null, searchTerm?: string | null): boolean {
  if (!searchTerm || !trackingCode) return false;
  const rawTarget = extractHashStiQuery(searchTerm);
  if (!rawTarget) return false;

  const targetNormalized = normalizeStiCode(rawTarget).toLowerCase();
  const codeNormalized = normalizeStiCode(trackingCode).toLowerCase();

  // 1. Novo código de 4 dígitos (ex: #1234):
  // Exige correspondência exata para não trazer outros códigos ou números similares
  if (/^\d{4}$/.test(rawTarget)) {
    return codeNormalized === targetNormalized || trackingCode.trim().toLowerCase() === targetNormalized;
  }

  // 2. Se for código legado (ex: #STI135638 ou #STI1234)
  if (isLegacyStiCode(rawTarget)) {
    return codeNormalized === targetNormalized;
  }

  // 3. Enquanto o operador ainda digita dígitos (ex: #1, #12, #123):
  // Filtra exclusivamente no campo trackingCode, garantindo que nenhum outro campo (serial, pedido, etc.) seja consultado
  if (/^\d{1,3}$/.test(rawTarget)) {
    return codeNormalized.startsWith(targetNormalized);
  }

  return codeNormalized === targetNormalized;
}
