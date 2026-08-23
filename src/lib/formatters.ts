/**
 * ZenohX Payload Encoders, Decoders, and Formatters
 * Provides type conversion, syntax validation, CBOR serialization,
 * and multi-column Hex dump generation.
 */

import * as cbor from 'cbor-x';
import type protobuf from 'protobufjs';
import type { EncodingType } from '../types/zenoh';
import { encodeProtobufPayload, decodeProtobufPayload } from './protobufEngine';
import { useProtoStore } from '../stores/protoStore';

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

export interface ProtoFormatOptions {
  protoTypeName?: string;
  keyExpr?: string;
  protoId?: string;
  root?: protobuf.Root;
  indent?: number;
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

/**
 * Tries to decode a byte array as Protobuf and pretty-print it as JSON.
 */
export function tryFormatProtobuf(
  input: Uint8Array | number[] | null | undefined,
  options?: ProtoFormatOptions
): ParseResult {
  const bytes = bytesToUint8Array(input);
  if (bytes.length === 0) {
    return { success: true, formatted: '', data: null };
  }

  const indent = options?.indent !== undefined ? options.indent : 2;
  let typeName = options?.protoTypeName;
  let root = options?.root;

  if (!typeName && options?.keyExpr) {
    const mapping = useProtoStore.getState().findMappingForKey(options.keyExpr);
    if (mapping) {
      typeName = mapping.messageTypeName;
      if (!root && mapping.protoId) {
        root = useProtoStore.getState().getCompiledRoot(mapping.protoId) || undefined;
      }
    }
  }

  if (!root) {
    root = options?.protoId
      ? useProtoStore.getState().getCompiledRoot(options.protoId) || useProtoStore.getState().getGlobalRoot()
      : useProtoStore.getState().getGlobalRoot();
  }

  if (!typeName) {
    return {
      success: false,
      formatted: '',
      error: 'No Protobuf message type specified or mapped for decoding',
    };
  }

  try {
    const data = decodeProtobufPayload(root, typeName, bytes);
    const formatted = JSON.stringify(data, null, indent);
    return { success: true, formatted, data };
  } catch (err: any) {
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
  indent: number = 2,
  options?: ProtoFormatOptions
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
    case 'protobuf': {
      const res = tryFormatProtobuf(bytes, { ...options, indent });
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
 * Validates JSON/CBOR/Protobuf syntax and parses raw hex representations.
 */
export function encodePayload(
  input: string,
  encoding: EncodingType | string,
  options?: ProtoFormatOptions
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

    case 'protobuf': {
      const parse = tryParseJson(input);
      if (!parse.success) {
        return {
          bytes: [],
          isValid: false,
          error: parse.error || 'Invalid JSON syntax for Protobuf encoding',
        };
      }

      let typeName = options?.protoTypeName;
      let root = options?.root;

      if (!typeName && options?.keyExpr) {
        const mapping = useProtoStore.getState().findMappingForKey(options.keyExpr);
        if (mapping) {
          typeName = mapping.messageTypeName;
          if (!root && mapping.protoId) {
            root = useProtoStore.getState().getCompiledRoot(mapping.protoId) || undefined;
          }
        }
      }

      if (!root) {
        root = options?.protoId
          ? useProtoStore.getState().getCompiledRoot(options.protoId) || useProtoStore.getState().getGlobalRoot()
          : useProtoStore.getState().getGlobalRoot();
      }

      if (!typeName) {
        return {
          bytes: [],
          isValid: false,
          error: 'Protobuf message type or topic mapping required for encoding',
        };
      }

      try {
        const uint8Bytes = encodeProtobufPayload(root, typeName, parse.data);
        return { bytes: Array.from(uint8Bytes), isValid: true };
      } catch (err: any) {
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
export function detectEncoding(
  payload: Uint8Array | number[] | null | undefined,
  options?: { keyExpr?: string }
): EncodingType {
  if (options?.keyExpr) {
    const mapping = useProtoStore.getState().findMappingForKey(options.keyExpr);
    if (mapping) {
      return 'protobuf';
    }
  }

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

/**
 * Normalizes raw MIME strings or Zenoh encoding names (e.g. 'application/json', 'zenoh/bytes')
 * into a recognized EncodingType, falling back to payload auto-detection when appropriate.
 */
export function normalizeEncoding(
  rawEncoding?: string | null,
  payload?: Uint8Array | number[] | null,
  keyExpr?: string
): EncodingType {
  if (rawEncoding) {
    const lower = rawEncoding.toLowerCase().trim();
    if (lower === 'json' || lower === 'application/json') return 'json';
    if (lower === 'cbor' || lower === 'application/cbor') return 'cbor';
    if (
      lower === 'protobuf' ||
      lower === 'proto' ||
      lower === 'application/protobuf' ||
      lower === 'application/x-protobuf'
    ) {
      return 'protobuf';
    }
    if (lower === 'text' || lower === 'text/plain' || lower === 'string') return 'text';
    if (lower === 'hex') return 'raw';
    if (lower === 'raw' || lower === 'bytes' || lower === 'zenoh/bytes' || lower === 'application/octet-stream') {
      if (keyExpr) {
        const mapping = useProtoStore.getState().findMappingForKey(keyExpr);
        if (mapping) return 'protobuf';
      }
      if (payload) {
        const bytes = bytesToUint8Array(payload);
        if (bytes.length > 0) {
          return detectEncoding(bytes, { keyExpr });
        }
      }
      return 'raw';
    }
  }
  if (keyExpr) {
    const mapping = useProtoStore.getState().findMappingForKey(keyExpr);
    if (mapping) return 'protobuf';
  }
  return detectEncoding(payload, { keyExpr });
}

// ============================================================================
// Time & Preview Utilities
// ============================================================================

/**
 * Formats a unix timestamp (ms) to HH:mm:ss.SSS time string.
 */
export function formatTimeWithMs(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Formats a unix timestamp (ms) to YYYY/MM/DD HH:mm:ss.SSS date-time string.
 */
export function formatFullDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Creates a single-line preview string from a message payload.
 */
export function getPayloadSnippet(
  payload: number[] | Uint8Array | null | undefined,
  encoding?: EncodingType | string,
  maxLength: number = 120,
  options?: ProtoFormatOptions
): string {
  if (!payload || (Array.isArray(payload) && payload.length === 0) || (payload instanceof Uint8Array && payload.length === 0)) {
    return '(empty payload)';
  }

  const bytes = bytesToUint8Array(payload);
  const enc = (encoding || '').toLowerCase();

  if (enc === 'json') {
    const res = tryFormatJson(bytes, 0);
    if (res.success && res.data !== undefined) {
      try {
        const compact = JSON.stringify(res.data);
        return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
      } catch {
        return res.formatted.slice(0, maxLength);
      }
    }
  }

  if (enc === 'cbor') {
    const res = tryFormatCbor(bytes, 0);
    if (res.success && res.data !== undefined) {
      try {
        const compact = JSON.stringify(res.data);
        return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
      } catch {
        return res.formatted.slice(0, maxLength);
      }
    }
  }

  if (enc === 'protobuf') {
    const res = tryFormatProtobuf(bytes, { ...options, indent: 0 });
    if (res.success && res.data !== undefined) {
      try {
        const compact = JSON.stringify(res.data);
        return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
      } catch {
        return res.formatted.slice(0, maxLength);
      }
    }
  }

  if (enc === 'raw') {
    const hexPreview: string[] = [];
    const limit = Math.min(bytes.length, 16);
    for (let i = 0; i < limit; i++) {
      hexPreview.push(bytes[i].toString(16).padStart(2, '0'));
    }
    return `${hexPreview.join(' ')}${bytes.length > 16 ? '…' : ''}`;
  }

  // Try text decode
  try {
    const str = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const sanitized = str.replace(/[\r\n\t]+/g, ' ').trim();
    if (sanitized.length > 0) {
      return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}…` : sanitized;
    }
  } catch {
    // Binary fallback
  }

  // Hex preview for binary fallback
  const hexPreview: string[] = [];
  const limit = Math.min(bytes.length, 16);
  for (let i = 0; i < limit; i++) {
    hexPreview.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return `${hexPreview.join(' ')}${bytes.length > 16 ? '…' : ''}`;
}

/**
 * Tests whether a topic key matches a Zenoh subscription key expression pattern.
 * Supports glob wildcards '*' (single level) and '**' (recursive multi-level).
 */
export function matchesKeyExpr(pattern: string, key: string): boolean {
  if (!pattern || !key) return false;
  if (pattern === key || pattern === '**') return true;
  if (pattern === '*') return !key.includes('/');

  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const placeholder = '___DOUBLE_STAR___';
    const regexPattern =
      '^' +
      escaped
        .replace(/\*\*/g, placeholder)
        .replace(/\*/g, '[^/]+')
        .replace(new RegExp(`/${placeholder}/`, 'g'), '(?:/|/.*/)')
        .replace(new RegExp(`/${placeholder}$`, 'g'), '(?:/.*)?')
        .replace(new RegExp(`^${placeholder}/`, 'g'), '(?:.*/)?')
        .replace(new RegExp(placeholder, 'g'), '.*') +
      '$';

    try {
      return new RegExp(regexPattern).test(key);
    } catch {
      return false;
    }
  }

  return pattern === key;
}

export interface SubscriptionLike {
  id?: string;
  profileId?: string | null;
  sessionId?: string | null;
  keyExpr: string;
  colorTag?: string | null;
  encoding?: string | null;
}

/**
 * Finds the most specific matching subscription for a given topic/key expression.
 * Prioritizes:
 * 1. Matching profile/session scope
 * 2. Exact match (s.keyExpr === keyExpr)
 * 3. Most specific wildcard match (e.g. single '*' or longest literal prefix over multi-level '**')
 */
export function findMatchingSubscription<T extends SubscriptionLike>(
  subscriptions: T[],
  keyExpr: string,
  profileId?: string | null,
  sessionId?: string | null
): T | undefined {
  if (!subscriptions || subscriptions.length === 0 || !keyExpr) return undefined;

  // Filter by profile or session if available
  const scoped = subscriptions.filter((s) => {
    if (profileId && s.profileId && s.profileId !== profileId) return false;
    if (sessionId && s.sessionId && s.sessionId !== sessionId) return false;
    return true;
  });

  const candidates = scoped.length > 0 ? scoped : subscriptions;
  const matching = candidates.filter((s) => matchesKeyExpr(s.keyExpr, keyExpr));
  if (matching.length === 0) return undefined;
  if (matching.length === 1) return matching[0];

  // Sort by specificity:
  // 1. Exact match
  // 2. Single '*' wildcard over recursive '**'
  // 3. Longest literal prefix before first wildcard
  // 4. Longest key expression length
  return matching.slice().sort((a, b) => {
    if (a.keyExpr === keyExpr && b.keyExpr !== keyExpr) return -1;
    if (b.keyExpr === keyExpr && a.keyExpr !== keyExpr) return 1;

    const aHasDoubleStar = a.keyExpr.includes('**');
    const bHasDoubleStar = b.keyExpr.includes('**');
    if (!aHasDoubleStar && bHasDoubleStar) return -1;
    if (aHasDoubleStar && !bHasDoubleStar) return 1;

    const aPrefix = a.keyExpr.split('*')[0].length;
    const bPrefix = b.keyExpr.split('*')[0].length;
    if (aPrefix !== bPrefix) return bPrefix - aPrefix;

    return b.keyExpr.length - a.keyExpr.length;
  })[0];
}

/**
 * Resolves the color tag for a message based on its topic and matching subscriptions.
 */
export function getTopicColorTag<T extends SubscriptionLike>(
  subscriptions: T[],
  keyExpr: string,
  direction?: 'incoming' | 'outgoing' | string,
  profileId?: string | null,
  sessionId?: string | null
): { color: string; matchedSub?: T } {
  const matchedSub = findMatchingSubscription(subscriptions, keyExpr, profileId, sessionId);
  if (matchedSub?.colorTag) {
    return { color: matchedSub.colorTag, matchedSub };
  }
  const fallbackColor = direction === 'outgoing' ? '#8b5cf6' : '#0284c7';
  return { color: fallbackColor, matchedSub };
}

// ============================================================================
// Recent Keys Storage & Management
// ============================================================================

export const RECENT_KEYS_STORAGE_KEY = 'zenohx_recent_publish_keys';
export const MAX_RECENT_KEYS = 5;

/**
 * Updates an array of recent key expressions by prepending the new key,
 * deduplicating, and capping the total count to maxItems (default: 5).
 */
export function updateRecentKeys(
  recentKeys: string[],
  newKey: string,
  maxItems: number = MAX_RECENT_KEYS
): string[] {
  const trimmed = newKey ? newKey.trim() : '';
  if (!trimmed) {
    return recentKeys;
  }
  const filtered = recentKeys.filter((k) => k !== trimmed);
  return [trimmed, ...filtered].slice(0, maxItems);
}

/**
 * Safely loads recent key expressions from localStorage.
 */
export function loadRecentKeys(storageKey: string = RECENT_KEYS_STORAGE_KEY): string[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, MAX_RECENT_KEYS);
    }
  } catch {
    // Ignore storage parse errors
  }
  return [];
}

/**
 * Safely saves recent key expressions to localStorage.
 */
export function saveRecentKeys(
  keys: string[],
  storageKey: string = RECENT_KEYS_STORAGE_KEY
): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys.slice(0, MAX_RECENT_KEYS)));
  } catch {
    // Ignore storage write errors
  }
}





