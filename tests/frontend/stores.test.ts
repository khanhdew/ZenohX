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

    const subId = await useMessageStore.getState().subscribe('sess-1', 'sensors/**');
    assert.equal(useMessageStore.getState().subscriptions[0].active, true);

    await useMessageStore.getState().toggleSubscription('sess-1', subId);
    assert.equal(useMessageStore.getState().subscriptions[0].active, false);

    await useMessageStore.getState().toggleSubscription('sess-1', subId);
    assert.equal(useMessageStore.getState().subscriptions[0].active, true);

    await useMessageStore.getState().unsubscribe('sess-1', subId);
    assert.equal(useMessageStore.getState().subscriptions.length, 0);
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
});
