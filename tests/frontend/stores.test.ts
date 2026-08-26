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

// Import stores and types
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useMessageStore } from '../../src/stores/messageStore';
import { useQueryStore } from '../../src/stores/queryStore';
import { useTrafficStore } from '../../src/stores/trafficStore';
import { useProtoStore } from '../../src/stores/protoStore';
import { decodeProtobufPayload } from '../../src/lib/protobufEngine';
import type { ConnectionProfile, ReplySample, SessionInfo, ScoutedNode } from '../../src/types/zenoh';

describe('Connection Store', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      profiles: [],
      selectedProfileId: null,
      activeSessions: {},
      sessionToProfile: {},
      connectingProfileIds: {},
      scoutedNodes: [],
      isScouting: false,
      isLoadingProfiles: false,
      error: null,
    });
  });

  test('loadProfiles loads and selects first profile', async () => {
    const mockProfiles: ConnectionProfile[] = [
      {
        id: 'prof-1',
        name: 'Local Peer',
        mode: 'peer',
        connect_locators: [],
        listen_locators: [],
        scout_multicast: true,
        created_at: 1000,
        updated_at: 1000,
      },
    ];

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'load_profiles') return mockProfiles;
      return undefined;
    };

    await useConnectionStore.getState().loadProfiles();
    assert.equal(useConnectionStore.getState().profiles.length, 1);
    assert.equal(useConnectionStore.getState().selectedProfileId, 'prof-1');
  });

  test('saveProfile adds or updates a profile', async () => {
    let savedProfile: ConnectionProfile | null = null;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'save_profile') {
        savedProfile = args?.profile as ConnectionProfile;
        return undefined;
      }
      return undefined;
    };

    const newProfile: ConnectionProfile = {
      id: 'prof-2',
      name: 'Remote Router',
      mode: 'client',
      connect_locators: ['tcp/192.168.1.10:7447'],
      listen_locators: [],
      scout_multicast: false,
      created_at: 2000,
      updated_at: 2000,
    };

    await useConnectionStore.getState().saveProfile(newProfile);
    assert.ok(savedProfile);
    assert.equal(useConnectionStore.getState().profiles.length, 1);
    assert.equal(useConnectionStore.getState().profiles[0].name, 'Remote Router');
  });

  test('deleteProfile deletes profile and handles selected profile update', async () => {
    let deletedId: string | null = null;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'delete_profile') {
        deletedId = args?.profileId as string;
        return undefined;
      }
      return undefined;
    };

    useConnectionStore.setState({
      profiles: [
        {
          id: 'prof-1',
          name: 'P1',
          mode: 'peer',
          connect_locators: [],
          listen_locators: [],
          scout_multicast: true,
          created_at: 1000,
          updated_at: 1000,
        },
        {
          id: 'prof-2',
          name: 'P2',
          mode: 'peer',
          connect_locators: [],
          listen_locators: [],
          scout_multicast: true,
          created_at: 2000,
          updated_at: 2000,
        },
      ],
      selectedProfileId: 'prof-1',
    });

    await useConnectionStore.getState().deleteProfile('prof-1');
    assert.equal(deletedId, 'prof-1');
    assert.equal(useConnectionStore.getState().profiles.length, 1);
    assert.equal(useConnectionStore.getState().selectedProfileId, 'prof-2');
  });

  test('deleteProfile immediately purges matching scoutedNodes', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'delete_profile') return undefined;
      return undefined;
    };

    useConnectionStore.setState({
      profiles: [
        {
          id: 'prof-router-1',
          name: 'My Router',
          mode: 'router',
          connect_locators: [],
          listen_locators: ['tcp/127.0.0.1:7447'],
          scout_multicast: true,
          created_at: 1000,
          updated_at: 1000,
        },
      ],
      scoutedNodes: [
        {
          zid: 'prof-router-1',
          locators: ['tcp/127.0.0.1:7447'],
          whatami: 'router',
        },
        {
          zid: 'other-node-2',
          locators: ['tcp/192.168.1.50:7447'],
          whatami: 'peer',
        },
      ],
      selectedProfileId: 'prof-router-1',
    });

    await useConnectionStore.getState().deleteProfile('prof-router-1');
    const scouted = useConnectionStore.getState().scoutedNodes;
    assert.equal(scouted.length, 1);
    assert.equal(scouted[0].zid, 'other-node-2');
  });

  test('removeScoutedNode removes scouted node by ZID without full scout', () => {
    useConnectionStore.setState({
      scoutedNodes: [
        {
          zid: 'node-to-remove',
          locators: ['tcp/10.0.0.1:7447'],
          whatami: 'router',
        },
        {
          zid: 'keep-node',
          locators: ['tcp/10.0.0.2:7447'],
          whatami: 'peer',
        },
      ],
    });

    useConnectionStore.getState().removeScoutedNode('node-to-remove');
    const scouted = useConnectionStore.getState().scoutedNodes;
    assert.equal(scouted.length, 1);
    assert.equal(scouted[0].zid, 'keep-node');
  });

  test('connect and disconnect lifecycle', async () => {
    const testProfile: ConnectionProfile = {
      id: 'prof-100',
      name: 'Test Profile',
      mode: 'peer',
      connect_locators: [],
      listen_locators: [],
      scout_multicast: true,
      created_at: 1000,
      updated_at: 1000,
    };

    useConnectionStore.setState({
      profiles: [testProfile],
      selectedProfileId: 'prof-100',
    });

    const mockSessionId = 'sess-uuid-1234';
    const mockSessionInfo: SessionInfo = {
      id: mockSessionId,
      zid: '0123456789abcdef',
      mode: 'peer',
      scout_multicast: true,
      connect_locators: [],
      listen_locators: [],
      created_at: 1000,
    };

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'connect_node_by_zid') return mockSessionInfo;
      if (cmd === 'connect_session') return mockSessionId;
      if (cmd === 'get_session_info') return mockSessionInfo;
      if (cmd === 'disconnect_session') return undefined;
      throw new Error(`Unexpected command: ${cmd}`);
    };

    const sessionId = await useConnectionStore.getState().connect('prof-100');
    assert.equal(sessionId, mockSessionId);
    assert.equal(useConnectionStore.getState().isConnected('prof-100'), true);
    assert.equal(useConnectionStore.getState().getActiveSessionId('prof-100'), mockSessionId);

    await useConnectionStore.getState().disconnect('prof-100');
    assert.equal(useConnectionStore.getState().isConnected('prof-100'), false);
    assert.equal(useConnectionStore.getState().getActiveSession('prof-100'), undefined);
  });

  test('scout discovers nodes on network', async () => {
    const mockNodes: ScoutedNode[] = [
      {
        zid: 'router-123',
        what: 'router',
        locators: ['tcp/192.168.1.50:7447'],
      },
    ];

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'scout_locators') return mockNodes;
      return undefined;
    };

    const nodes = await useConnectionStore.getState().scout(1000);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].zid, 'router-123');
    assert.equal(useConnectionStore.getState().scoutedNodes.length, 1);
    assert.equal(useConnectionStore.getState().isScouting, false);
  });
});

