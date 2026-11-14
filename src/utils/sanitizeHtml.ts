/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DOMPurify from 'dompurify';

/**
 * Filtra HTML vindo do banco (descrições, laudos, notas) antes de exibi-lo com dangerouslySetInnerHTML
 * ou innerHTML. Mantém a formatação do editor (negrito, listas, títulos, links, tabelas) e remove
 * scripts, atributos de evento (onerror, onclick...) e URLs javascript:.
 * SEMPRE use esta função ao renderizar HTML armazenado.
 */
export const sanitizeHtml = (html?: string | null): string => {
  if (!html) return '';
  return DOMPurify.sanitize(String(html), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    ALLOW_DATA_ATTR: false
  });
};
