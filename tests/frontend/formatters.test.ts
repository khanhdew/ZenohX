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
  bytesToUint8Array,
} from '../../src/lib/formatters';
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
