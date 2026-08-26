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

/**
 * ZenohX Queryable JavaScript Script Execution Engine
 * Enables RPC queryables to execute dynamic JS logic upon receiving inbound queries.
 */

import { encodePayload } from './formatters';
import type { EncodingType, InboundQuery } from '../types/zenoh';

export interface ScriptQueryContext {
  keyExpr: string;
  parameters: string;
  params: Record<string, string>;
  payload: unknown;
  rawPayload: number[];
  sessionId?: string;
  token?: string;
  timestamp: number;
}

export interface ScriptExecutionResult {
  success: boolean;
  bytes: number[];
  encoding: EncodingType | string;
  keyExpr?: string;
  resultValue?: unknown;
  error?: string;
  executionTimeMs: number;
}

export interface ScriptTemplate {
  name: string;
  description: string;
  sampleQuery: string;
  code: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    name: 'RPC Calculator',
    description: 'Handles arithmetic operations (add, sub, mul, div) from URL query parameters',
    sampleQuery: 'op=add&a=15&b=27',
    code: `// Parse input parameters (e.g. ?op=add&a=15&b=27)
const a = parseFloat(query.params.a || 0);
const b = parseFloat(query.params.b || 0);
const op = (query.params.op || 'add').toLowerCase();

let result = 0;
if (op === 'add' || op === '+') result = a + b;
else if (op === 'sub' || op === '-') result = a - b;
else if (op === 'mul' || op === '*') result = a * b;
else if (op === 'div' || op === '/') result = b !== 0 ? a / b : 0;
else if (op === 'pow') result = Math.pow(a, b);

return {
  result,
  operation: op,
  inputs: { a, b },
  processed_at: new Date().toISOString()
};`,
  },
  {
    name: 'Dynamic Sensor Telemetry',
    description: 'Generates mock fluctuating telemetry sensor values with timestamp',
    sampleQuery: 'unit=celsius&sensor_id=sn-100',
    code: `// Generate dynamic sensor reading
const unit = query.params.unit || 'celsius';
const sensorId = query.params.sensor_id || 'sensor-alpha';
const baseTemp = unit === 'fahrenheit' ? 75 : 24;

return {
  sensor_id: sensorId,
  temperature: Number((baseTemp + (Math.random() * 4 - 2)).toFixed(2)),
  humidity: Number((55 + (Math.random() * 10 - 5)).toFixed(1)),
  battery: Math.floor(90 + Math.random() * 10),
  unit,
  timestamp: Date.now()
};`,
  },
  {
    name: 'Echo & Inspector',
    description: 'Echoes back the inbound request details, parameters, and payload',
    sampleQuery: 'debug=true&client=dashboard',
    code: `// Echo query back to querier for inspection
return {
  echo: true,
  received_key: query.keyExpr,
  parameters: query.params,
  payload: query.payload,
  session_id: query.sessionId,
  server_time: new Date().toISOString()
};`,
  },
  {
    name: 'Dynamic Status & Health',
    description: 'Simulates health status and ping-pong responses',
    sampleQuery: 'cmd=ping',
    code: `// Dynamic status responder
const cmd = query.params.cmd || 'status';

if (cmd === 'ping') {
  return { status: 'pong', latency_ms: Math.floor(Math.random() * 10) + 1 };
}

return {
  status: 'healthy',
  version: '1.0.0',
  timestamp: Date.now()
};`,
  },
];

/**
 * Parses query parameters string (e.g. "op=add&a=10&b=20") into key-value map.
 */
export function parseQueryParameters(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!queryString) return params;

  const clean = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  if (!clean) return params;

  const pairs = clean.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx !== -1) {
      const rawKey = pair.slice(0, eqIdx);
      const rawVal = pair.slice(eqIdx + 1);
      try {
        params[decodeURIComponent(rawKey.trim())] = decodeURIComponent(rawVal);
      } catch {
        params[rawKey.trim()] = rawVal;
      }
    } else {
      try {
        params[decodeURIComponent(pair.trim())] = '';
      } catch {
        params[pair.trim()] = '';
      }
    }
  }
  return params;
}

