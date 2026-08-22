/**
 * ZenohX Payload Encoders, Decoders, and Formatters
 * Provides type conversion, syntax validation, CBOR serialization,
 * and multi-column Hex dump generation.
 */

import * as cbor from 'cbor-x';
import type { EncodingType } from '../types/zenoh';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ParseResult<T = unknown> {
  success: boolean;
  data?: T;
  formatted: string;
  error?: string;
}

export interface EncodeResult {
  bytes: number[];
  isValid: boolean;
  error?: string;
}

// ============================================================================
// Byte Utility Functions
// ============================================================================

/**
 * Normalizes any byte-like payload representation into a Uint8Array.
 */
export function bytesToUint8Array(payload: Uint8Array | number[] | ArrayBuffer | string | null | undefined): Uint8Array {
  if (!payload) {
    return new Uint8Array(0);
  }
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return new Uint8Array(payload);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (typeof payload === 'string') {
    return new TextEncoder().encode(payload);
  }
  return new Uint8Array(0);
}

/**
 * Converts a byte array to a regular number array (serializable DTO format).
 */
export function uint8ArrayToNumbers(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

/**
 * Formats a byte size into a human-readable string (e.g., "128 B", "1.50 KB", "2.10 MB").
 */
export function formatByteSize(bytesCount: number): string {
  if (bytesCount <= 0 || isNaN(bytesCount)) {
    return '0 B';
  }
  if (bytesCount < 1024) {
    return `${bytesCount} B`;
  }
  if (bytesCount < 1024 * 1024) {
    return `${(bytesCount / 1024).toFixed(2)} KB`;
  }
  if (bytesCount < 1024 * 1024 * 1024) {
    return `${(bytesCount / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytesCount / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ============================================================================
// Hex Dump Generation
// ============================================================================

/**
 * Formats byte payload as a classic multi-column hex dump with offset, hex bytes, and ASCII representation.
 *
 * Example:
 * 00000000  7b 22 74 65 6d 70 22 3a  20 32 35 2e 35 7d        |{"temp": 25.5}|
 */
export function toHexDump(payload: Uint8Array | number[] | null | undefined, bytesPerLine: number = 16): string {
  const bytes = bytesToUint8Array(payload);
  if (bytes.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const total = bytes.length;

  for (let offset = 0; offset < total; offset += bytesPerLine) {
    const chunkLength = Math.min(bytesPerLine, total - offset);
    const chunk = bytes.slice(offset, offset + chunkLength);

    // Offset column (8 hex digits)
    const offsetStr = offset.toString(16).padStart(8, '0');

    // Hex bytes column (split in 2 halves of 8 bytes with gap)
    const firstHalf: string[] = [];
    const secondHalf: string[] = [];

    for (let i = 0; i < 8; i++) {
      if (i < chunkLength) {
        firstHalf.push(chunk[i].toString(16).padStart(2, '0'));
      } else {
        firstHalf.push('  ');
      }
    }

    for (let i = 8; i < 16; i++) {
      if (i < chunkLength) {
        secondHalf.push(chunk[i].toString(16).padStart(2, '0'));
      } else {
        secondHalf.push('  ');
      }
    }

    const hexPart1 = firstHalf.join(' ');
    const hexPart2 = secondHalf.join(' ');
    const hexColumn = `${hexPart1}  ${hexPart2}`;

    // ASCII column: printable ASCII (32-126) or '.'
    let asciiColumn = '';
    for (let i = 0; i < chunkLength; i++) {
      const b = chunk[i];
      if (b >= 32 && b <= 126) {
        asciiColumn += String.fromCharCode(b);
      } else {
        asciiColumn += '.';
      }
    }

    lines.push(`${offsetStr}  ${hexColumn}  |${asciiColumn}|`);
  }

  return lines.join('\n');
}

// ============================================================================
// JSON & CBOR Parsing and Formatting
// ============================================================================

/**
 * Safely parses a JSON string with error details.
 */
export function tryParseJson<T = unknown>(text: string): { success: boolean; data?: T; error?: string } {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tries to format input (string or byte array) as pretty-printed JSON.
 */
export function tryFormatJson(
  input: string | Uint8Array | number[] | null | undefined,
  indent: number = 2
): ParseResult {
  if (input == null) {
    return { success: true, formatted: '', data: null };
  }

  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else {
    const bytes = bytesToUint8Array(input);
    if (bytes.length === 0) {
      return { success: true, formatted: '', data: null };
    }
    text = new TextDecoder('utf-8').decode(bytes);
  }

  try {
    const data = JSON.parse(text);
    const formatted = JSON.stringify(data, null, indent);
    return { success: true, formatted, data };
  } catch (err) {
    return {
      success: false,
      formatted: text,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tries to decode a byte array as CBOR and pretty-print it as JSON.
 */
export function tryFormatCbor(
  input: Uint8Array | number[] | null | undefined,
  indent: number = 2
): ParseResult {
  const bytes = bytesToUint8Array(input);
  if (bytes.length === 0) {
    return { success: true, formatted: '', data: null };
  }

  try {
    const data = cbor.decode(bytes);
    const formatted = JSON.stringify(
      data,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      indent
    );
    return { success: true, formatted, data };
  } catch (err) {
    return {
      success: false,
      formatted: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Payload Formatting & Decoding
// ============================================================================

/**
 * Formats a raw byte payload into a displayable string according to the requested encoding.
 */
export function formatPayload(
  payload: Uint8Array | number[] | null | undefined,
  encoding: EncodingType | string,
  indent: number = 2
): string {
  const bytes = bytesToUint8Array(payload);
  if (bytes.length === 0) {
    return '';
  }

  const normalizedEncoding = (encoding || '').toLowerCase();

  switch (normalizedEncoding) {
    case 'json': {
      const res = tryFormatJson(bytes, indent);
      return res.formatted;
    }
    case 'cbor': {
      const res = tryFormatCbor(bytes, indent);
      return res.success ? res.formatted : toHexDump(bytes);
    }
    case 'text': {
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return toHexDump(bytes);
      }
    }
    case 'raw':
    default: {
      return toHexDump(bytes);
    }
  }
}

// ============================================================================
// Payload Encoding
// ============================================================================

/**
 * Encodes an input string into a byte array according to the specified encoding.
 * Validates JSON/CBOR syntax and parses raw hex representations.
 */
export function encodePayload(
  input: string,
  encoding: EncodingType | string
): EncodeResult {
  const normalizedEncoding = (encoding || 'text').toLowerCase();

  switch (normalizedEncoding) {
    case 'text': {
      const bytes = Array.from(new TextEncoder().encode(input));
      return { bytes, isValid: true };
    }

    case 'json': {
      const parse = tryParseJson(input);
      if (!parse.success) {
        return {
          bytes: [],
          isValid: false,
          error: parse.error || 'Invalid JSON syntax',
        };
      }
      // Encode valid JSON string directly to UTF-8 bytes
      const bytes = Array.from(new TextEncoder().encode(input));
      return { bytes, isValid: true };
    }

    case 'cbor': {
      const parse = tryParseJson(input);
      if (!parse.success) {
        return {
          bytes: [],
          isValid: false,
          error: parse.error || 'Invalid JSON input for CBOR encoding',
        };
      }
      try {
        const cborBuf = cbor.encode(parse.data);
        return { bytes: Array.from(cborBuf), isValid: true };
      } catch (err) {
        return {
          bytes: [],
          isValid: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case 'raw': {
      // Check if input is a hex string (e.g., "0x48 0x65", "48 65", "4865")
      const trimmed = input.trim();
      const isExplicitHex = /^(0x[0-9a-fA-F]{1,2}[\s,]*)+$/i.test(trimmed);
      const isSpacedHex = /^([0-9a-fA-F]{2}[\s,]+)+[0-9a-fA-F]{2}$/i.test(trimmed);
      const isContinuousHex = /^[0-9a-fA-F]{2,}$/i.test(trimmed) && trimmed.length % 2 === 0;

      if (isExplicitHex || isSpacedHex || isContinuousHex) {
        // Strip 0x, spaces, commas
        const cleaned = trimmed.replace(/0x/gi, '').replace(/[\s,]+/g, '');
        if (cleaned.length > 0 && cleaned.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(cleaned)) {
          const bytes: number[] = [];
          for (let i = 0; i < cleaned.length; i += 2) {
            bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
          }
          return { bytes, isValid: true };
        }
      }

      // Fallback: encode as UTF-8 string bytes
      const bytes = Array.from(new TextEncoder().encode(input));
      return { bytes, isValid: true };
    }

    default: {
      const bytes = Array.from(new TextEncoder().encode(input));
      return { bytes, isValid: true };
    }
  }
}

// ============================================================================
// Automatic Encoding Detection
// ============================================================================

/**
 * Heuristically detects the most appropriate encoding for a byte payload.
 */
export function detectEncoding(payload: Uint8Array | number[] | null | undefined): EncodingType {
  const bytes = bytesToUint8Array(payload);
  if (bytes.length === 0) {
    return 'text';
  }

  // 1. Try CBOR decode first if it looks like binary CBOR (starts with map/array/tag and not printable ASCII)
  const firstByte = bytes[0];
  const isLikelyCborHeader =
    (firstByte >= 0x80 && firstByte <= 0x9b) || // CBOR Array
    (firstByte >= 0xa0 && firstByte <= 0xbb) || // CBOR Map
    (firstByte >= 0xc0 && firstByte <= 0xdb);   // CBOR Tag

  if (isLikelyCborHeader) {
    try {
      const decoded = cbor.decode(bytes);
      if (decoded !== undefined && decoded !== null && typeof decoded === 'object') {
        return 'cbor';
      }
    } catch {
      // Not valid CBOR
    }
  }

  // 2. Try UTF-8 string decoding
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

    // Check for null bytes or excessive unprintable control characters
    let unprintableCount = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
        unprintableCount++;
      }
    }

    if (unprintableCount > 0) {
      return 'raw';
    }

    // Check if it's valid JSON
    const trimmed = text.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      const jsonRes = tryParseJson(trimmed);
      if (jsonRes.success) {
        return 'json';
      }
    }

    return 'text';
  } catch {
    // Invalid UTF-8 sequence
    return 'raw';
  }
}
