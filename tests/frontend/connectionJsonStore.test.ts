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

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useConnectionJsonStore } from '../../src/stores/connectionJsonStore';
import type { TopologyNode } from '../../src/types/topology';
import { filterRealLocators, filterLinkLocalLocators, generateZenohJson5 } from '../../src/lib/tls';

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
      locators: ['tcp/0.0.0.0:7447', 'ws/0.0.0.0:8080'],
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
      listen_locators: ['tcp/0.0.0.0:7447'],
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
      bound_locators: ['tcp/192.168.1.50:7447', 'ws/192.168.1.50:8080'],
      listen_locators: ['tcp/0.0.0.0:7447'],
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
      'tcp/0.0.0.0:7447',
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

  it('syncs live JSON5 configuration and ensures peer/client sessions do not include listen endpoints in JSON5', () => {
    const store = useConnectionJsonStore.getState();

    const peerFormConfig = {
      profile_id: 'prof-peer-1',
      mode: 'peer' as const,
      connect_locators: [],
      listen_locators: ['tcp/0.0.0.0:0'],
      scout_multicast: true,
      scout_gossip: true,
    };

    const liveSession: SessionInfo = {
      id: 'sess-123',
      zid: 'abcdef0123456789abcdef0123456789',
      mode: 'peer',
      bound_locators: ['tcp/192.168.1.105:43821', 'ws/192.168.1.105:8080'],
      listen_locators: ['tcp/0.0.0.0:0'],
      connect_locators: [],
      peers: [],
      routers: [],
      transports: [],
    };

    const json = store.syncEditFormJson(peerFormConfig, liveSession);
    const parsed = JSON.parse(json);

    assert.equal(parsed.mode, 'peer');
    // Peer mode must NOT have listen endpoints in JSON5
    assert.equal(parsed.listen, undefined);

    // Verify router mode includes listen endpoints as configured
    const routerFormConfig = {
      profile_id: 'prof-router-1',
      mode: 'router' as const,
      connect_locators: [],
      listen_locators: ['tcp/192.168.1.100:7447'],
      scout_multicast: true,
      scout_gossip: true,
    };
    const routerJson = store.syncEditFormJson(routerFormConfig, {
      ...liveSession,
      mode: 'router',
    });
    const parsedRouter = JSON.parse(routerJson);
    assert.equal(parsedRouter.mode, 'router');
    assert.deepEqual(parsedRouter.listen?.endpoints, ['tcp/192.168.1.100:7447']);
  });

  it('parses raw Zenoh JSON configuration into structured profile fields and ignores listen endpoints for peer', () => {
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
    // Peer does not load listen endpoints
    assert.deepEqual(parsed?.listen_locators, []);
    assert.equal(parsed?.scout_multicast, true);
    assert.equal(parsed?.scout_gossip, true);
    assert.equal(parsed?.user_auth?.username, 'alice');
    assert.equal(parsed?.user_auth?.password, 'secretpassword');
    assert.equal(parsed?.tls_config?.ca_cert, '/etc/ca.crt');
    assert.equal(parsed?.tls_config?.client_cert, '/etc/client.crt');
    assert.equal(parsed?.tls_config?.client_key, '/etc/client.key');
  });

  it('parses JSON5 with single-line comments, multi-line comments, and trailing commas', () => {
    const store = useConnectionJsonStore.getState();

    const json5Content = `
    // Zenoh configuration with comments
    {
      /* Mode of the Zenoh node */
      "mode": "router",
      "connect": {
        "endpoints": [
          "tcp/192.168.1.14:42157", // Target peer
        ],
      },
      "listen": {
        "endpoints": [
          "tcp/0.0.0.0:7447",
        ],
      },
    }
    `;

    const parsed = store.parseJsonToProfile(json5Content);
    assert.ok(parsed);
    assert.equal(parsed?.mode, 'router');
    assert.deepEqual(parsed?.connect_locators, ['tcp/192.168.1.14:42157']);
    assert.deepEqual(parsed?.listen_locators, ['tcp/0.0.0.0:7447']);
  });

  it('stores custom raw JSON overrides per profile ID', () => {
    const store = useConnectionJsonStore.getState();

    const customText = '{\n  "transport": { "unicast": { "max_sessions": 20 } }\n}';
    store.setCustomOverride('profile-1', customText);

    assert.equal(useConnectionJsonStore.getState().customOverrides['profile-1'], customText);
  });

  it('filters out loopback ([::1], 127.0.0.1) and link-local (fe80::, 169.254.) locators, keeping strictly real IPv6 and real IPv4', () => {
    const mixedEndpoints = [
      'tcp/[::1]:34105',
      'tcp/[2001:ee2:e2:2600:38cd:5f4a:53d9:6dcf]:34105',
      'tcp/127.0.0.1:34105',
      'tcp/[fe80::ead3:55ad:1c22:b20a]:34105',
      'tcp/169.254.12.34:34105',
      'tcp/192.168.1.14:34105',
    ];

    const filtered = filterRealLocators(mixedEndpoints);
    assert.deepEqual(filtered, [
      'tcp/[2001:ee2:e2:2600:38cd:5f4a:53d9:6dcf]:34105',
      'tcp/192.168.1.14:34105',
    ]);

    const json5 = generateZenohJson5({
      mode: 'router',
      listen_locators: mixedEndpoints,
    });
    const parsed = JSON.parse(json5);
    assert.deepEqual(parsed.listen.endpoints, [
      'tcp/[2001:ee2:e2:2600:38cd:5f4a:53d9:6dcf]:34105',
      'tcp/192.168.1.14:34105',
    ]);
  });

  it('updates live JSON5 when IP and port are modified in edit form', () => {
    const store = useConnectionJsonStore.getState();

    // Initial config
    const initialConfig = {
      profile_id: 'prof-client-1',
      mode: 'client' as const,
      connect_locators: ['tcp/127.0.0.1:7447'],
      listen_locators: [],
    };
    const initialJson = store.syncEditFormJson(initialConfig);
    const initialParsed = JSON.parse(initialJson);
    assert.deepEqual(initialParsed.connect?.endpoints, ['tcp/127.0.0.1:7447']);

    // User changes IP and port
    const modifiedConfig = {
      profile_id: 'prof-client-1',
      mode: 'client' as const,
      connect_locators: ['tcp/192.168.1.100:8000'],
      listen_locators: [],
      custom_config: {
        mode: 'client',
        connect: {
          endpoints: ['tcp/127.0.0.1:7447'],
        },
      },
    };
    const modifiedJson = store.syncEditFormJson(modifiedConfig);
    const modifiedParsed = JSON.parse(modifiedJson);

    // Endpoints in JSON5 must reflect the new IP and port (192.168.1.100:8000)
    assert.deepEqual(modifiedParsed.connect?.endpoints, ['tcp/192.168.1.100:8000']);
  });

  it('updates live JSON5 when router listen endpoints IP/Port are modified', () => {
    const store = useConnectionJsonStore.getState();

    const routerConfig = {
      profile_id: 'prof-router-1',
      mode: 'router' as const,
      connect_locators: [],
      listen_locators: ['tcp/0.0.0.0:7448', 'ws/0.0.0.0:8081'],
      custom_config: {
        mode: 'router',
        listen: {
          endpoints: ['tcp/0.0.0.0:7447'],
        },
        transport: {
          unicast: {
            max_sessions: 25,
          },
        },
      },
    };

    const json = store.syncEditFormJson(routerConfig);
    const parsed = JSON.parse(json);

    // Live listen endpoints must match new form inputs
    assert.deepEqual(parsed.listen?.endpoints, ['tcp/0.0.0.0:7448', 'ws/0.0.0.0:8081']);
    // Custom non-standard properties must be merged
    assert.equal(parsed.transport?.unicast?.max_sessions, 25);
  });

  it('fetchNodeConfiguration sets selectedNodeZid and handles empty input cleanly', async () => {
    const store = useConnectionJsonStore.getState();
    const emptyRes = await store.fetchNodeConfiguration('');
    assert.equal(emptyRes, '');
    assert.equal(useConnectionJsonStore.getState().selectedNodeZid, null);

    await store.fetchNodeConfiguration('0123456789abcdef0123456789abcdef');
    assert.equal(useConnectionJsonStore.getState().selectedNodeZid, '0123456789abcdef0123456789abcdef');
  });
});
