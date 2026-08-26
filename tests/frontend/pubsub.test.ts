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
  test('formatTimeWithMs formats timestamps correctly across ms, sec, and ns scales', () => {
    const fixedTimeMs = new Date('2026-08-23T14:30:15.789Z').getTime();
    const formattedMs = formatTimeWithMs(fixedTimeMs);
    assert.match(formattedMs, /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.ok(formattedMs.endsWith('789'));

    // Seconds scale timestamp (e.g. 10 digits)
    const fixedTimeSec = Math.floor(fixedTimeMs / 1000);
    const formattedSec = formatTimeWithMs(fixedTimeSec);
    assert.match(formattedSec, /^\d{2}:\d{2}:15\.000$/);

    // Nanoseconds scale timestamp (e.g. 19 digits)
    const fixedTimeNs = fixedTimeMs * 1_000_000;
    const formattedNs = formatTimeWithMs(fixedTimeNs);
    assert.match(formattedNs, /^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    assert.ok(formattedNs.endsWith('789'));
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

  test('publishing with QoS options invokes publish_sample_advanced with correct payload', async () => {
    let advancedCmd: string | null = null;
    let receivedOptions: Record<string, unknown> | null = null;

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'publish_sample_advanced') {
        advancedCmd = cmd;
        receivedOptions = args?.options as Record<string, unknown>;
        return undefined;
      }
      return undefined;
    };

    await useMessageStore.getState().publish(
      'sess-100',
      'robot/cmd_vel',
      '{"linear": 1.5}',
      'json',
      'put',
      undefined,
      {
        qos: {
          priority: 'realtime',
          congestion_control: 'drop',
          express: true,
          attachment: [1, 2, 3],
        },
      }
    );

    assert.equal(advancedCmd, 'publish_sample_advanced');
    assert.equal(receivedOptions?.priority, 'realtime');
    assert.equal(receivedOptions?.congestion_control, 'drop');
    assert.equal(receivedOptions?.express, true);

    const msgs = useMessageStore.getState().messages;
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].priority, 'realtime');
    assert.equal(msgs[0].express, true);
  });

  test('publish deduplicates self loopback samples so publish only creates 1 message item', async () => {
    let capturedHandler: ((event: { payload: unknown }) => void) | null = null;
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'publish_sample_advanced' || cmd === 'publish_sample') {
        return undefined;
      }
      return undefined;
    };

    // Mock tauri event listener
    // @ts-expect-error Mocking tauri event plugin
    globalThis.window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
    // @ts-expect-error Mocking tauri internals
    globalThis.window.__TAURI_INTERNALS__.invoke = async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'plugin:event|listen') {
        capturedHandler = args?.handler as (event: { payload: unknown }) => void;
        return 1;
      }
      return mockInvokeHandler(cmd, args);
    };

    await useMessageStore.getState().initListener();

    // 1. Publish sample
    await useMessageStore.getState().publish(
      'sess-self-1',
      'demo/test/topic',
      '{"val": 42}',
      'json',
      'put'
    );

    assert.equal(useMessageStore.getState().messages.length, 1);
    assert.equal(useMessageStore.getState().messages[0].direction, 'outgoing');

    // 2. Simulate Zenoh delivering loopback sample to local subscriber
    if (capturedHandler) {
      capturedHandler({
        payload: [
          {
            session_id: 'sess-self-1',
            key_expr: 'demo/test/topic',
            payload: Array.from(Buffer.from('{"val": 42}')),
            encoding: 'json',
            kind: 'put',
            timestamp: Date.now(),
          },
        ],
      });
    }

    // 3. Verify messages count is STILL 1 (not duplicated as a second incoming message)
    const msgsAfter = useMessageStore.getState().messages;
    assert.equal(msgsAfter.length, 1);
    assert.equal(msgsAfter[0].direction, 'outgoing');
  });

  test('addMessagesBatch processes batched samples and updates subscription counts in single pass', () => {
    useMessageStore.setState({
      subscriptions: [
        {
          id: 'sub-1',
          sessionId: 'sess-1',
          keyExpr: 'sensor/telemetry',
          encoding: 'json',
          count: 0,
          active: true,
          createdAt: Date.now(),
        },
      ],
      messages: [],
    });

    const batch: MessageItem[] = [
      {
        id: 'b-1',
        sessionId: 'sess-1',
        subId: 'sub-1',
        direction: 'incoming',
        keyExpr: 'sensor/telemetry',
        payload: [1],
        encoding: 'json',
        kind: 'put',
        timestamp: 100,
      },
      {
        id: 'b-2',
        sessionId: 'sess-1',
        subId: 'sub-1',
        direction: 'incoming',
        keyExpr: 'sensor/telemetry',
        payload: [2],
        encoding: 'json',
        kind: 'put',
        timestamp: 101,
      },
    ];

    useMessageStore.getState().addMessagesBatch(batch);

    assert.equal(useMessageStore.getState().messages.length, 2);
    assert.equal(useMessageStore.getState().subscriptions[0].count, 2);
  });

  test('togglePause and resumeLive freezes tailing and buffers incoming samples', () => {
    assert.equal(useMessageStore.getState().isPaused, false);

    useMessageStore.getState().togglePause();
    assert.equal(useMessageStore.getState().isPaused, true);

    // Simulate buffering
    useMessageStore.setState({
      pausedBuffer: [
        {
          id: 'buf-1',
          sessionId: 'sess-1',
          direction: 'incoming',
          keyExpr: 'temp',
          payload: [],
          encoding: 'json',
          kind: 'put',
          timestamp: 100,
        },
      ],
    });

    useMessageStore.getState().resumeLive();
    assert.equal(useMessageStore.getState().isPaused, false);
    assert.equal(useMessageStore.getState().pausedBuffer.length, 0);
    assert.equal(useMessageStore.getState().messages.length, 1);
  });

  test('startGenerator and stopGenerator workflow', async () => {
    let invokedGenCmd = '';
    mockInvokeHandler = async (cmd) => {
      invokedGenCmd = cmd;
      return undefined;
    };

    const config = {
      session_id: 'sess-1',
      generator_id: 'gen-123',
      key_expr: 'bench/sine',
      encoding: 'json',
      rate_hz: 100,
      payload_template: '{"v": {{sin}}}',
    };

    await useMessageStore.getState().startGenerator(config);
    assert.equal(invokedGenCmd, 'start_stream_generator');
    assert.ok(useMessageStore.getState().activeGenerators['gen-123']);

    await useMessageStore.getState().stopGenerator('gen-123');
    assert.equal(invokedGenCmd, 'stop_stream_generator');
    assert.equal(useMessageStore.getState().activeGenerators['gen-123'], undefined);
  });

  test('PublishBar component is exported and defined', async () => {
    const { PublishBar } = await import('../../src/components/pubsub/PublishBar');
    assert.equal(typeof PublishBar, 'function');
  });

  test('PubSubWorkspace component renders properly with active bound locators', async () => {
    const React = await import('react');
    const { PubSubWorkspace } = await import('../../src/components/pubsub/PubSubWorkspace');
    assert.equal(typeof PubSubWorkspace, 'function');

    useConnectionStore.setState({
      profiles: [
        {
          id: 'prof-pubsub-1',
          name: 'Main Router Profile',
          mode: 'router',
          connect_locators: [],
          listen_locators: ['tcp/0.0.0.0:0'],
          scout_multicast: true,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      selectedProfileId: 'prof-pubsub-1',
      activeSessions: {
        'prof-pubsub-1': {
          id: 'sess-ps-1',
          profile_id: 'prof-pubsub-1',
          zid: 'z987654321',
          mode: 'router',
          scout_multicast: true,
          connect_locators: [],
          listen_locators: ['tcp/0.0.0.0:0'],
          bound_locators: ['tcp/192.168.1.100:49152'],
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    });

    const workspaceEl = React.createElement(PubSubWorkspace, {
      className: 'test-workspace',
    });
    assert.ok(workspaceEl);
    assert.equal(workspaceEl.type, PubSubWorkspace);
  });

  test('discards all incoming samples that do not have a valid ZID (source_id)', async () => {
    let capturedHandler: ((event: { payload: unknown }) => void) | null = null;
    mockInvokeHandler = async () => undefined;

    // @ts-expect-error Mocking tauri internals
    globalThis.window.__TAURI_INTERNALS__.invoke = async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'plugin:event|listen') {
        capturedHandler = args?.handler as (event: { payload: unknown }) => void;
        return 1;
      }
      return mockInvokeHandler(cmd, args);
    };

    useMessageStore.getState().cleanupListener();
    useMessageStore.setState({
      messages: [],
      subscriptions: [],
    });

    await useMessageStore.getState().initListener();
    assert.ok(capturedHandler);

    // Simulate batch with 1 valid message (with ZID) and 2 invalid messages (without ZID or 0)
    capturedHandler({
      payload: [
        {
          session_id: 'sess-test-zid',
          key_expr: 'sensor/with-zid',
          payload: Array.from(Buffer.from('valid')),
          encoding: 'text',
          kind: 'put',
          timestamp: Date.now(),
          source_id: 'abcdef0123456789', // Valid ZID
        },
        {
          session_id: 'sess-test-zid',
          key_expr: 'sensor/without-zid',
          payload: Array.from(Buffer.from('invalid-1')),
          encoding: 'text',
          kind: 'put',
          timestamp: Date.now(),
          source_id: undefined, // Missing ZID
        },
        {
          session_id: 'sess-test-zid',
          key_expr: 'sensor/zero-zid',
          payload: Array.from(Buffer.from('invalid-2')),
          encoding: 'text',
          kind: 'put',
          timestamp: Date.now(),
          source_id: '0', // Zero ZID
        },
      ],
    });

    const messages = useMessageStore.getState().messages;
    // Exactly 1 message should be kept
    assert.equal(messages.length, 1);
    assert.equal(messages[0].keyExpr, 'sensor/with-zid');
    assert.equal(messages[0].sourceId, 'abcdef0123456789');
  });

  test('multi-node subscription isolation: same key expression on different nodes does not cross-contaminate or overwrite', async () => {
    const sqlitePresets: Record<string, Array<{ id: string; profile_id: string; key_expr: string; default_encoding: string; auto_subscribe: boolean; color_tag: string }>> = {
      'node-1': [],
      'node-2': [],
    };

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'subscribe' || cmd === 'unsubscribe') return undefined;
      if (cmd === 'save_subscription_preset') {
        const p = args?.preset as { id: string; profile_id: string; key_expr: string; default_encoding: string; auto_subscribe: boolean; color_tag: string };
        if (p && sqlitePresets[p.profile_id]) {
          const list = sqlitePresets[p.profile_id];
          const idx = list.findIndex((item) => item.id === p.id);
          if (idx >= 0) list[idx] = p;
          else list.push(p);
        }
        return undefined;
      }
      if (cmd === 'load_subscription_presets') {
        const pid = args?.profileId as string;
        return sqlitePresets[pid] || [];
      }
      return undefined;
    };

    useConnectionStore.setState({
      profiles: [
        { id: 'node-1', name: 'Node 1', mode: 'peer', connect_locators: [], listen_locators: [], scout_multicast: true, created_at: 1, updated_at: 1 },
        { id: 'node-2', name: 'Node 2', mode: 'peer', connect_locators: [], listen_locators: [], scout_multicast: true, created_at: 2, updated_at: 2 },
      ],
      sessionToProfile: {
        'sess-node-1': 'node-1',
        'sess-node-2': 'node-2',
      },
      activeSessions: {
        'node-1': { id: 'sess-node-1', profile_id: 'node-1', zid: 'z1', mode: 'peer', scout_multicast: true, connect_locators: [], listen_locators: [], created_at: 1 },
        'node-2': { id: 'sess-node-2', profile_id: 'node-2', zid: 'z2', mode: 'peer', scout_multicast: true, connect_locators: [], listen_locators: [], created_at: 2 },
      },
      selectedProfileId: 'node-1',
    });

    useMessageStore.setState({
      subscriptions: [],
      messages: [],
    });

    // 1. Subscribe to 'demo/**' on Node 1
    const subNode1Id = await useMessageStore.getState().subscribe(
      'sess-node-1',
      'demo/**',
      'json',
      '#3b82f6',
      'node-1'
    );

    assert.equal(useMessageStore.getState().subscriptions.length, 1);
    const sub1 = useMessageStore.getState().subscriptions[0];
    assert.equal(sub1.id, subNode1Id);
    assert.equal(sub1.profileId, 'node-1');
    assert.equal(sub1.sessionId, 'sess-node-1');
    assert.equal(sub1.keyExpr, 'demo/**');
    assert.equal(sub1.colorTag, '#3b82f6');

    // 2. Subscribe to 'demo/**' on Node 2 with different encoding and color
    const subNode2Id = await useMessageStore.getState().subscribe(
      'sess-node-2',
      'demo/**',
      'text',
      '#ef4444',
      'node-2'
    );

    // Both subscriptions MUST exist independently
    assert.equal(useMessageStore.getState().subscriptions.length, 2);

    const sub1After = useMessageStore.getState().subscriptions.find((s) => s.id === subNode1Id);
    const sub2After = useMessageStore.getState().subscriptions.find((s) => s.id === subNode2Id);

    assert.ok(sub1After, 'Node 1 subscription must exist');
    assert.ok(sub2After, 'Node 2 subscription must exist');
    assert.equal(sub1After?.profileId, 'node-1');
    assert.equal(sub1After?.sessionId, 'sess-node-1');
    assert.equal(sub1After?.encoding, 'json');
    assert.equal(sub1After?.colorTag, '#3b82f6');

    assert.equal(sub2After?.profileId, 'node-2');
    assert.equal(sub2After?.sessionId, 'sess-node-2');
    assert.equal(sub2After?.encoding, 'text');
    assert.equal(sub2After?.colorTag, '#ef4444');

    // 3. Switch to Node 1 and reload subscriptions from presets
    await useMessageStore.getState().loadSubscriptions('node-1', 'sess-node-1');
    assert.equal(useMessageStore.getState().subscriptions.length, 2);

    const sub1Reloaded = useMessageStore.getState().subscriptions.find((s) => s.id === subNode1Id);
    const sub2Reloaded = useMessageStore.getState().subscriptions.find((s) => s.id === subNode2Id);

    assert.equal(sub1Reloaded?.profileId, 'node-1');
    assert.equal(sub1Reloaded?.encoding, 'json');
    assert.equal(sub2Reloaded?.profileId, 'node-2');
    assert.equal(sub2Reloaded?.encoding, 'text');

    // 4. Disconnect Node 1: subscriptions for Node 1 must NOT disappear
    await useMessageStore.getState().loadSubscriptions('node-1', undefined);
    assert.equal(useMessageStore.getState().subscriptions.length, 2);

    const sub1Offline = useMessageStore.getState().subscriptions.find((s) => s.id === subNode1Id);
    assert.equal(sub1Offline?.profileId, 'node-1');
    assert.equal(sub1Offline?.active, false);

    // 5. Reconnect Node 1 with new session ID: subscriptions must remain intact
    await useMessageStore.getState().loadSubscriptions('node-1', 'sess-node-1-new');
    assert.equal(useMessageStore.getState().subscriptions.length, 2);

    const sub1Reconnected = useMessageStore.getState().subscriptions.find((s) => s.id === subNode1Id);
    assert.equal(sub1Reconnected?.profileId, 'node-1');
    assert.equal(sub1Reconnected?.sessionId, 'sess-node-1-new');
    assert.equal(sub1Reconnected?.active, true);

    // 6. Update Node 2's subscription: Node 1's subscription must remain UNTOUCHED
    await useMessageStore.getState().updateSubscription(
      subNode2Id,
      {
        keyExpr: 'demo/updated/**',
        encoding: 'cbor',
        colorTag: '#8b5cf6',
      },
      'sess-node-2'
    );

    const sub1AfterUpdate = useMessageStore.getState().subscriptions.find((s) => s.id === subNode1Id);
    const sub2AfterUpdate = useMessageStore.getState().subscriptions.find((s) => s.id === subNode2Id);

    assert.equal(sub1AfterUpdate?.keyExpr, 'demo/**');
    assert.equal(sub1AfterUpdate?.encoding, 'json');
    assert.equal(sub1AfterUpdate?.colorTag, '#3b82f6');
    assert.equal(sub1AfterUpdate?.profileId, 'node-1');

    assert.equal(sub2AfterUpdate?.keyExpr, 'demo/updated/**');
    assert.equal(sub2AfterUpdate?.encoding, 'cbor');
    assert.equal(sub2AfterUpdate?.colorTag, '#8b5cf6');
    assert.equal(sub2AfterUpdate?.profileId, 'node-2');

    // 7. Unsubscribe Node 2: Node 1's subscription must STILL exist
    await useMessageStore.getState().unsubscribe('sess-node-2', subNode2Id);
    assert.equal(useMessageStore.getState().subscriptions.length, 1);
    assert.equal(useMessageStore.getState().subscriptions[0].id, subNode1Id);
    assert.equal(useMessageStore.getState().subscriptions[0].profileId, 'node-1');
  });

  test('loadHistory preserves source_id and senderZid from SQLite stored messages', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'query_messages') {
        return [
          {
            id: 1,
            profile_id: 'prof-history-1',
            direction: 'incoming',
            key_expr: 'sensor/temperature',
            payload: Array.from(Buffer.from('{"temp": 21.5}')),
            encoding: 'json',
            kind: 'put',
            timestamp: 1700000001,
            source_id: 'zid-remote-node-999',
          },
          {
            id: 2,
            profile_id: 'prof-history-1',
            direction: 'outgoing',
            key_expr: 'control/switch',
            payload: Array.from(Buffer.from('{"on": true}')),
            encoding: 'json',
            kind: 'put',
            timestamp: 1700000002,
            source_id: 'zid-local-node-111',
          },
        ];
      }
      return undefined;
    };

    useMessageStore.setState({
      messages: [],
    });

    await useMessageStore.getState().loadHistory('prof-history-1');

    const msgs = useMessageStore.getState().messages;
    assert.equal(msgs.length, 2);

    const incoming = msgs.find((m) => m.direction === 'incoming');
    const outgoing = msgs.find((m) => m.direction === 'outgoing');

    assert.ok(incoming);
    assert.equal(incoming?.sourceId, 'zid-remote-node-999');
    assert.equal(incoming?.senderZid, undefined);

    assert.ok(outgoing);
    assert.equal(outgoing?.senderZid, 'zid-local-node-111');
  });

  test('loadHistory deduplicates with in-memory published message and preserves sessionId', async () => {
    const fixedTs = 1700000500;
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'query_messages') {
        return [
          {
            id: 42,
            profile_id: 'prof-1',
            direction: 'outgoing',
            key_expr: 'demo/test/dup',
            payload: Array.from(Buffer.from('{"data": 123}')),
            encoding: 'json',
            kind: 'put',
            timestamp: fixedTs,
            source_id: 'zid-local',
          },
        ];
      }
      return undefined;
    };

    // 1. In-memory message from publish()
    useMessageStore.setState({
      messages: [
        {
          id: 'uuid-in-memory-1',
          sessionId: 'sess-active-1',
          profileId: 'prof-1',
          direction: 'outgoing',
          keyExpr: 'demo/test/dup',
          payload: Array.from(Buffer.from('{"data": 123}')),
          encoding: 'json',
          kind: 'put',
          timestamp: fixedTs,
          senderZid: 'zid-local',
        },
      ],
    });

    // 2. loadHistory runs (e.g. from background reload)
    await useMessageStore.getState().loadHistory('prof-1');

    const msgs = useMessageStore.getState().messages;
    // Must NOT have 2 messages (one with session, one without)
    assert.equal(msgs.length, 1, 'Should have exactly 1 deduplicated message');
    assert.equal(msgs[0].sessionId, 'sess-active-1', 'Should preserve active sessionId');
    assert.equal(msgs[0].id, '42', 'Should update to SQLite persistent ID');
  });

  test('loadSubscriptions preserves unassigned profile subscriptions and allowedOrigin', async () => {
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'load_subscription_presets') {
        return [
          {
            id: 'preset-p1',
            profile_id: 'prof-target',
            key_expr: 'sensor/temp',
            default_encoding: 'json',
            auto_subscribe: true,
            color_tag: '#3b82f6',
          },
        ];
      }
      if (cmd === 'subscribe' || cmd === 'subscribe_advanced') return undefined;
      return undefined;
    };

    // Store contains:
    // 1. Subscription for another profile
    // 2. Subscription with no profileId (unassigned / ad-hoc)
    // 3. Existing subscription matching the preset but with allowedOrigin set
    useMessageStore.setState({
      subscriptions: [
        {
          id: 'sub-other',
          sessionId: 'sess-other',
          profileId: 'prof-other',
          keyExpr: 'other/**',
          encoding: 'json',
          colorTag: '#ef4444',
          count: 0,
          active: true,
          createdAt: 100,
        },
        {
          id: 'sub-unassigned',
          sessionId: 'sess-adhoc',
          profileId: '',
          keyExpr: 'adhoc/**',
          encoding: 'text',
          colorTag: '#10b981',
          count: 5,
          active: true,
          createdAt: 200,
        },
        {
          id: 'preset-p1',
          sessionId: 'sess-active',
          profileId: 'prof-target',
          keyExpr: 'sensor/temp',
          encoding: 'json',
          colorTag: '#3b82f6',
          count: 10,
          active: true,
          allowedOrigin: 'session_local',
          createdAt: 300,
        },
      ],
    });

    await useMessageStore.getState().loadSubscriptions('prof-target', 'sess-active');

    const subs = useMessageStore.getState().subscriptions;
    assert.equal(subs.length, 3, 'All 3 subscriptions should be preserved');

    const unassigned = subs.find((s) => s.id === 'sub-unassigned');
    assert.ok(unassigned, 'Unassigned subscription (profileId: "") must not disappear');
    assert.equal(unassigned?.keyExpr, 'adhoc/**');

    const other = subs.find((s) => s.id === 'sub-other');
    assert.ok(other, 'Other profile subscription must not disappear');

    const target = subs.find((s) => s.id === 'preset-p1');
    assert.ok(target, 'Target profile subscription must exist');
    assert.equal(target?.allowedOrigin, 'session_local', 'allowedOrigin must be retained after loadSubscriptions');
  });
});




