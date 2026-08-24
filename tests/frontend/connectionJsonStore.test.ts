import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useConnectionJsonStore } from '../../src/stores/connectionJsonStore';
import type { TopologyNode } from '../../src/types/topology';
import type { ConnectionProfile, SessionInfo } from '../../src/types/zenoh';

describe('Connection JSON Store (useConnectionJsonStore)', () => {
  beforeEach(() => {
    useConnectionJsonStore.getState().clearActive();
  });

  it('initializes with empty default state', () => {
    const state = useConnectionJsonStore.getState();
    assert.equal(state.selectedNodeZid, null);
    assert.equal(state.selectedProfileId, null);
    assert.equal(state.activeNodeJson, '');
    assert.equal(state.activeEditFormJson, '');
  });

  it('syncs live JSON5 configuration from an inspected TopologyNode', () => {
    const store = useConnectionJsonStore.getState();

    const routerNode: TopologyNode = {
      id: 'node-router-1',
      zid: '0123456789abcdef0123456789abcdef',
      label: 'Local Router',
      type: 'router',
      status: 'connected',
      locators: ['tcp/0.0.0.0:0', 'ws/0.0.0.0:8080'],
      connectLocators: ['tcp/10.0.0.1:7447'],
      isTls: false,
      isZenohX: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    };

    const matchingProfile: ConnectionProfile = {
      id: 'profile-1',
      name: 'Local Router',
      mode: 'router',
      connect_locators: ['tcp/10.0.0.1:7447'],
      listen_locators: ['tcp/0.0.0.0:0'],
      scout_multicast: true,
      scout_gossip: true,
      user_auth: null,
      tls_config: null,
      custom_config: null,
      created_at: 1000,
      updated_at: 1000,
    };

    const activeSession: SessionInfo = {
      id: 'sess-1',
      zid: '0123456789abcdef0123456789abcdef',
      mode: 'router',
      bound_locators: ['tcp/192.168.1.50:43219', 'ws/192.168.1.50:8080'],
      listen_locators: ['tcp/0.0.0.0:0'],
      connect_locators: ['tcp/10.0.0.1:7447'],
      peers: [],
      routers: [],
      transports: [],
    };

    const json = store.syncNodeJson(routerNode, matchingProfile, activeSession);
    const parsed = JSON.parse(json);

    assert.equal(parsed.id, '0123456789abcdef0123456789abcdef');
    assert.equal(parsed.mode, 'router');
    assert.deepEqual(parsed.listen?.endpoints, [
      'tcp/0.0.0.0:0',
      'ws/0.0.0.0:8080',
    ]);
    assert.deepEqual(parsed.connect?.endpoints, ['tcp/10.0.0.1:7447']);
    assert.equal(useConnectionJsonStore.getState().selectedNodeZid, routerNode.zid);
    assert.equal(useConnectionJsonStore.getState().activeNodeJson, json);
  });

  it('syncs live JSON5 configuration from edit form inputs', () => {
    const store = useConnectionJsonStore.getState();

    const formConfig = {
      profile_id: 'prof-client-123',
      mode: 'client' as const,
      connect_locators: ['tcp/127.0.0.1:7447'],
      listen_locators: [],
      scout_multicast: false,
      scout_gossip: false,
      reconnect_retry: {
        timeout_ms: 5000,
        period_init_ms: 1000,
        period_max_ms: 10000,
        factor: 2,
      },
    };

    const json = store.syncEditFormJson(formConfig);
    const parsed = JSON.parse(json);

    assert.equal(parsed.mode, 'client');
    assert.deepEqual(parsed.connect?.endpoints, ['tcp/127.0.0.1:7447']);
    assert.equal(parsed.connect?.timeout_ms, 5000);
    assert.equal(useConnectionJsonStore.getState().activeEditFormJson, json);
    assert.equal(useConnectionJsonStore.getState().selectedProfileId, 'prof-client-123');
  });

  it('parses raw Zenoh JSON configuration into structured profile fields', () => {
    const store = useConnectionJsonStore.getState();

    const rawJson = JSON.stringify({
      id: 'fedcba9876543210fedcba9876543210',
      mode: 'peer',
      connect: {
        endpoints: ['tcp/192.168.1.100:7447'],
      },
      listen: {
        endpoints: ['tcp/0.0.0.0:0'],
      },
      scouting: {
        multicast: { enabled: true },
        gossip: { enabled: true },
      },
      transport: {
        auth: {
          usrpwd: {
            user: 'alice',
            password: 'secretpassword',
          },
        },
        link: {
          tls: {
            root_ca_certificate: '/etc/ca.crt',
            connect_certificate: '/etc/client.crt',
            connect_private_key: '/etc/client.key',
          },
        },
      },
    });

    const parsed = store.parseJsonToProfile(rawJson);
    assert.ok(parsed);
    assert.equal(parsed?.id, 'fedcba9876543210fedcba9876543210');
    assert.equal(parsed?.mode, 'peer');
    assert.deepEqual(parsed?.connect_locators, ['tcp/192.168.1.100:7447']);
    assert.deepEqual(parsed?.listen_locators, ['tcp/0.0.0.0:0']);
    assert.equal(parsed?.scout_multicast, true);
    assert.equal(parsed?.scout_gossip, true);
    assert.equal(parsed?.user_auth?.username, 'alice');
    assert.equal(parsed?.user_auth?.password, 'secretpassword');
    assert.equal(parsed?.tls_config?.ca_cert, '/etc/ca.crt');
    assert.equal(parsed?.tls_config?.client_cert, '/etc/client.crt');
    assert.equal(parsed?.tls_config?.client_key, '/etc/client.key');
  });

  it('stores custom raw JSON overrides per profile ID', () => {
    const store = useConnectionJsonStore.getState();

    const customText = '{\n  "transport": { "unicast": { "max_sessions": 20 } }\n}';
    store.setCustomOverride('profile-1', customText);

    assert.equal(useConnectionJsonStore.getState().customOverrides['profile-1'], customText);
  });
});
