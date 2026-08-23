import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock window and Tauri internals
let mockInvokeHandler: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> = async () => undefined;

// @ts-expect-error Mocking global window
globalThis.window = globalThis;
// @ts-expect-error Mocking tauri internals
globalThis.window.__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    return mockInvokeHandler(cmd, args);
  },
  transformCallback: (cb: unknown) => cb,
};
// @ts-expect-error Mocking tauri event plugin internals
globalThis.window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: () => {},
};

import { useQueryStore } from '../../src/stores/queryStore';
import { formatByteSize, formatTimeWithMs, getPayloadSnippet } from '../../src/lib/formatters';
import type { ReplySample, InboundQuery, QueryTarget } from '../../src/types/zenoh';

describe('Query / RPC Helpers & Formatting', () => {
  test('formatByteSize formats query response sizes correctly', () => {
    assert.equal(formatByteSize(0), '0 B');
    assert.equal(formatByteSize(512), '512 B');
    assert.equal(formatByteSize(2048), '2.00 KB');
  });

  test('formatTimeWithMs formats query execution timestamps', () => {
    const fixedTime = new Date('2026-08-23T10:15:30.123Z').getTime();
    const formatted = formatTimeWithMs(fixedTime);
    assert.match(formatted, /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.ok(formatted.endsWith('123'));
  });

  test('getPayloadSnippet extracts compact preview from reply payload', () => {
    const bytes = Array.from(Buffer.from('{"status": "ok", "value": 42}'));
    const snippet = getPayloadSnippet(bytes, 'json');
    assert.ok(snippet.includes('"status":"ok"'));
  });
});

describe('Query / RPC Store Operations & Reply Timeline Data', () => {
  beforeEach(() => {
    useQueryStore.getState().cleanupListener();
    useQueryStore.setState({
      activeQueryables: [],
      inboundQueries: [],
      executions: [],
      activeExecutionId: null,
      isListening: false,
      unlistenFn: null,
      error: null,
    });
  });

  test('running a query creates execution record and captures multi-node replies with latency', async () => {
    const mockReplies: ReplySample[] = [
      {
        session_id: 'sess-100',
        key_expr: 'demo/sensor/temp',
        payload: Array.from(Buffer.from('{"temperature": 24.5}')),
        encoding: 'json',
        replier_id: 'zid-node-01',
        latency_ms: 12,
        timestamp: Date.now(),
        is_err: false,
      },
      {
        session_id: 'sess-100',
        key_expr: 'demo/sensor/humidity',
        payload: Array.from(Buffer.from('{"humidity": 55.0}')),
        encoding: 'json',
        replier_id: 'zid-node-02',
        latency_ms: 45,
        timestamp: Date.now() + 10,
        is_err: false,
      },
      {
        session_id: 'sess-100',
        key_expr: 'demo/sensor/fault',
        payload: [],
        encoding: 'text',
        replier_id: 'zid-node-03',
        latency_ms: 120,
        timestamp: Date.now() + 20,
        is_err: true,
        error_message: 'Sensor hardware fault',
      },
    ];

    let querySelector = '';
    let queryTarget = '';
    let queryTimeout = 0;

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'query_get') {
        querySelector = args?.selector as string;
        queryTarget = args?.target as string;
        queryTimeout = args?.timeoutMs as number;
        return mockReplies;
      }
      return undefined;
    };

    const replies = await useQueryStore
      .getState()
      .runQuery('sess-100', 'demo/sensor?limit=5', 'complete', 3000, 'prof-1');

    assert.equal(querySelector, 'demo/sensor?limit=5');
    assert.equal(queryTarget, 'complete');
    assert.equal(queryTimeout, 3000);
    assert.equal(replies.length, 3);

    // Verify executions list in store
    const executions = useQueryStore.getState().executions;
    assert.equal(executions.length, 1);
    assert.equal(executions[0].selector, 'demo/sensor?limit=5');
    assert.equal(executions[0].status, 'completed');
    assert.equal(executions[0].replies.length, 3);
    assert.equal(useQueryStore.getState().activeExecutionId, executions[0].id);

    // Verify active execution getter
    const active = useQueryStore.getState().getActiveExecution();
    assert.ok(active);
    assert.equal(active?.id, executions[0].id);
    assert.equal(active?.replies.length, 3);
  });

  test('declaring and managing queryables with auto-reply and config updates', async () => {
    let declaredKey = '';
    let undeclaredId = '';

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'declare_queryable') {
        declaredKey = args?.keyExpr as string;
        return undefined;
      }
      if (cmd === 'undeclare_queryable') {
        undeclaredId = args?.queryableId as string;
        return undefined;
      }
      if (cmd === 'plugin:event|listen') {
        return 1;
      }
      return undefined;
    };

    // 1. Declare queryable
    const qId = await useQueryStore.getState().declareQueryable(
      'sess-100',
      'rpc/calculator/**',
      true,
      JSON.stringify({ status: 'ok', result: 100 }),
      'json',
      'prof-1'
    );

    assert.ok(qId);
    assert.equal(declaredKey, 'rpc/calculator/**');
    assert.equal(useQueryStore.getState().activeQueryables.length, 1);
    assert.equal(useQueryStore.getState().activeQueryables[0].keyExpr, 'rpc/calculator/**');
    assert.equal(useQueryStore.getState().activeQueryables[0].autoReply, true);

    // 2. Update config
    useQueryStore.getState().updateQueryableConfig(qId, {
      autoReply: false,
      replyEncoding: 'text',
      replyPayload: 'Manual ack',
    });

    const updated = useQueryStore.getState().activeQueryables.find((q) => q.id === qId);
    assert.equal(updated?.autoReply, false);
    assert.equal(updated?.replyEncoding, 'text');
    assert.equal(updated?.replyPayload, 'Manual ack');

    // 3. Undeclare queryable
    await useQueryStore.getState().undeclareQueryable('sess-100', qId);
    assert.equal(undeclaredId, qId);
    assert.equal(useQueryStore.getState().activeQueryables.length, 0);
  });

  test('inbound queries manual reply workflow and clearing', async () => {
    let replyToken = '';
    let replyKey = '';
    let replyPayloadBytes: number[] = [];

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'reply_query') {
        replyToken = args?.token as string;
        replyKey = args?.keyExpr as string;
        replyPayloadBytes = args?.payload as number[];
        return undefined;
      }
      return undefined;
    };

    // Seed inbound queries
    const inbound1: InboundQuery = {
      token: 'tok-abc-123',
      session_id: 'sess-100',
      queryable_id: 'q-1',
      key_expr: 'rpc/calculator/add',
      parameters: 'a=10&b=20',
      payload: Array.from(Buffer.from('{"req_id": 1}')),
      encoding: 'json',
      timestamp: Date.now(),
    };

    const inbound2: InboundQuery = {
      token: 'tok-xyz-789',
      session_id: 'sess-100',
      queryable_id: 'q-1',
      key_expr: 'rpc/calculator/sub',
      parameters: 'a=50&b=20',
      payload: null,
      encoding: null,
      timestamp: Date.now() + 100,
    };

    useQueryStore.setState({
      inboundQueries: [inbound1, inbound2],
    });

    assert.equal(useQueryStore.getState().inboundQueries.length, 2);

    // Reply to inbound1
    const replyBytes = Array.from(Buffer.from('{"result": 30}'));
    await useQueryStore
      .getState()
      .replyInboundQuery(inbound1.token, inbound1.key_expr, replyBytes, 'json');

    assert.equal(replyToken, 'tok-abc-123');
    assert.equal(replyKey, 'rpc/calculator/add');
    assert.deepEqual(replyPayloadBytes, replyBytes);

    // inbound1 removed, inbound2 remaining
    assert.equal(useQueryStore.getState().inboundQueries.length, 1);
    assert.equal(useQueryStore.getState().inboundQueries[0].token, 'tok-xyz-789');

    // Clear inbound queries
    useQueryStore.getState().clearInboundQueries('sess-100');
    assert.equal(useQueryStore.getState().inboundQueries.length, 0);
  });

  test('execution selection and session filtering', async () => {
    useQueryStore.setState({
      executions: [
        {
          id: 'exec-1',
          sessionId: 'sess-1',
          selector: 'demo/**',
          target: 'all' as QueryTarget,
          timeoutMs: 2000,
          status: 'completed',
          replies: [],
          startedAt: 1000,
        },
        {
          id: 'exec-2',
          sessionId: 'sess-2',
          selector: 'sensor/temp',
          target: 'best_matching' as QueryTarget,
          timeoutMs: 1000,
          status: 'completed',
          replies: [],
          startedAt: 2000,
        },
      ],
      activeExecutionId: 'exec-1',
    });

    const sess1Execs = useQueryStore.getState().getExecutionsForSession('sess-1');
    assert.equal(sess1Execs.length, 1);
    assert.equal(sess1Execs[0].id, 'exec-1');

    useQueryStore.getState().selectExecution('exec-2');
    assert.equal(useQueryStore.getState().activeExecutionId, 'exec-2');

    await useQueryStore.getState().clearExecutions('sess-1');
    assert.equal(useQueryStore.getState().executions.length, 1);
    assert.equal(useQueryStore.getState().executions[0].id, 'exec-2');
  });

  test('declares queryable with JavaScript script mode and updates config', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'declare_queryable') return undefined;
      return undefined;
    };

    const calcScript = 'return { sum: Number(query.params.a) + Number(query.params.b) };';

    const qId = await useQueryStore.getState().declareQueryable(
      'sess-100',
      'rpc/calc/**',
      true,
      undefined,
      'json',
      'prof-1',
      'script',
      calcScript
    );

    assert.ok(qId);
    const q = useQueryStore.getState().activeQueryables.find((x) => x.id === qId);
    assert.equal(q?.replyMode, 'script');
    assert.equal(q?.scriptCode, calcScript);

    // Update script code
    useQueryStore.getState().updateQueryableConfig(qId, {
      scriptCode: 'return { product: Number(query.params.a) * Number(query.params.b) };',
    });

    const updated = useQueryStore.getState().activeQueryables.find((x) => x.id === qId);
    assert.equal(
      updated?.scriptCode,
      'return { product: Number(query.params.a) * Number(query.params.b) };'
    );
  });
});

