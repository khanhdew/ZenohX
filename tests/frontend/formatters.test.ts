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

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatByteSize,
  toHexDump,
  tryParseJson,
  tryFormatJson,
  tryFormatCbor,
  formatPayload,
  encodePayload,
  detectEncoding,
  normalizeEncoding,
  bytesToUint8Array,
  matchesKeyExpr,
  findMatchingSubscription,
  getTopicColorTag,
  formatTimeWithMs,
  formatFullDateTime,
  updateRecentKeys,
  loadRecentKeys,
  saveRecentKeys,
  tryFormatProtobuf,
  getPayloadSnippet,
  MAX_RECENT_KEYS,
} from '../../src/lib/formatters';
import { formatJsCode } from '../../src/lib/codeFormatter';
import { useProtoStore } from '../../src/stores/protoStore';
import * as cbor from 'cbor-x';

describe('formatByteSize', () => {
  test('formats byte sizes correctly', () => {
    assert.equal(formatByteSize(0), '0 B');
    assert.equal(formatByteSize(512), '512 B');
    assert.equal(formatByteSize(1024), '1.00 KB');
    assert.equal(formatByteSize(1536), '1.50 KB');
    assert.equal(formatByteSize(1048576), '1.00 MB');
    assert.equal(formatByteSize(1073741824), '1.00 GB');
  });
});

describe('toHexDump', () => {
  test('formats empty payload', () => {
    assert.equal(toHexDump([]), '');
    assert.equal(toHexDump(new Uint8Array([])), '');
  });

  test('formats single line of bytes with ascii column', () => {
    const bytes = Array.from(Buffer.from('Hello, World!'));
    const dump = toHexDump(bytes);
    assert.ok(dump.includes('00000000'));
    assert.ok(dump.includes('48 65 6c 6c 6f 2c 20 57'));
    assert.ok(dump.includes('|Hello, World!|'));
  });

  test('formats multi-line hex dump with 16 bytes per line and padding', () => {
    const text = 'Zenoh is a pub/sub/query protocol for edge and cloud.';
    const bytes = Array.from(Buffer.from(text));
    const dump = toHexDump(bytes);
    const lines = dump.split('\n');
    assert.ok(lines.length >= 4);
    assert.ok(lines[0].startsWith('00000000'));
    assert.ok(lines[1].startsWith('00000010'));
    assert.ok(lines[2].startsWith('00000020'));
    assert.ok(lines[3].startsWith('00000030'));
  });

  test('replaces non-printable characters in ascii column with dots', () => {
    const bytes = [0x00, 0x01, 0x1f, 0x41, 0x7e, 0x7f, 0x80, 0xff];
    const dump = toHexDump(bytes);
    assert.ok(dump.includes('|...A~...|'));
  });
});

