/**
 * Utility functions for formatting and validating STI tracking codes.
 *
 * Requirements:
 * 1. Automatic correction to uppercase 'STI' directly adjacent to numbers (e.g. 'STI134920').
 * 2. Strictly accepts ONLY the combination of 'STI' + exactly 6 digits (regex: /^STI\d{6}$/).
 */

/**
 * Formats user input dynamically as they type, paste, or edit.
 * - Forces uppercase 'STI'.
 * - Removes spaces, hashes, hyphens, and non-alphanumeric separators.
 * - Joins 'STI' directly with numbers.
 * - Limits to exactly 6 digits after 'STI' (9 characters total).
 * - Automatically prefixes raw numeric inputs with 'STI' (e.g., '134920' -> 'STI134920').
 */
export function formatStiInput(input: string): string {
  if (!input) return '';

  // Remove leading hashes, spaces, hyphens, underscores
  let cleaned = input.trim().replace(/^[#\s\-_]+/, '');
  // Remove any internal spaces, hyphens, underscores
  cleaned = cleaned.replace(/[\s\-_]+/g, '');

  const upper = cleaned.toUpperCase();

  // If user typed/pasted starting with 'STI'
  if (upper.startsWith('STI')) {
    const digits = upper.slice(3).replace(/\D/g, '').slice(0, 6);
    return `STI${digits}`;
  }

  // If user is currently typing the initial letters 'S' or 'ST'
  if (upper === 'S' || upper === 'ST') {
    return upper;
  }

  // If user entered raw numbers directly (e.g., '134920' or '134')
  const digitsOnly = cleaned.replace(/\D/g, '').slice(0, 6);
  if (digitsOnly.length > 0) {
    return `STI${digitsOnly}`;
  }

  // Fallback: keep uppercase alphanumeric characters, capped at 9 chars
  return upper.replace(/[^A-Z0-9]/g, '').slice(0, 9);
}

/**
 * Validates if the string strictly conforms to 'STI' + exactly 6 digits.
 * Example: 'STI134920' -> true, 'STI13491' -> false, 'STI1349201' -> false
 */
export function isValidStiCode(code?: string | null): boolean {
  if (!code) return false;
  const trimmed = code.trim().replace(/^#/, '').trim();
  return /^STI\d{6}$/.test(trimmed);
}

/**
 * Normalizes any stored, legacy, or imported STI string into standard 'STI' + 6 numbers.
 * E.g., 'sti 134919' -> 'STI134919', '#sti 134919' -> 'STI134919', '134920' -> 'STI134920'.
 */
export function normalizeStiCode(code?: string | null): string {
  if (!code) return '';
  const trimmed = code.trim().replace(/^#/, '').trim();

  // Already strictly valid: STI + 6 digits
  if (/^STI\d{6}$/.test(trimmed)) {
    return trimmed;
  }

  // 'sti' (any case) followed by optional spaces/hyphens and 6 digits
  const matchSti6 = trimmed.match(/^sti[\s\-_]*(\d{6})$/i);
  if (matchSti6) {
    return `STI${matchSti6[1]}`;
  }

  // Exactly 6 digits
  if (/^\d{6}$/.test(trimmed)) {
    return `STI${trimmed}`;
  }

  // 'sti' followed by any digits
  const matchStiAny = trimmed.match(/^sti[\s\-_]*(\d+)$/i);
  if (matchStiAny) {
    return `STI${matchStiAny[1].slice(0, 6)}`;
  }

  // General fallback: uppercase and remove spaces
  const upper = trimmed.toUpperCase().replace(/[\s\-_]+/g, '');
  if (upper.startsWith('STI')) {
    const digits = upper.slice(3).replace(/\D/g, '').slice(0, 6);
    return `STI${digits}`;
  }

  return trimmed;
}

/**
 * Formats a tracking code for badge presentation, ensuring '#STI134920' format.
 */
export function formatStiBadge(code?: string | null): string {
  if (!code) return '';
  const normalized = normalizeStiCode(code);
  if (!normalized) return '';
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}
