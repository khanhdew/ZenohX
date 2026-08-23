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

import { useMessageStore } from '../../src/stores/messageStore';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { formatTimeWithMs, getPayloadSnippet, encodePayload } from '../../src/lib/formatters';
import type { MessageItem } from '../../src/types/zenoh';

describe('Pub/Sub Workspace Helpers & Formatters', () => {
  test('formatTimeWithMs formats timestamps correctly', () => {
    const fixedTime = new Date('2026-08-23T14:30:15.789Z').getTime();
    const formatted = formatTimeWithMs(fixedTime);
    assert.match(formatted, /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.ok(formatted.endsWith('789'));
  });

  test('getPayloadSnippet handles empty and various encoding payloads', () => {
    // Empty payload
    assert.equal(getPayloadSnippet([]), '(empty payload)');

    // JSON payload
    const jsonBytes = Array.from(Buffer.from('{"temp": 24.5, "humidity": 60}'));
    const jsonSnippet = getPayloadSnippet(jsonBytes, 'json');
    assert.ok(jsonSnippet.includes('"temp":24.5'));

    // Text payload
    const textBytes = Array.from(Buffer.from('Hello Zenoh Network'));
    const textSnippet = getPayloadSnippet(textBytes, 'text');
    assert.equal(textSnippet, 'Hello Zenoh Network');

    // Binary / Hex fallback
    const rawBytes = [0x48, 0x65, 0x6c, 0x6c, 0x6f];
    const rawSnippet = getPayloadSnippet(rawBytes, 'raw');
    assert.equal(rawSnippet, '48 65 6c 6c 6f');
  });
});

describe('Pub/Sub Workspace Store Integration', () => {
  beforeEach(() => {
    useMessageStore.getState().cleanupListener();
    useMessageStore.setState({
      subscriptions: [],
      messages: [],
      maxMessages: 2000,
      activeFilterKey: '',
      searchQuery: '',
      selectedMessage: null,
      isListening: false,
      unlistenFn: null,
      error: null,
    });
  });

  test('subscription workflow with color tags and active state toggling', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'subscribe' || cmd === 'unsubscribe') return undefined;
      if (cmd === 'plugin:event|listen') return 1;
      return undefined;
    };

    // 1. Subscribe to demo/**
    const sub1 = await useMessageStore.getState().subscribe('sess-100', 'demo/**', 'json', '#3b82f6');
    assert.ok(sub1);
    assert.equal(useMessageStore.getState().subscriptions.length, 1);
    assert.equal(useMessageStore.getState().subscriptions[0].keyExpr, 'demo/**');
    assert.equal(useMessageStore.getState().subscriptions[0].colorTag, '#3b82f6');
    assert.equal(useMessageStore.getState().subscriptions[0].active, true);

    // 2. Subscribe to sensor/*
    const sub2 = await useMessageStore.getState().subscribe('sess-100', 'sensor/*', 'text', '#10b981');
    assert.ok(sub2);
    assert.equal(useMessageStore.getState().subscriptions.length, 2);

    // 3. Toggle subscription pause/resume
    await useMessageStore.getState().toggleSubscription('sess-100', sub1);
    assert.equal(useMessageStore.getState().subscriptions.find((s) => s.id === sub1)?.active, false);

    await useMessageStore.getState().toggleSubscription('sess-100', sub1);
    assert.equal(useMessageStore.getState().subscriptions.find((s) => s.id === sub1)?.active, true);

    // 4. Unsubscribe
    await useMessageStore.getState().unsubscribe('sess-100', sub2);
    assert.equal(useMessageStore.getState().subscriptions.length, 1);
  });

  test('publishing sample produces outgoing message item', async () => {
    let publishedCmd: string | null = null;
    let publishedPayload: number[] = [];

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'publish_sample') {
        publishedCmd = cmd;
        publishedPayload = args?.payload as number[];
        return undefined;
      }
      return undefined;
    };

    const encoded = encodePayload('{"status": "ok"}', 'json');
    assert.equal(encoded.isValid, true);

    await useMessageStore.getState().publish('sess-100', 'status/node1', encoded.bytes, 'json', 'put');

    assert.equal(publishedCmd, 'publish_sample');
    assert.ok(publishedPayload.length > 0);

    const msgs = useMessageStore.getState().messages;
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].direction, 'outgoing');
    assert.equal(msgs[0].keyExpr, 'status/node1');
    assert.equal(msgs[0].kind, 'put');
  });

  test('message feed filtering and selection', () => {
    const msg1: MessageItem = {
      id: 'm-1',
      sessionId: 'sess-1',
      direction: 'incoming',
      keyExpr: 'demo/telemetry/temp',
      payload: Array.from(Buffer.from('{"temperature": 23.8}')),
      encoding: 'json',
      kind: 'put',
      timestamp: 1000,
    };

    const msg2: MessageItem = {
      id: 'm-2',
      sessionId: 'sess-1',
      direction: 'outgoing',
      keyExpr: 'demo/control/fan',
      payload: Array.from(Buffer.from('{"speed": 100}')),
      encoding: 'json',
      kind: 'put',
      timestamp: 1001,
    };

    const msg3: MessageItem = {
      id: 'm-3',
      sessionId: 'sess-2',
      direction: 'incoming',
      keyExpr: 'camera/frame/1',
      payload: [0xff, 0xd8, 0xff],
      encoding: 'raw',
      kind: 'put',
      timestamp: 1002,
    };

    useMessageStore.getState().addMessage(msg1);
    useMessageStore.getState().addMessage(msg2);
    useMessageStore.getState().addMessage(msg3);

    // 1. Filter by session
    const sess1Msgs = useMessageStore.getState().getFilteredMessages('sess-1');
    assert.equal(sess1Msgs.length, 2);

    // 2. Filter by key expression prefix
    useMessageStore.getState().setActiveFilterKey('demo/telemetry/**');
    const filteredByKey = useMessageStore.getState().getFilteredMessages('sess-1');
    assert.equal(filteredByKey.length, 1);
    assert.equal(filteredByKey[0].id, 'm-1');

    // 3. Search query filter
    useMessageStore.getState().setActiveFilterKey('');
    useMessageStore.getState().setSearchQuery('speed');
    const searchResults = useMessageStore.getState().getFilteredMessages('sess-1');
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, 'm-2');

    // 4. Message Selection
    useMessageStore.getState().selectMessage(msg1);
    assert.equal(useMessageStore.getState().selectedMessage?.id, 'm-1');

    useMessageStore.getState().selectMessage(null);
    assert.equal(useMessageStore.getState().selectedMessage, null);
  });

  test('PublishBar component is exported and defined', async () => {
    const { PublishBar } = await import('../../src/components/pubsub/PublishBar');
    assert.equal(typeof PublishBar, 'function');
  });
});