describe('tryParseJson & tryFormatJson', () => {
  test('parses valid JSON string', () => {
    const res = tryParseJson('{"temp": 24.5, "active": true}');
    assert.equal(res.success, true);
    assert.deepEqual(res.data, { temp: 24.5, active: true });
    assert.equal(res.error, undefined);
  });

  test('handles invalid JSON string gracefully', () => {
    const res = tryParseJson('{temp: 24.5,}');
    assert.equal(res.success, false);
    assert.equal(res.data, undefined);
    assert.ok(res.error);
  });

  test('formats JSON string with indent', () => {
    const res = tryFormatJson('{"a":1,"b":[2,3]}', 2);
    assert.equal(res.success, true);
    assert.equal(res.formatted, '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  test('formats JSON from byte array', () => {
    const bytes = Array.from(Buffer.from('{"status":"ok"}'));
    const res = tryFormatJson(bytes, 2);
    assert.equal(res.success, true);
    assert.equal(res.formatted, '{\n  "status": "ok"\n}');
  });

  test('returns fallback text on malformed JSON bytes', () => {
    const bytes = Array.from(Buffer.from('not a json object'));
    const res = tryFormatJson(bytes);
    assert.equal(res.success, false);
    assert.equal(res.formatted, 'not a json object');
    assert.ok(res.error);
  });
});

describe('tryFormatCbor', () => {
  test('decodes and formats valid CBOR payload', () => {
    const obj = { sensorId: 'temp-01', readings: [22.1, 22.4, 22.8], active: true };
    const encoded = Array.from(cbor.encode(obj));

    const res = tryFormatCbor(encoded, 2);
    assert.equal(res.success, true);
    assert.deepEqual(res.data, obj);
    assert.ok(res.formatted.includes('"sensorId": "temp-01"'));
  });

  test('handles invalid CBOR payload gracefully', () => {
    const invalidBytes = [0xff, 0xff, 0xff, 0xff];
    const res = tryFormatCbor(invalidBytes);
    assert.equal(res.success, false);
    assert.ok(res.error);
  });
});

describe('formatPayload', () => {
  test('formats json payload', () => {
    const bytes = Array.from(Buffer.from('{"key":"value"}'));
    const formatted = formatPayload(bytes, 'json');
    assert.equal(formatted, '{\n  "key": "value"\n}');
  });

  test('formats cbor payload', () => {
    const obj = { message: 'hello cbor' };
    const bytes = Array.from(cbor.encode(obj));
    const formatted = formatPayload(bytes, 'cbor');
    assert.ok(formatted.includes('"message": "hello cbor"'));
  });

  test('formats text payload', () => {
    const bytes = Array.from(Buffer.from('Plain text message'));
    const formatted = formatPayload(bytes, 'text');
    assert.equal(formatted, 'Plain text message');
  });

  test('formats raw payload as hex dump', () => {
    const bytes = [0xde, 0xad, 0xbe, 0xef];
    const formatted = formatPayload(bytes, 'raw');
    assert.ok(formatted.includes('de ad be ef'));
  });
});

describe('encodePayload', () => {
  test('encodes text into UTF-8 bytes', () => {
    const res = encodePayload('Hello World', 'text');
    assert.equal(res.isValid, true);
    assert.deepEqual(res.bytes, Array.from(Buffer.from('Hello World', 'utf-8')));
  });

  test('encodes valid JSON into UTF-8 bytes', () => {
    const jsonStr = '{"count": 42}';
    const res = encodePayload(jsonStr, 'json');
    assert.equal(res.isValid, true);
    assert.deepEqual(res.bytes, Array.from(Buffer.from(jsonStr, 'utf-8')));
  });

  test('rejects invalid JSON when encoding with json mode', () => {
    const res = encodePayload('{invalid json', 'json');
    assert.equal(res.isValid, false);
    assert.ok(res.error);
  });

  test('encodes JSON string to CBOR bytes', () => {
    const jsonStr = '{"temp": 25.5, "unit": "C"}';
    const res = encodePayload(jsonStr, 'cbor');
    assert.equal(res.isValid, true);
    assert.ok(res.bytes.length > 0);

    const decoded = cbor.decode(new Uint8Array(res.bytes));
    assert.deepEqual(decoded, { temp: 25.5, unit: 'C' });
  });

  test('rejects invalid JSON when encoding to cbor', () => {
    const res = encodePayload('not json', 'cbor');
    assert.equal(res.isValid, false);
    assert.ok(res.error);
  });

  test('encodes hex string in raw mode', () => {
    const hexInput = '0x48 0x65 0x6c 0x6c 0x6f';
    const res = encodePayload(hexInput, 'raw');
    assert.equal(res.isValid, true);
    assert.deepEqual(res.bytes, [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  test('encodes plain hex bytes without 0x in raw mode', () => {
    const hexInput = '48 65 6c 6c 6f';
    const res = encodePayload(hexInput, 'raw');
    assert.equal(res.isValid, true);
    assert.deepEqual(res.bytes, [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  test('encodes compact hex string in raw mode', () => {
    const hexInput = '48656c6c6f';
    const res = encodePayload(hexInput, 'raw');
    assert.equal(res.isValid, true);
    assert.deepEqual(res.bytes, [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  test('falls back to utf-8 text for arbitrary string in raw mode if not valid hex', () => {
    const textInput = 'Just arbitrary raw text';
    const res = encodePayload(textInput, 'raw');
    assert.equal(res.isValid, true);
    assert.deepEqual(res.bytes, Array.from(Buffer.from(textInput, 'utf-8')));
  });
});

describe('detectEncoding', () => {
  test('detects json payload', () => {
    const jsonBytes = Array.from(Buffer.from('{"hello": "world"}'));
    assert.equal(detectEncoding(jsonBytes), 'json');
  });

  test('detects cbor payload', () => {
    const cborBytes = Array.from(cbor.encode({ a: 1, b: 'two' }));
    assert.equal(detectEncoding(cborBytes), 'cbor');
  });

  test('detects text payload', () => {
    const textBytes = Array.from(Buffer.from('Simple status text: OK'));
    assert.equal(detectEncoding(textBytes), 'text');
  });

  test('detects binary/raw payload', () => {
    const binBytes = [0x00, 0xff, 0xfe, 0x01, 0x02, 0x88];
    assert.equal(detectEncoding(binBytes), 'raw');
  });
});

describe('matchesKeyExpr', () => {
  test('matches exact key expressions', () => {
    assert.equal(matchesKeyExpr('demo/a', 'demo/a'), true);
    assert.equal(matchesKeyExpr('demo/a', 'demo/b'), false);
    assert.equal(matchesKeyExpr('demo/test', 'demo/testing'), false);
  });

  test('matches double wildcard (**) recursively', () => {
    assert.equal(matchesKeyExpr('demo/**', 'demo/a'), true);
    assert.equal(matchesKeyExpr('demo/**', 'demo/a/b/c'), true);
    assert.equal(matchesKeyExpr('demo/**', 'demo'), true);
    assert.equal(matchesKeyExpr('demo/**', 'sensor/temp'), false);
  });

  test('matches double wildcard (**) in middle of pattern', () => {
    assert.equal(matchesKeyExpr('sensors/**/temperature', 'sensors/floor1/room2/temperature'), true);
    assert.equal(matchesKeyExpr('sensors/**/temperature', 'sensors/temperature'), true);
    assert.equal(matchesKeyExpr('sensors/**/temperature', 'sensors/floor1/room2/humidity'), false);
  });

  test('matches single wildcard (*)', () => {
    assert.equal(matchesKeyExpr('sensor/*', 'sensor/temp'), true);
    assert.equal(matchesKeyExpr('sensor/*', 'sensor/humidity'), true);
    assert.equal(matchesKeyExpr('sensor/*', 'sensor/room1/temp'), false);
    assert.equal(matchesKeyExpr('sensor/*', 'demo/a'), false);
    assert.equal(matchesKeyExpr('sensor/*/temp', 'sensor/living_room/temp'), true);
    assert.equal(matchesKeyExpr('sensor/*/temp', 'sensor/floor1/living_room/temp'), false);
  });

  test('handles global wildcards', () => {
    assert.equal(matchesKeyExpr('**', 'any/topic/key'), true);
    assert.equal(matchesKeyExpr('*', 'single_segment'), true);
    assert.equal(matchesKeyExpr('*', 'any/topic/key'), false);
    assert.equal(matchesKeyExpr('*/*', 'demo/a'), true);
    assert.equal(matchesKeyExpr('*/*', 'demo/a/b'), false);
    assert.equal(matchesKeyExpr('', 'any/topic'), false);
  });
});

describe('normalizeEncoding', () => {
  test('maps MIME and Zenoh encoding names to recognized types', () => {
    assert.equal(normalizeEncoding('application/json'), 'json');
    assert.equal(normalizeEncoding('json'), 'json');
    assert.equal(normalizeEncoding('application/cbor'), 'cbor');
    assert.equal(normalizeEncoding('cbor'), 'cbor');
    assert.equal(normalizeEncoding('text/plain'), 'text');
    assert.equal(normalizeEncoding('text'), 'text');
    assert.equal(normalizeEncoding('hex'), 'raw');
  });

  test('auto-detects encoding for zenoh/bytes and raw when payload contains JSON', () => {
    const jsonBytes = Array.from(Buffer.from('{"temperature": 23.5, "unit": "C"}'));
    assert.equal(normalizeEncoding('zenoh/bytes', jsonBytes), 'json');
    assert.equal(normalizeEncoding('raw', jsonBytes), 'json');
    assert.equal(normalizeEncoding('', jsonBytes), 'json');
    assert.equal(normalizeEncoding(null, jsonBytes), 'json');
  });

  test('falls back to raw for binary payload with zenoh/bytes', () => {
    const binBytes = [0x00, 0xff, 0xfe, 0x01];
    assert.equal(normalizeEncoding('zenoh/bytes', binBytes), 'raw');
  });
});

describe('findMatchingSubscription & getTopicColorTag', () => {
  const subscriptions = [
    {
      id: 'sub-wildcard',
      profileId: 'p1',
      keyExpr: 'demo/**',
      colorTag: '#3b82f6', // Blue
    },
    {
      id: 'sub-prefix',
      profileId: 'p1',
      keyExpr: 'demo/sensor/*',
      colorTag: '#10b981', // Green
    },
    {
      id: 'sub-exact',
      profileId: 'p1',
      keyExpr: 'demo/sensor/temperature',
      colorTag: '#ef4444', // Red
    },
    {
      id: 'sub-other-profile',
      profileId: 'p2',
      keyExpr: 'demo/**',
      colorTag: '#eab308', // Yellow
    },
  ];

  test('prioritizes exact match over prefix and double wildcard', () => {
    const matched = findMatchingSubscription(subscriptions, 'demo/sensor/temperature', 'p1');
    assert.ok(matched);
    assert.equal(matched.id, 'sub-exact');
    assert.equal(matched.colorTag, '#ef4444');

    const colorRes = getTopicColorTag(subscriptions, 'demo/sensor/temperature', 'incoming', 'p1');
    assert.equal(colorRes.color, '#ef4444');
    assert.equal(colorRes.matchedSub?.id, 'sub-exact');
  });

  test('prioritizes single wildcard over recursive double wildcard', () => {
    const matched = findMatchingSubscription(subscriptions, 'demo/sensor/humidity', 'p1');
    assert.ok(matched);
    assert.equal(matched.id, 'sub-prefix');
    assert.equal(matched.colorTag, '#10b981');

    const colorRes = getTopicColorTag(subscriptions, 'demo/sensor/humidity', 'incoming', 'p1');
    assert.equal(colorRes.color, '#10b981');
  });

  test('falls back to double wildcard when no more specific match exists', () => {
    const matched = findMatchingSubscription(subscriptions, 'demo/telemetry/cpu', 'p1');
    assert.ok(matched);
    assert.equal(matched.id, 'sub-wildcard');
    assert.equal(matched.colorTag, '#3b82f6');
  });

  test('respects profileId scoping', () => {
    const matchedP2 = findMatchingSubscription(subscriptions, 'demo/anything', 'p2');
    assert.ok(matchedP2);
    assert.equal(matchedP2.id, 'sub-other-profile');
    assert.equal(matchedP2.colorTag, '#eab308');
  });

  test('uses fallback colors when no subscription matches', () => {
    const inRes = getTopicColorTag(subscriptions, 'other/unmatched/topic', 'incoming', 'p1');
    assert.equal(inRes.color, '#0284c7');
    assert.equal(inRes.matchedSub, undefined);

    const outRes = getTopicColorTag(subscriptions, 'other/unmatched/topic', 'outgoing', 'p1');
    assert.equal(outRes.color, '#8b5cf6');
    assert.equal(outRes.matchedSub, undefined);
  });
});

describe('formatTimeWithMs & formatFullDateTime', () => {
  test('formatTimeWithMs formats time correctly', () => {
    const date = new Date(2026, 7, 23, 14, 30, 45, 123); // August 23, 2026
    const res = formatTimeWithMs(date.getTime());
    assert.equal(res, '14:30:45.123');
  });

  test('formatFullDateTime formats year/month/day and time correctly', () => {
    const date = new Date(2026, 7, 23, 14, 30, 45, 123); // Month 7 is August (0-indexed)
    const res = formatFullDateTime(date.getTime());
    assert.equal(res, '2026/08/23 14:30:45.123');
  });
});

describe('updateRecentKeys & Storage', () => {
  test('prepends new key and deduplicates', () => {
    const initial = ['demo/a', 'sensor/temp'];
    const updated = updateRecentKeys(initial, 'cmd/robot');
    assert.deepEqual(updated, ['cmd/robot', 'demo/a', 'sensor/temp']);

    // Re-adding existing key moves it to front
    const reAdded = updateRecentKeys(updated, 'demo/a');
    assert.deepEqual(reAdded, ['demo/a', 'cmd/robot', 'sensor/temp']);
  });

  test('caps recent keys to maxItems (default 5)', () => {
    let list: string[] = [];
    list = updateRecentKeys(list, 'key/1');
    list = updateRecentKeys(list, 'key/2');
    list = updateRecentKeys(list, 'key/3');
    list = updateRecentKeys(list, 'key/4');
    list = updateRecentKeys(list, 'key/5');
    assert.equal(list.length, 5);
    assert.deepEqual(list, ['key/5', 'key/4', 'key/3', 'key/2', 'key/1']);

    // Adding 6th key drops the oldest
    list = updateRecentKeys(list, 'key/6');
    assert.equal(list.length, 5);
    assert.deepEqual(list, ['key/6', 'key/5', 'key/4', 'key/3', 'key/2']);
  });

  test('ignores empty and whitespace-only keys', () => {
    const initial = ['demo/a'];
    assert.deepEqual(updateRecentKeys(initial, ''), ['demo/a']);
    assert.deepEqual(updateRecentKeys(initial, '   '), ['demo/a']);
  });

  test('trims whitespace on new keys', () => {
    const initial = ['demo/a'];
    const res = updateRecentKeys(initial, '  sensor/humidity  ');
    assert.deepEqual(res, ['sensor/humidity', 'demo/a']);
  });

  test('loadRecentKeys and saveRecentKeys interact with localStorage safely', () => {
    // Mock localStorage
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
      length: 0,
      key: () => null,
    };

    // @ts-expect-error Mocking localStorage
    globalThis.localStorage = mockStorage;

    // Save and load
    saveRecentKeys(['topic/1', 'topic/2']);
    assert.deepEqual(loadRecentKeys(), ['topic/1', 'topic/2']);

    // Load with corrupted data
    mockStorage.setItem('zenohx_recent_publish_keys', 'invalid-json');
    assert.deepEqual(loadRecentKeys(), []);

    // Load with non-array json
    mockStorage.setItem('zenohx_recent_publish_keys', JSON.stringify({ not: 'array' }));
    assert.deepEqual(loadRecentKeys(), []);

    // Load with mixed array types (filters non-strings and empty strings)
    mockStorage.setItem(
      'zenohx_recent_publish_keys',
      JSON.stringify(['valid/1', 123, '', '   ', null, 'valid/2'])
    );
    assert.deepEqual(loadRecentKeys(), ['valid/1', 'valid/2']);
  });
});

describe('formatJsCode', () => {
  test('formats unindented JavaScript code with 2-space indentation', () => {
    const unformatted = `const a = 1;
function calculate(query) {
const result = Number(query.params.a) + Number(query.params.b);
return {
sum: result,
status: "ok"
};
}`;

    const expected = `const a = 1;
function calculate(query) {
  const result = Number(query.params.a) + Number(query.params.b);
  return {
    sum: result,
    status: "ok"
  };
}`;

    assert.equal(formatJsCode(unformatted), expected);
  });

  test('handles empty or blank code gracefully', () => {
    assert.equal(formatJsCode(''), '');
    assert.equal(formatJsCode('   \n  \n'), '');
  });

  test('preserves string contents and comments during formatting', () => {
    const code = `// Process calculation
const msg = "hello { world }";
if (query.params.test) {
return { msg: msg };
}`;

    const formatted = formatJsCode(code);
    assert.ok(formatted.includes('  return { msg: msg };'));
  });
});

describe('Protobuf integration in formatters', () => {
  const sensorProto = `
    syntax = "proto3";
    package iot.sensor;

    message SensorData {
      string sensor_id = 1;
      double temperature = 2;
      double humidity = 3;
      bool active = 4;
    }
  `;

  test('encodePayload encodes JSON string to Protobuf bytes with explicit protoTypeName', () => {
    useProtoStore.getState().clearAll();
    const res = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(res.success, true);

    const jsonStr = JSON.stringify({
      sensor_id: 'temp-100',
      temperature: 28.5,
      humidity: 60.2,
      active: true,
    });

    const encoded = encodePayload(jsonStr, 'protobuf', {
      protoTypeName: 'iot.sensor.SensorData',
    });

    assert.equal(encoded.isValid, true);
    assert.ok(encoded.bytes.length > 0);

    // Format back using tryFormatProtobuf
    const decoded = tryFormatProtobuf(encoded.bytes, {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.equal(decoded.success, true);
    assert.equal((decoded.data as any).sensor_id, 'temp-100');
    assert.equal((decoded.data as any).temperature, 28.5);
  });

  test('encodePayload auto-resolves protoTypeName from topic mapping via keyExpr', () => {
    useProtoStore.getState().clearAll();
    const schemaRes = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(schemaRes.success, true);
    useProtoStore.getState().addMapping('demo/iot/**', schemaRes.id!, 'iot.sensor.SensorData');

    const jsonStr = JSON.stringify({
      sensor_id: 'temp-200',
      temperature: 19.8,
      humidity: 55.0,
      active: false,
    });

    const encoded = encodePayload(jsonStr, 'protobuf', {
      keyExpr: 'demo/iot/sensors/1',
    });

    assert.equal(encoded.isValid, true);
    assert.ok(encoded.bytes.length > 0);

    // Decodes using formatPayload with keyExpr option
    const formatted = formatPayload(encoded.bytes, 'protobuf', 2, {
      keyExpr: 'demo/iot/sensors/1',
    });
    assert.ok(formatted.includes('"sensor_id": "temp-200"'));
    assert.ok(formatted.includes('"temperature": 19.8'));
  });

  test('encodePayload returns error when invalid JSON or missing proto type', () => {
    useProtoStore.getState().clearAll();
    const schemaRes = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(schemaRes.success, true);

    // Invalid JSON
    const invalidJsonRes = encodePayload('{invalid json', 'protobuf', {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.equal(invalidJsonRes.isValid, false);
    assert.ok(invalidJsonRes.error);

    // Missing protoTypeName and no mapping
    const missingTypeRes = encodePayload('{"sensor_id":"test"}', 'protobuf', {
      keyExpr: 'unmapped/key',
    });
    assert.equal(missingTypeRes.isValid, false);
    assert.ok(missingTypeRes.error?.includes('message type'));

    // Nonexistent type name
    const nonexistentTypeRes = encodePayload('{"sensor_id":"test"}', 'protobuf', {
      protoTypeName: 'iot.sensor.NonExistentType',
    });
    assert.equal(nonexistentTypeRes.isValid, false);
    assert.ok(nonexistentTypeRes.error);
  });

  test('tryFormatProtobuf decodes valid binary payload and handles invalid bytes gracefully', () => {
    useProtoStore.getState().clearAll();
    const schemaRes = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(schemaRes.success, true);

    const jsonStr = JSON.stringify({
      sensor_id: 'temp-300',
      temperature: 31.2,
      humidity: 45.0,
      active: true,
    });

    const encoded = encodePayload(jsonStr, 'protobuf', {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.equal(encoded.isValid, true);

    // Success case
    const successRes = tryFormatProtobuf(encoded.bytes, {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.equal(successRes.success, true);
    assert.equal((successRes.data as any).sensor_id, 'temp-300');

    // Missing type error
    const noTypeRes = tryFormatProtobuf(encoded.bytes);
    assert.equal(noTypeRes.success, false);
    assert.ok(noTypeRes.error);

    // Corrupted bytes error
    const corruptedRes = tryFormatProtobuf([0xff, 0xff, 0xff, 0xff], {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.equal(corruptedRes.success, false);
    assert.ok(corruptedRes.error);
  });

  test('formatPayload with protobuf encoding falls back to hex dump when decoding fails', () => {
    useProtoStore.getState().clearAll();
    const corruptedBytes = [0xde, 0xad, 0xbe, 0xef];
    const formatted = formatPayload(corruptedBytes, 'protobuf', 2, {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.ok(formatted.includes('de ad be ef'));
  });

  test('detectEncoding and normalizeEncoding support protobuf', () => {
    useProtoStore.getState().clearAll();
    const schemaRes = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(schemaRes.success, true);
    useProtoStore.getState().addMapping('telemetry/**', schemaRes.id!, 'iot.sensor.SensorData');

    assert.equal(normalizeEncoding('protobuf'), 'protobuf');
    assert.equal(normalizeEncoding('application/protobuf'), 'protobuf');
    assert.equal(normalizeEncoding('proto'), 'protobuf');
    assert.equal(normalizeEncoding('application/x-protobuf'), 'protobuf');

    // Auto-detects protobuf if mapped keyExpr is provided
    assert.equal(normalizeEncoding('zenoh/bytes', [0x01, 0x02], 'telemetry/sensors/1'), 'protobuf');
    assert.equal(normalizeEncoding(undefined, [0x01, 0x02], 'telemetry/sensors/1'), 'protobuf');
    assert.equal(detectEncoding([0x01, 0x02], { keyExpr: 'telemetry/sensors/1' }), 'protobuf');
  });

  test('getPayloadSnippet creates compact preview for protobuf payloads', () => {
    useProtoStore.getState().clearAll();
    const schemaRes = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(schemaRes.success, true);

    const jsonStr = JSON.stringify({
      sensor_id: 'temp-400',
      temperature: 22.0,
      humidity: 50.0,
      active: true,
    });

    const encoded = encodePayload(jsonStr, 'protobuf', {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.equal(encoded.isValid, true);

    const snippet = getPayloadSnippet(encoded.bytes, 'protobuf', 120, {
      protoTypeName: 'iot.sensor.SensorData',
    });
    assert.ok(snippet.includes('temp-400'));
    assert.ok(snippet.includes('22'));
  });
});





