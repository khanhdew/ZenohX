// Copyright 2026 ZenohX Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import protobuf from 'protobufjs';

/**
 * Result of parsing a .proto schema string.
 */
export interface ParsedProtoSchema {
  root: protobuf.Root;
  syntax: 'proto2' | 'proto3';
  package?: string;
  messageTypes: string[];
}

/**
 * Extract all fully qualified message type names from a protobuf Root instance.
 * Normalizes type names by removing leading dots (e.g. "iot.sensor.TelemetryData").
 */
export function extractMessageTypes(root: protobuf.Root): string[] {
  const messageTypes: string[] = [];

  function walk(ns: protobuf.NamespaceBase) {
    if (!ns.nestedArray) return;
    for (const obj of ns.nestedArray) {
      if (obj instanceof protobuf.Type) {
        messageTypes.push(obj.fullName.replace(/^\./, ''));
      }
      if (obj instanceof protobuf.Namespace) {
        walk(obj);
      }
    }
  }

  walk(root);
  return messageTypes;
}

/**
 * Parse a raw .proto schema string into a protobuf Root and extracted metadata.
 */
export function parseProtoSchema(rawContent: string): ParsedProtoSchema {
  if (!rawContent || !rawContent.trim()) {
    throw new Error('Empty protobuf schema content provided');
  }

  const trimmed = rawContent.trim();

  // Detect syntax (proto3 vs proto2)
  const syntaxMatch = trimmed.match(/syntax\s*=\s*["'](proto2|proto3)["']/);
  const syntax: 'proto2' | 'proto3' = syntaxMatch ? (syntaxMatch[1] as 'proto2' | 'proto3') : 'proto2';

  try {
    const parsed = protobuf.parse(trimmed, { keepCase: true, alternateCommentMode: true });
    const root = parsed.root;
    try {
      root.resolveAll();
    } catch {
      // Ignore unresolved external imports in isolated strings
    }

    const pkg = parsed.package || undefined;
    const messageTypes = extractMessageTypes(root);

    return {
      root,
      syntax,
      package: pkg,
      messageTypes,
    };
  } catch (err: any) {
    throw new Error(`Protobuf schema parsing error: ${err?.message || err}`);
  }
}

/**
 * Resolves a message type from a protobuf Root by full name, dot-prefixed name, or simple name.
 */
export function resolveProtoType(root: protobuf.Root, typeName: string): protobuf.Type {
  if (!typeName || typeof typeName !== 'string') {
    throw new Error('Message type name is required');
  }

  const cleanName = typeName.trim();
  if (!cleanName) {
    throw new Error('Message type name cannot be empty');
  }

  try {
    root.resolveAll();
  } catch {
    // Ignore unresolved external imports
  }

  // 1. Direct lookup
  try {
    const direct = root.lookupType(cleanName);
    if (direct) {
      direct.resolve();
      return direct;
    }
  } catch {
    // Continue to fallback strategies
  }

  if (!cleanName.startsWith('.')) {
    try {
      const dotDirect = root.lookupType('.' + cleanName);
      if (dotDirect) {
        dotDirect.resolve();
        return dotDirect;
      }
    } catch {
      // Continue
    }
  }

  // 2. Search all types in the root hierarchy
  const allTypes: protobuf.Type[] = [];
  function collectTypes(ns: protobuf.NamespaceBase) {
    if (!ns.nestedArray) return;
    for (const obj of ns.nestedArray) {
      if (obj instanceof protobuf.Type) {
        allTypes.push(obj);
      }
      if (obj instanceof protobuf.Namespace) {
        collectTypes(obj);
      }
    }
  }
  collectTypes(root);

  const normalizedTarget = cleanName.replace(/^\./, '');

  // Exact match on normalized full name
  const exactFull = allTypes.find((t) => t.fullName.replace(/^\./, '') === normalizedTarget);
  if (exactFull) {
    exactFull.resolve();
    return exactFull;
  }

  // Match on short type name
  const shortMatch = allTypes.find((t) => t.name === normalizedTarget);
  if (shortMatch) {
    shortMatch.resolve();
    return shortMatch;
  }

  // Suffix match (e.g. "RobotState.ArmPose" or "ArmPose")
  const suffixMatch = allTypes.find((t) =>
    t.fullName.replace(/^\./, '').endsWith('.' + normalizedTarget)
  );
  if (suffixMatch) {
    suffixMatch.resolve();
    return suffixMatch;
  }

  throw new Error(`Protobuf message type "${typeName}" not found in schema`);
}

/**
 * Validate payload object against protobuf Type definition.
 */
function validatePayloadAgainstType(type: protobuf.Type, payload: any): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Protobuf payload must be an object, got ${typeof payload}`);
  }

  type.resolve();

  for (const fieldName of Object.keys(type.fields)) {
    const field = type.fields[fieldName];
    field.resolve();

    const val = payload[fieldName];

    // Check required fields (proto2)
    if (field.required && (val === undefined || val === null)) {
      throw new Error(`Missing required field "${fieldName}" for type "${type.name}"`);
    }

    if (val === undefined || val === null) {
      continue;
    }

    validateFieldValue(field, val);
  }
}

function validateFieldValue(field: protobuf.FieldBase, val: any): void {
  if (field.repeated) {
    if (!Array.isArray(val)) {
      throw new Error(`Expected array for repeated field "${field.name}"`);
    }
    for (const item of val) {
      validateSingleValue(field, item);
    }
    return;
  }

  if (field.map) {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      throw new Error(`Expected object for map field "${field.name}"`);
    }
    const mapField = field as protobuf.MapField;
    mapField.resolve();
    for (const k of Object.keys(val)) {
      validateSingleValue(mapField, val[k]);
    }
    return;
  }

  validateSingleValue(field, val);
}

function validateSingleValue(field: protobuf.FieldBase, val: any): void {
  if (val === undefined || val === null) return;

  if (field.resolvedType instanceof protobuf.Enum) {
    if (typeof val === 'string') {
      if (field.resolvedType.values[val] === undefined) {
        throw new Error(
          `Invalid enum value "${val}" for field "${field.name}" in enum "${field.resolvedType.name}"`
        );
      }
    } else if (typeof val === 'number') {
      if (field.resolvedType.valuesById[val] === undefined) {
        throw new Error(
          `Invalid enum id ${val} for field "${field.name}" in enum "${field.resolvedType.name}"`
        );
      }
    } else {
      throw new Error(`Invalid type for enum field "${field.name}": expected string or number`);
    }
    return;
  }

  if (field.resolvedType instanceof protobuf.Type) {
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new Error(`Expected object for message field "${field.name}"`);
    }
    validatePayloadAgainstType(field.resolvedType, val);
    return;
  }

  switch (field.type) {
    case 'double':
    case 'float':
    case 'int32':
    case 'uint32':
    case 'sint32':
    case 'fixed32':
    case 'sfixed32':
    case 'int64':
    case 'uint64':
    case 'sint64':
    case 'fixed64':
    case 'sfixed64': {
      if (typeof val === 'number') {
        if (Number.isNaN(val)) {
          throw new Error(`Invalid number NaN for field "${field.name}"`);
        }
      } else if (typeof val === 'string') {
        if (val.trim() === '' || Number.isNaN(Number(val))) {
          throw new Error(`Invalid numeric string "${val}" for field "${field.name}"`);
        }
      } else if (typeof val === 'bigint') {
        // BigInt is valid
      } else if (typeof val === 'object' && val !== null && (val.low !== undefined || (val as any)._isLong)) {
        // Long object is valid
      } else {
        throw new Error(`Invalid type ${typeof val} for numeric field "${field.name}"`);
      }
      break;
    }
    case 'bool': {
      if (typeof val !== 'boolean' && val !== 'true' && val !== 'false') {
        throw new Error(`Expected boolean for field "${field.name}"`);
      }
      break;
    }
    case 'string': {
      if (typeof val !== 'string' && typeof val !== 'number') {
        throw new Error(`Expected string for field "${field.name}"`);
      }
      break;
    }
    case 'bytes': {
      if (
        typeof val !== 'string' &&
        !(val instanceof Uint8Array) &&
        !Array.isArray(val) &&
        (typeof Buffer === 'undefined' || !Buffer.isBuffer(val))
      ) {
        throw new Error(`Expected base64 string or byte array for bytes field "${field.name}"`);
      }
      break;
    }
  }
}

/**
 * Encodes a JSON object or JSON string into binary Protobuf bytes (Uint8Array).
 */
export function encodeProtobufPayload(
  root: protobuf.Root,
  typeName: string,
  jsonData: any
): Uint8Array {
  const type = resolveProtoType(root, typeName);

  let payloadObj = jsonData;
  if (typeof jsonData === 'string') {
    try {
      payloadObj = JSON.parse(jsonData);
    } catch (err: any) {
      throw new Error(`Failed to parse JSON input for Protobuf encoding: ${err?.message || err}`);
    }
  }

  if (!payloadObj || typeof payloadObj !== 'object') {
    throw new Error(`Protobuf payload must be an object, got ${typeof payloadObj}`);
  }

  // Validate types before encoding
  validatePayloadAgainstType(type, payloadObj);

  try {
    const message = type.fromObject(payloadObj);
    return type.encode(message).finish();
  } catch (err: any) {
    throw new Error(`Failed to encode Protobuf payload for type "${typeName}": ${err?.message || err}`);
  }
}

/**
 * Decodes binary Protobuf bytes into a plain JavaScript/JSON object.
 */
export function decodeProtobufPayload(
  root: protobuf.Root,
  typeName: string,
  bytes: Uint8Array | number[] | ArrayBuffer | Buffer,
  options?: protobuf.IConversionOptions
): Record<string, any> {
  const type = resolveProtoType(root, typeName);

  let uint8Bytes: Uint8Array;
  if (bytes instanceof Uint8Array) {
    uint8Bytes = bytes;
  } else if (Array.isArray(bytes)) {
    uint8Bytes = new Uint8Array(bytes);
  } else if (bytes instanceof ArrayBuffer) {
    uint8Bytes = new Uint8Array(bytes);
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) {
    const buf = bytes as any;
    uint8Bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    throw new Error('Invalid byte buffer provided for Protobuf decoding');
  }

  try {
    const message = type.decode(uint8Bytes);
    const conversionOptions: protobuf.IConversionOptions = {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true,
      objects: true,
      ...options,
    };
    return type.toObject(message, conversionOptions);
  } catch (err: any) {
    throw new Error(`Failed to decode Protobuf payload for type "${typeName}": ${err?.message || err}`);
  }
}

/**
 * Helper to generate a sample placeholder value for a given field type.
 */
function generateFieldSampleValue(
  field: protobuf.FieldBase,
  visitedTypes: Set<string>,
  depth: number
): any {
  field.resolve();

  if (field.map) {
    const mapField = field as protobuf.MapField;
    mapField.resolve();
    const key = mapField.keyType === 'string' ? 'sample_key' : '1';
    let val: any = 'sample_value';
    if (mapField.resolvedType instanceof protobuf.Type) {
      val = generateTypeSampleObject(mapField.resolvedType, visitedTypes, depth + 1);
    } else if (mapField.resolvedType instanceof protobuf.Enum) {
      val = getEnumSampleValue(mapField.resolvedType);
    } else {
      val = getScalarDefault(mapField.type, mapField.name);
    }
    return { [key]: val };
  }

  let sample: any;
  if (field.resolvedType instanceof protobuf.Type) {
    sample = generateTypeSampleObject(field.resolvedType, visitedTypes, depth + 1);
  } else if (field.resolvedType instanceof protobuf.Enum) {
    sample = getEnumSampleValue(field.resolvedType);
  } else {
    sample = getScalarDefault(field.type, field.name);
  }

  if (field.repeated) {
    return [sample];
  }

  return sample;
}

function getEnumSampleValue(enumType: protobuf.Enum): string {
  const keys = Object.keys(enumType.values);
  if (keys.length === 0) return 'UNKNOWN';
  return keys[0];
}

function getScalarDefault(scalarType: string, fieldName?: string): any {
  switch (scalarType) {
    case 'string':
      return fieldName ? `sample_${fieldName}` : 'sample_string';
    case 'bool':
      return true;
    case 'float':
    case 'double':
      return 0.0;
    case 'int32':
    case 'uint32':
    case 'sint32':
    case 'fixed32':
    case 'sfixed32':
      return 0;
    case 'int64':
    case 'uint64':
    case 'sint64':
    case 'fixed64':
    case 'sfixed64':
      return 0;
    case 'bytes':
      return 'aGVsbG8='; // Base64 for "hello"
    default:
      return '';
  }
}

function generateTypeSampleObject(
  type: protobuf.Type,
  visitedTypes: Set<string>,
  depth: number
): Record<string, any> {
  const typeId = type.fullName;
  if (visitedTypes.has(typeId) || depth > 5) {
    return {};
  }

  visitedTypes.add(typeId);
  type.resolve();

  const result: Record<string, any> = {};
  const fields = type.fields;

  for (const fieldName of Object.keys(fields)) {
    const field = fields[fieldName];
    result[fieldName] = generateFieldSampleValue(field, new Set(visitedTypes), depth);
  }

  return result;
}

/**
 * Generate a complete, ready-to-edit sample JSON template for a given message type.
 */
export function generateProtoSampleJson(
  root: protobuf.Root,
  typeName: string
): Record<string, any> {
  const type = resolveProtoType(root, typeName);
  return generateTypeSampleObject(type, new Set(), 0);
}