describe('Message Store', () => {
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

  test('subscribe adds subscription with color tag', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'subscribe') return undefined;
      if (cmd === 'plugin:event|listen') return 1;
      return undefined;
    };

    const subId = await useMessageStore.getState().subscribe('sess-1', 'demo/**');
    assert.ok(subId);
    const subs = useMessageStore.getState().subscriptions;
    assert.equal(subs.length, 1);
    assert.equal(subs[0].keyExpr, 'demo/**');
    assert.equal(subs[0].active, true);
    assert.ok(subs[0].colorTag);
  });

  test('unsubscribe and toggle subscription', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'subscribe') return undefined;
      if (cmd === 'unsubscribe') return undefined;
      if (cmd === 'plugin:event|listen') return 1;
      return undefined;
    };

    const subId = await useMessageStore.getState().subscribe('sess-1', 'sensors/**', 'json', '#3b82f6', 'prof-1');
    assert.equal(useMessageStore.getState().subscriptions[0].active, true);
    assert.equal(useMessageStore.getState().subscriptions[0].profileId, 'prof-1');

    await useMessageStore.getState().toggleSubscription('sess-1', subId);
    assert.equal(useMessageStore.getState().subscriptions[0].active, false);

    await useMessageStore.getState().toggleSubscription('sess-1', subId);
    assert.equal(useMessageStore.getState().subscriptions[0].active, true);

    await useMessageStore.getState().unsubscribe('sess-1', subId);
    assert.equal(useMessageStore.getState().subscriptions.length, 0);
  });

  test('loadSubscriptions loads presets and auto-subscribes for active session', async () => {
    const mockPresets = [
      {
        id: 'preset-1',
        profile_id: 'prof-1',
        key_expr: 'demo/**',
        default_encoding: 'json',
        auto_subscribe: true,
        color_tag: '#10b981',
      },
    ];

    let subscribedKey = '';
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'load_subscription_presets') {
        assert.equal(args?.profileId, 'prof-1');
        return mockPresets;
      }
      if (cmd === 'subscribe') {
        subscribedKey = args?.keyExpr;
        return undefined;
      }
      return undefined;
    };

    await useMessageStore.getState().loadSubscriptions('prof-1', 'sess-1');

    const subs = useMessageStore.getState().subscriptions;
    assert.equal(subs.length, 1);
    assert.equal(subs[0].id, 'preset-1');
    assert.equal(subs[0].keyExpr, 'demo/**');
    assert.equal(subs[0].active, true);
    assert.equal(subscribedKey, 'demo/**');
  });

  test('loadSubscriptions loads presets without active session (disconnected state)', async () => {
    const mockPresets = [
      {
        id: 'preset-offline',
        profile_id: 'prof-offline',
        key_expr: 'sensor/telemetry/**',
        default_encoding: 'json',
        auto_subscribe: true,
        color_tag: '#3b82f6',
      },
    ];

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'load_subscription_presets') {
        assert.equal(args?.profileId, 'prof-offline');
        return mockPresets;
      }
      return undefined;
    };

    // Load presets without passing activeSessionId
    await useMessageStore.getState().loadSubscriptions('prof-offline', undefined);

    const subs = useMessageStore.getState().subscriptions;
    assert.equal(subs.length, 1);
    assert.equal(subs[0].id, 'preset-offline');
    assert.equal(subs[0].keyExpr, 'sensor/telemetry/**');
    assert.equal(subs[0].profileId, 'prof-offline');
    assert.equal(subs[0].active, false); // Inactive because session is not connected
  });

  test('subscribe creates and saves subscription preset when disconnected', async () => {
    let savedPreset: any = null;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'save_subscription_preset') {
        savedPreset = args?.preset;
        return undefined;
      }
      return undefined;
    };

    useMessageStore.setState({ subscriptions: [] });

    // Subscribe with empty sessionId
    const subId = await useMessageStore
      .getState()
      .subscribe('', 'offline/topic', 'json', '#10b981', 'prof-offline-2');

    assert.ok(subId);
    assert.ok(savedPreset);
    assert.equal(savedPreset.key_expr, 'offline/topic');
    assert.equal(savedPreset.profile_id, 'prof-offline-2');

    const subs = useMessageStore.getState().subscriptions;
    assert.equal(subs.length, 1);
    assert.equal(subs[0].keyExpr, 'offline/topic');
    assert.equal(subs[0].profileId, 'prof-offline-2');
    assert.equal(subs[0].active, false);
  });

  test('updateSubscription updates subscription preset and dynamic state', async () => {
    let savedPreset: any = null;
    let unsubscribedKey = '';
    let resubscribedKey = '';

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'save_subscription_preset') {
        savedPreset = args?.preset;
        return undefined;
      }
      if (cmd === 'unsubscribe') {
        unsubscribedKey = args?.subId;
        return undefined;
      }
      if (cmd === 'subscribe') {
        resubscribedKey = args?.keyExpr;
        return undefined;
      }
      return undefined;
    };

    useMessageStore.setState({
      subscriptions: [
        {
          id: 'sub-edit-1',
          sessionId: 'sess-active',
          profileId: 'prof-1',
          keyExpr: 'demo/old/**',
          encoding: 'json',
          colorTag: '#3b82f6',
          count: 5,
          active: true,
          createdAt: 1000,
        },
      ],
    });

    // Update with key change while active
    await useMessageStore.getState().updateSubscription(
      'sub-edit-1',
      {
        keyExpr: 'demo/new/**',
        encoding: 'cbor',
        colorTag: '#10b981',
        active: true,
      },
      'sess-active'
    );

    const updated = useMessageStore.getState().subscriptions[0];
    assert.equal(updated.keyExpr, 'demo/new/**');
    assert.equal(updated.encoding, 'cbor');
    assert.equal(updated.colorTag, '#10b981');
    assert.equal(unsubscribedKey, 'sub-edit-1');
    assert.equal(resubscribedKey, 'demo/new/**');
    assert.equal(savedPreset.key_expr, 'demo/new/**');
    assert.equal(savedPreset.default_encoding, 'cbor');
  });

  test('publish creates outgoing message and calls backend', async () => {
    let published = false;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'publish_sample') {
        published = true;
        assert.equal(args?.keyExpr, 'sensor/temp');
        assert.equal(args?.encoding, 'json');
        return undefined;
      }
      return undefined;
    };

    const payload = Array.from(Buffer.from('{"value": 25.5}'));
    await useMessageStore.getState().publish('sess-1', 'sensor/temp', payload, 'json', 'put');

    assert.equal(published, true);
    const messages = useMessageStore.getState().messages;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].direction, 'outgoing');
    assert.equal(messages[0].keyExpr, 'sensor/temp');
  });

  test('publish records outbound pub event in traffic store', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'publish_sample') return undefined;
      return undefined;
    };

    useTrafficStore.getState().clearTrafficHistory();

    const payload = Array.from(Buffer.from('{"temp": 25.5}'));
    await useMessageStore.getState().publish('sess-1', 'sensor/temp', payload, 'json', 'put');

    const trafficState = useTrafficStore.getState();
    assert.equal(trafficState.totalOutboundBytes, payload.length);
    assert.equal(trafficState.totalOutboundMsgs, 1);
    assert.equal(trafficState.keyStats['sensor/temp'].outboundBytes, payload.length);
    assert.equal(trafficState.keyStats['sensor/temp'].outboundMsgs, 1);
  });

  test('publish encodes string payload with protobuf encoding', async () => {
    useProtoStore.getState().clearAll();
    const protoSchema = `
      syntax = "proto3";
      package iot.motor;
      message Command {
        string cmd = 1;
        int32 speed = 2;
      }
    `;
    useProtoStore.getState().addSchema('motor.proto', protoSchema);

    let sentPayload: number[] = [];
    let sentEncoding: string = '';
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'publish_sample') {
        sentPayload = args?.payload as number[];
        sentEncoding = args?.encoding as string;
        return undefined;
      }
      return undefined;
    };

    const jsonPayload = JSON.stringify({ cmd: 'start', speed: 1500 });
    await useMessageStore.getState().publish(
      'sess-1',
      'robot/motor/cmd',
      jsonPayload,
      'protobuf',
      'put',
      undefined,
      { protoTypeName: 'iot.motor.Command' }
    );

    assert.equal(sentEncoding, 'protobuf');
    assert.ok(sentPayload.length > 0);

    const root = useProtoStore.getState().getGlobalRoot();
    const decoded = decodeProtobufPayload(root, 'iot.motor.Command', sentPayload);
    assert.equal(decoded.cmd, 'start');
    assert.equal(decoded.speed, 1500);
  });


  test('ring buffer respects max capacity', () => {
    useMessageStore.getState().setMaxMessages(5);

    for (let i = 0; i < 10; i++) {
      useMessageStore.getState().addMessage({
        id: `msg-${i}`,
        sessionId: 'sess-1',
        direction: 'incoming',
        keyExpr: `test/${i}`,
        payload: [i],
        encoding: 'raw',
        kind: 'put',
        timestamp: 1000 + i,
      });
    }

    const messages = useMessageStore.getState().messages;
    assert.equal(messages.length, 5);
    assert.equal(messages[0].id, 'msg-5');
    assert.equal(messages[4].id, 'msg-9');
  });

  test('filter messages by key expression and text search', () => {
    const payloadText = Array.from(Buffer.from('ambient humidity 65%'));
    const payloadJson = Array.from(Buffer.from('{"temp": 24.2}'));

    useMessageStore.getState().addMessage({
      id: 'm1',
      sessionId: 's1',
      direction: 'incoming',
      keyExpr: 'room/sensor/temp',
      payload: payloadJson,
      encoding: 'json',
      kind: 'put',
      timestamp: 1000,
    });

    useMessageStore.getState().addMessage({
      id: 'm2',
      sessionId: 's1',
      direction: 'incoming',
      keyExpr: 'room/sensor/humidity',
      payload: payloadText,
      encoding: 'text',
      kind: 'put',
      timestamp: 1001,
    });

    useMessageStore.getState().addMessage({
      id: 'm3',
      sessionId: 's2',
      direction: 'incoming',
      keyExpr: 'garden/valve/status',
      payload: [1],
      encoding: 'raw',
      kind: 'put',
      timestamp: 1002,
    });

    // Filter by session
    const s1Msgs = useMessageStore.getState().getFilteredMessages('s1');
    assert.equal(s1Msgs.length, 2);

    // Filter by keyExpr
    useMessageStore.getState().setActiveFilterKey('room/sensor/temp');
    assert.equal(useMessageStore.getState().getFilteredMessages('s1').length, 1);
    assert.equal(useMessageStore.getState().getFilteredMessages('s1')[0].id, 'm1');

    // Reset filter and search by text in payload
    useMessageStore.getState().setActiveFilterKey('');
    useMessageStore.getState().setSearchQuery('humidity');
    const searchResults = useMessageStore.getState().getFilteredMessages();
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, 'm2');
  });

  test('loadHistory fetches stored SQLite messages, sorts ascending, and deduplicates', async () => {
    const mockStored = [
      {
        id: 2,
        profile_id: 'p1',
        direction: 'incoming',
        key_expr: 'demo/second',
        payload: Array.from(Buffer.from('second')),
        encoding: 'text',
        kind: 'put',
        timestamp: 2000,
      },
      {
        id: 1,
        profile_id: 'p1',
        direction: 'incoming',
        key_expr: 'demo/first',
        payload: Array.from(Buffer.from('first')),
        encoding: 'text',
        kind: 'put',
        timestamp: 1000,
      },
    ];

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'query_messages') {
        assert.equal(args?.profileId, 'p1');
        return mockStored;
      }
      return undefined;
    };

    // Pre-populate with an existing message
    useMessageStore.getState().addMessage({
      id: 'existing-1',
      sessionId: 's1',
      profileId: 'p1',
      direction: 'incoming',
      keyExpr: 'demo/third',
      payload: Array.from(Buffer.from('third')),
      encoding: 'text',
      kind: 'put',
      timestamp: 3000,
    });

    await useMessageStore.getState().loadHistory('p1');

    const messages = useMessageStore.getState().messages;
    assert.equal(messages.length, 3);
    // Messages must be sorted chronologically ascending
    assert.equal(messages[0].keyExpr, 'demo/first');
    assert.equal(messages[1].keyExpr, 'demo/second');
    assert.equal(messages[2].keyExpr, 'demo/third');
  });

  test('clearMessages clears messages by profileId or sessionId', async () => {
    let clearedProfileId: string | undefined = undefined;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'clear_message_history') {
        clearedProfileId = args?.profileId as string;
        return undefined;
      }
      return undefined;
    };

    useMessageStore.getState().addMessage({
      id: 'm1',
      sessionId: 's1',
      profileId: 'p1',
      direction: 'incoming',
      keyExpr: 'demo/a',
      payload: [],
      encoding: 'text',
      kind: 'put',
      timestamp: 1000,
    });

    useMessageStore.getState().addMessage({
      id: 'm2',
      sessionId: 's2',
      profileId: 'p2',
      direction: 'incoming',
      keyExpr: 'demo/b',
      payload: [],
      encoding: 'text',
      kind: 'put',
      timestamp: 2000,
    });

    // Clear only p1 messages
    await useMessageStore.getState().clearMessages(undefined, 'p1');
    assert.equal(clearedProfileId, 'p1');
    const remaining = useMessageStore.getState().messages;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'm2');
  });
});

