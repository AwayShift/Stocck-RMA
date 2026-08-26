/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Data Compression Service (LZ-String)
 * 
 * Drastically reduces Supabase Egress and Database storage by compressing:
 * 1. Long technical reports / notes / HTML triage laudos.
 * 2. Customer reason texts and observation logs.
 * 3. Serial arrays and large nested JSON payloads.
 * 
 * Features:
 * - Transparent backward compatibility (uncompressed strings remain readable).
 * - Prefixed with '__lz:' for instant decompression detection.
 * - Compression is applied only if it yields real byte savings (> 120 chars).
 */

import LZString from 'lz-string';

const LZ_PREFIX = '__lz:';
const MIN_COMPRESSION_LENGTH = 120;

/**
 * Compresses a text string if it exceeds the minimum length threshold.
 * Returns the original string if short or if compression does not save space.
 */
export const compressText = (text: string | null | undefined): string => {
  if (!text || typeof text !== 'string') return text || '';
  if (text.startsWith(LZ_PREFIX)) return text; // Already compressed

  const trimmed = text.trim();
  if (trimmed.length < MIN_COMPRESSION_LENGTH) {
    return text;
  }

  try {
    const compressed = LZString.compressToEncodedURIComponent(trimmed);
    // Only use compressed if it actually saved space
    if (compressed && (compressed.length + LZ_PREFIX.length) < trimmed.length) {
      return `${LZ_PREFIX}${compressed}`;
    }
  } catch (err) {
    console.warn('Text compression error, using raw string:', err);
  }

  return text;
};

/**
 * Decompresses a text string if it contains the LZ prefix.
 * Otherwise returns the original text untouched (100% backward compatible).
 */
export const decompressText = (text: string | null | undefined): string => {
  if (!text || typeof text !== 'string') return text || '';
  if (!text.startsWith(LZ_PREFIX)) return text; // Plain raw text

  try {
    const encoded = text.substring(LZ_PREFIX.length);
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (decompressed !== null && decompressed !== undefined) {
      return decompressed;
    }
  } catch (err) {
    console.warn('Text decompression failed, returning raw string:', err);
  }

  return text;
};

/**
 * Compresses any complex object/array into a compact compressed string
 */
export const compressObject = <T>(obj: T): string => {
  try {
    const json = JSON.stringify(obj);
    return compressText(json);
  } catch (e) {
    console.warn('Object compression error:', e);
    return JSON.stringify(obj);
  }
};

/**
 * Decompresses and parses a previously compressed JSON object/array
 */
export const decompressObject = <T>(payload: string | null | undefined, fallback: T): T => {
  if (!payload) return fallback;
  try {
    const decompressedJson = decompressText(payload);
    return JSON.parse(decompressedJson) as T;
  } catch (e) {
    console.warn('Object decompression/parse error:', e);
    return fallback;
  }
};
