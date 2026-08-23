import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQueryParameters,
  parseInboundPayload,
  executeInboundScript,
  encodeResultValue,
  SCRIPT_TEMPLATES,
} from '../../src/lib/scriptRunner';

describe('Script Runner Parameter & Payload Parsing', () => {
  test('parseQueryParameters parses standard query strings', () => {
    assert.deepEqual(parseQueryParameters(''), {});
    assert.deepEqual(parseQueryParameters('?op=add&a=10&b=20'), { op: 'add', a: '10', b: '20' });
    assert.deepEqual(parseQueryParameters('op=mul&name=hello%20world'), {
      op: 'mul',
      name: 'hello world',
    });
    assert.deepEqual(parseQueryParameters('flag&key=val'), { flag: '', key: 'val' });
  });

  test('parseInboundPayload parses JSON, text, and empty bytes', () => {
    assert.equal(parseInboundPayload([]), null);
    assert.equal(parseInboundPayload(undefined), null);

    const jsonBytes = Array.from(Buffer.from('{"status":"ok","value":42}'));
    assert.deepEqual(parseInboundPayload(jsonBytes), { status: 'ok', value: 42 });

    const textBytes = Array.from(Buffer.from('Plain text string'));
    assert.equal(parseInboundPayload(textBytes), 'Plain text string');
  });

  test('encodeResultValue encodes objects, primitives, and bytes', () => {
    // Number array
    const byteRes = encodeResultValue([1, 2, 3]);
    assert.deepEqual(byteRes.bytes, [1, 2, 3]);

    // Object -> JSON
    const objRes = encodeResultValue({ test: 123 }, 'json');
    assert.ok(objRes.bytes.length > 0);
    const decoded = JSON.parse(Buffer.from(objRes.bytes).toString('utf-8'));
    assert.deepEqual(decoded, { test: 123 });

    // String
    const strRes = encodeResultValue('Hello', 'text');
    assert.equal(Buffer.from(strRes.bytes).toString('utf-8'), 'Hello');
  });
});

describe('executeInboundScript Execution', () => {
  test('executes calculator script with URL query parameters', async () => {
    const calcScript = `
      const a = Number(query.params.a || 0);
      const b = Number(query.params.b || 0);
      const op = query.params.op || 'add';
      return { result: op === 'add' ? a + b : a * b, op };
    `;

    const res = await executeInboundScript(calcScript, {
      key_expr: 'rpc/calc',
      parameters: 'op=add&a=15&b=25',
    });

    assert.equal(res.success, true);
    assert.equal(res.encoding, 'json');
    assert.equal(res.keyExpr, 'rpc/calc');

    const decoded = JSON.parse(Buffer.from(res.bytes).toString('utf-8'));
    assert.equal(decoded.result, 40);
    assert.equal(decoded.op, 'add');
  });

  test('executes asynchronous script with Promise/delay', async () => {
    const asyncScript = `
      await new Promise(r => setTimeout(r, 10));
      return { async_done: true, processed_topic: query.keyExpr };
    `;

    const res = await executeInboundScript(asyncScript, {
      key_expr: 'demo/async/sensor',
    });

    assert.equal(res.success, true);
    const decoded = JSON.parse(Buffer.from(res.bytes).toString('utf-8'));
    assert.equal(decoded.async_done, true);
    assert.equal(decoded.processed_topic, 'demo/async/sensor');
  });

  test('supports explicit response object with custom encoding and keyExpr', async () => {
    const customScript = `
      return {
        keyExpr: 'custom/reply/key',
        encoding: 'text',
        payload: 'Custom Text Response OK'
      };
    `;

    const res = await executeInboundScript(customScript, {
      key_expr: 'original/key',
    });

    assert.equal(res.success, true);
    assert.equal(res.keyExpr, 'custom/reply/key');
    assert.equal(res.encoding, 'text');
    assert.equal(Buffer.from(res.bytes).toString('utf-8'), 'Custom Text Response OK');
  });

  test('gracefully captures syntax and runtime errors', async () => {
    const brokenScript = `
      const obj = undefined;
      return obj.nonExistentProperty.fail();
    `;

    const res = await executeInboundScript(brokenScript, {
      key_expr: 'demo/test',
    });

    assert.equal(res.success, false);
    assert.ok(res.error);
    assert.ok(res.error.includes('Cannot read properties of undefined') || res.error.includes('undefined'));

    const decoded = JSON.parse(Buffer.from(res.bytes).toString('utf-8'));
    assert.equal(decoded.error, 'Script execution failed');
  });

  test('handles execution timeout guard', async () => {
    const hangingScript = `
      await new Promise(r => setTimeout(r, 500));
      return { done: true };
    `;

    const res = await executeInboundScript(
      hangingScript,
      { key_expr: 'demo/hang' },
      'json',
      50 // 50ms timeout
    );

    assert.equal(res.success, false);
    assert.ok(res.error?.includes('timed out'));
  });

  test('built-in script templates execute without syntax errors', async () => {
    for (const template of SCRIPT_TEMPLATES) {
      const res = await executeInboundScript(template.code, {
        key_expr: 'demo/test',
        parameters: template.sampleQuery,
      });
      assert.equal(res.success, true, `Template "${template.name}" failed: ${res.error}`);
    }
  });
});