describe('Query Store', () => {
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

  test('runQuery creates execution record and captures replies', async () => {
    const mockReplies: ReplySample[] = [
      {
        session_id: 'sess-1',
        key_expr: 'demo/rpc/info',
        payload: Array.from(Buffer.from('{"version": "1.0"}')),
        encoding: 'json',
        replier_id: 'node-1',
        latency_ms: 12,
        timestamp: 1000,
        is_err: false,
        error_message: null,
      },
    ];

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'query_get') return mockReplies;
      return undefined;
    };

    const replies = await useQueryStore.getState().runQuery('sess-1', 'demo/rpc/info', 'all', 2000);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].latency_ms, 12);

    const execs = useQueryStore.getState().executions;
    assert.equal(execs.length, 1);
    assert.equal(execs[0].status, 'completed');
    assert.equal(execs[0].replies.length, 1);
    assert.equal(useQueryStore.getState().getActiveExecution()?.id, execs[0].id);
  });

  test('runQuery encodes string payload with protobuf encoding', async () => {
    useProtoStore.getState().clearAll();
    const protoSchema = `
      syntax = "proto3";
      package iot.rpc;
      message Request {
        string query = 1;
        int32 limit = 2;
      }
    `;
    useProtoStore.getState().addSchema('rpc.proto', protoSchema);

    let sentPayload: number[] | undefined = undefined;
    let sentEncoding: string | undefined = undefined;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'query_get') {
        sentPayload = args?.payload as number[];
        sentEncoding = args?.encoding as string;
        return [];
      }
      return undefined;
    };

    const jsonPayload = JSON.stringify({ query: 'status', limit: 10 });
    await useQueryStore.getState().runQuery(
      'sess-1',
      'rpc/status',
      'all',
      2000,
      undefined,
      jsonPayload,
      'protobuf',
      'auto',
      { protoTypeName: 'iot.rpc.Request' }
    );

    assert.equal(sentEncoding, 'protobuf');
    assert.ok(sentPayload);
    assert.ok(sentPayload.length > 0);

    const root = useProtoStore.getState().getGlobalRoot();
    const decoded = decodeProtobufPayload(root, 'iot.rpc.Request', sentPayload);
    assert.equal(decoded.query, 'status');
    assert.equal(decoded.limit, 10);
  });

  test('declareQueryable and undeclareQueryable lifecycle', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'declare_queryable') return undefined;
      if (cmd === 'undeclare_queryable') return undefined;
      if (cmd === 'plugin:event|listen') return 1;
      return undefined;
    };

    const qId = await useQueryStore.getState().declareQueryable('sess-1', 'rpc/status/**');
    assert.ok(qId);
    assert.equal(useQueryStore.getState().activeQueryables.length, 1);
    assert.equal(useQueryStore.getState().activeQueryables[0].keyExpr, 'rpc/status/**');

    await useQueryStore.getState().undeclareQueryable('sess-1', qId);
    assert.equal(useQueryStore.getState().activeQueryables.length, 0);
  });

  test('replyInboundQuery sends reply and clears inbound entry', async () => {
    let repliedToken: string | null = null;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'reply_query') {
        repliedToken = args?.token as string;
        return undefined;
      }
      return undefined;
    };

    useQueryStore.setState({
      inboundQueries: [
        {
          token: 'token-abc',
          session_id: 's1',
          queryable_id: 'q1',
          key_expr: 'demo/rpc/call',
          parameters: 'arg=1',
          payload: null,
          encoding: null,
          timestamp: 1000,
        },
      ],
    });

    assert.equal(useQueryStore.getState().inboundQueries.length, 1);
    await useQueryStore.getState().replyInboundQuery('token-abc', 'demo/rpc/call', [1, 2, 3], 'raw');

    assert.equal(repliedToken, 'token-abc');
    assert.equal(useQueryStore.getState().inboundQueries.length, 0);
  });

  test('replyInboundQuery encodes string payload with protobuf encoding', async () => {
    useProtoStore.getState().clearAll();
    const protoSchema = `
      syntax = "proto3";
      package iot.rpc;
      message Response {
        string status = 1;
        int32 code = 2;
      }
    `;
    useProtoStore.getState().addSchema('rpc_res.proto', protoSchema);

    let repliedPayload: number[] = [];
    let repliedEncoding: string = '';
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'reply_query') {
        repliedPayload = args?.payload as number[];
        repliedEncoding = args?.encoding as string;
        return undefined;
      }
      return undefined;
    };

    useQueryStore.setState({
      inboundQueries: [
        {
          token: 'token-proto-1',
          session_id: 's1',
          queryable_id: 'q1',
          key_expr: 'rpc/status',
          parameters: '',
          payload: null,
          encoding: null,
          timestamp: 1000,
        },
      ],
    });

    const jsonReply = JSON.stringify({ status: 'healthy', code: 200 });
    await useQueryStore.getState().replyInboundQuery(
      'token-proto-1',
      'rpc/status',
      jsonReply,
      'protobuf',
      { protoTypeName: 'iot.rpc.Response' }
    );

    assert.equal(repliedEncoding, 'protobuf');
    assert.ok(repliedPayload.length > 0);

    const root = useProtoStore.getState().getGlobalRoot();
    const decoded = decodeProtobufPayload(root, 'iot.rpc.Response', repliedPayload);
    assert.equal(decoded.status, 'healthy');
    assert.equal(decoded.code, 200);
  });

  test('replyInboundQuery removes expired or already answered query from queue on error', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'reply_query') {
        throw new Error('inbound query with token "token-expired" not found or already replied');
      }
      return undefined;
    };

    useQueryStore.setState({
      inboundQueries: [
        {
          token: 'token-expired',
          session_id: 's1',
          queryable_id: 'q1',
          key_expr: 'demo/rpc/call',
          parameters: '',
          payload: null,
          encoding: null,
          timestamp: 1000,
        },
      ],
    });

    assert.equal(useQueryStore.getState().inboundQueries.length, 1);
    await assert.rejects(
      async () => {
        await useQueryStore.getState().replyInboundQuery('token-expired', 'demo/rpc/call', [1]);
      },
      /already replied/
    );

    // Should be removed from pending queue despite backend error
    assert.equal(useQueryStore.getState().inboundQueries.length, 0);
  });

  test('dismissInboundQuery removes specific query from queue', () => {
    useQueryStore.setState({
      inboundQueries: [
        {
          token: 'token-1',
          session_id: 's1',
          queryable_id: 'q1',
          key_expr: 'demo/rpc/1',
          parameters: '',
          payload: null,
          encoding: null,
          timestamp: 1000,
        },
        {
          token: 'token-2',
          session_id: 's1',
          queryable_id: 'q1',
          key_expr: 'demo/rpc/2',
          parameters: '',
          payload: null,
          encoding: null,
          timestamp: 2000,
        },
      ],
    });

    useQueryStore.getState().dismissInboundQuery('token-1');
    assert.equal(useQueryStore.getState().inboundQueries.length, 1);
    assert.equal(useQueryStore.getState().inboundQueries[0].token, 'token-2');
  });


  test('runQuery and replyInboundQuery record events in traffic store', async () => {
    const mockReplies: ReplySample[] = [
      {
        session_id: 'sess-1',
        key_expr: 'demo/rpc/info',
        payload: Array.from(Buffer.from('{"version": "1.0"}')),
        encoding: 'json',
        replier_id: 'node-1',
        latency_ms: 12,
        timestamp: 1000,
        is_err: false,
        error_message: null,
      },
    ];

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'query_get') return mockReplies;
      if (cmd === 'reply_query') return undefined;
      return undefined;
    };

    useTrafficStore.getState().clearTrafficHistory();

    const selector = 'demo/rpc/info';
    await useQueryStore.getState().runQuery('sess-1', selector, 'all', 2000);

    let traffic = useTrafficStore.getState();
    assert.equal(traffic.totalOutboundBytes, selector.length); // query_req
    assert.equal(traffic.totalInboundBytes, mockReplies[0].payload.length); // query_res
    assert.equal(traffic.totalOutboundMsgs, 1);
    assert.equal(traffic.totalInboundMsgs, 1);
    assert.equal(traffic.keyStats[selector].outboundBytes, selector.length);
    assert.equal(traffic.keyStats[selector].inboundBytes, mockReplies[0].payload.length);

    // Now test replyInboundQuery
    const replyPayload = [1, 2, 3, 4];
    await useQueryStore.getState().replyInboundQuery('token-123', 'demo/rpc/reply', replyPayload);

    traffic = useTrafficStore.getState();
    assert.equal(traffic.totalOutboundBytes, selector.length + 4);
    assert.equal(traffic.keyStats['demo/rpc/reply'].outboundBytes, 4);
    assert.equal(traffic.keyStats['demo/rpc/reply'].outboundMsgs, 1);
  });


  test('loadQueryHistory loads stored query executions from SQLite', async () => {
    const mockStored = [
      {
        id: 'exec-1',
        profile_id: 'prof-1',
        selector: 'demo/rpc/info',
        target: 'all',
        timeout_ms: 2000,
        status: 'completed',
        replies_json: JSON.stringify([
          {
            session_id: 's1',
            key_expr: 'demo/rpc/info',
            payload: [123],
            encoding: 'json',
            replier_id: 'node-1',
            latency_ms: 15,
            timestamp: 1000,
            is_err: false,
            error_message: null,
          },
        ]),
        duration_ms: 20,
        error: null,
        timestamp: 1000,
      },
    ];

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'load_query_history') {
        assert.equal(args?.profileId, 'prof-1');
        return mockStored;
      }
      return undefined;
    };

    await useQueryStore.getState().loadQueryHistory('prof-1');

    const execs = useQueryStore.getState().executions;
    assert.equal(execs.length, 1);
    assert.equal(execs[0].id, 'exec-1');
    assert.equal(execs[0].selector, 'demo/rpc/info');
    assert.equal(execs[0].replies.length, 1);
    assert.equal(execs[0].replies[0].latency_ms, 15);
  });

  test('loadQueryables loads queryable presets from SQLite and auto-declares for active session', async () => {
    const mockPresets = [
      {
        id: 'qp-1',
        profile_id: 'prof-1',
        key_expr: 'rpc/service/**',
        auto_reply: true,
        reply_payload: '{"status":"ok"}',
        reply_encoding: 'json',
      },
    ];

    let declaredKey = '';
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'load_queryable_presets') {
        assert.equal(args?.profileId, 'prof-1');
        return mockPresets;
      }
      if (cmd === 'declare_queryable') {
        declaredKey = args?.keyExpr;
        return undefined;
      }
      return undefined;
    };

    await useQueryStore.getState().loadQueryables('prof-1', 'sess-1');

    const queryables = useQueryStore.getState().activeQueryables;
    assert.equal(queryables.length, 1);
    assert.equal(queryables[0].id, 'qp-1');
    assert.equal(queryables[0].keyExpr, 'rpc/service/**');
    assert.equal(declaredKey, 'rpc/service/**');
  });

  test('clearExecutions clears executions by profileId or sessionId', async () => {
    let clearedProfileId: string | undefined = undefined;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'clear_query_history') {
        clearedProfileId = args?.profileId;
        return undefined;
      }
      return undefined;
    };

    useQueryStore.setState({
      executions: [
        {
          id: 'e1',
          sessionId: 's1',
          profileId: 'p1',
          selector: 'demo/a',
          target: 'all',
          timeoutMs: 2000,
          status: 'completed',
          replies: [],
          startedAt: 1000,
        },
        {
          id: 'e2',
          sessionId: 's2',
          profileId: 'p2',
          selector: 'demo/b',
          target: 'all',
          timeoutMs: 2000,
          status: 'completed',
          replies: [],
          startedAt: 2000,
        },
      ],
    });

    await useQueryStore.getState().clearExecutions(undefined, 'p1');
    assert.equal(clearedProfileId, 'p1');
    const remaining = useQueryStore.getState().executions;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'e2');
  });
});