/**
 * Parses inbound byte payload into readable JavaScript structure (JSON, string, or number[]).
 */
export function parseInboundPayload(bytes: number[] | null | undefined): unknown {
  if (!bytes || bytes.length === 0) return null;
  const uint8 = new Uint8Array(bytes);
  try {
    const text = new TextDecoder('utf-8').decode(uint8);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return Array.from(bytes);
  }
}

/**
 * Encodes a script return value into byte array and encoding type.
 */
export function encodeResultValue(
  value: unknown,
  defaultEncoding: EncodingType | string = 'json'
): { bytes: number[]; error?: string } {
  if (value === undefined || value === null) {
    return { bytes: [] };
  }
  if (typeof value === 'string') {
    return encodePayload(value, defaultEncoding as EncodingType);
  }
  if (value instanceof Uint8Array) {
    return { bytes: Array.from(value) };
  }
  if (Array.isArray(value) && value.every((x) => typeof x === 'number')) {
    return { bytes: value };
  }
  try {
    const jsonStr = JSON.stringify(value, null, 2);
    return encodePayload(jsonStr, defaultEncoding === 'cbor' ? 'cbor' : 'json');
  } catch {
    const fallback = String(value);
    return encodePayload(fallback, 'text');
  }
}

/**
 * Executes a JavaScript query handler script with the given query context.
 */
export async function executeInboundScript(
  scriptCode: string,
  inbound:
    | InboundQuery
    | {
        key_expr: string;
        parameters?: string;
        payload?: number[] | null;
        session_id?: string;
        token?: string;
      },
  defaultEncoding: EncodingType | string = 'json',
  timeoutMs: number = 3000
): Promise<ScriptExecutionResult> {
  const startTime = Date.now();
  const rawParams = inbound.parameters || '';
  const parsedParams = parseQueryParameters(rawParams);
  const parsedPayload = parseInboundPayload(inbound.payload);

  const queryContext: ScriptQueryContext = {
    keyExpr: inbound.key_expr,
    parameters: rawParams,
    params: parsedParams,
    payload: parsedPayload,
    rawPayload: inbound.payload || [],
    sessionId: inbound.session_id,
    token: inbound.token,
    timestamp: Date.now(),
  };

  try {
    // Construct AsyncFunction with 'query' parameter
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('query', scriptCode);

    // Timeout guard against infinite loops or hanging promises
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Script execution timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    );

    const execPromise = Promise.resolve(fn(queryContext));
    const rawResult = await Promise.race([execPromise, timeoutPromise]);

    const executionTimeMs = Date.now() - startTime;

    // Check if result is explicit response object { payload, encoding, keyExpr }
    if (
      rawResult &&
      typeof rawResult === 'object' &&
      'payload' in rawResult &&
      !Array.isArray(rawResult)
    ) {
      const explicit = rawResult as { payload: unknown; encoding?: string; keyExpr?: string };
      const enc = (explicit.encoding || defaultEncoding) as EncodingType;
      const key = explicit.keyExpr || inbound.key_expr;
      const encoded = encodeResultValue(explicit.payload, enc);

      return {
        success: true,
        bytes: encoded.bytes,
        encoding: enc,
        keyExpr: key,
        resultValue: rawResult,
        executionTimeMs,
      };
    }

    const encoded = encodeResultValue(rawResult, defaultEncoding as EncodingType);
    return {
      success: true,
      bytes: encoded.bytes,
      encoding: defaultEncoding,
      keyExpr: inbound.key_expr,
      resultValue: rawResult,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorPayload = {
      error: 'Script execution failed',
      details: errorMsg,
      timestamp: Date.now(),
    };
    const encoded = encodePayload(JSON.stringify(errorPayload, null, 2), 'json');

    return {
      success: false,
      bytes: encoded.bytes,
      encoding: 'json',
      keyExpr: inbound.key_expr,
      error: errorMsg,
      resultValue: errorPayload,
      executionTimeMs,
    };
  }
}
