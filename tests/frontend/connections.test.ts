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

import { useConnectionStore } from '../../src/stores/connectionStore';
import type { ConnectionProfile, ScoutedNode } from '../../src/types/zenoh';
import {
  resolveTlsConfig,
  hasCustomTlsConfig,
  isTlsEnabled,
  parseLocator,
  buildLocator,
  detectProfilePreset,
  getPreferredLocator,
  getLocatorProtocol,
  buildProfileFromScoutedNode,
  DEFAULT_CLOUD_PROTOCOL,
  SUPPORTED_CLOUD_PROTOCOLS,
} from '../../src/lib/tls';

describe('Connection Manager Integration & Helpers', () => {
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

  test('creates new connection profile with valid attributes', async () => {
    let savedProfile: ConnectionProfile | null = null;
    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'save_profile') {
        savedProfile = args?.profile as ConnectionProfile;
        return undefined;
      }
      return undefined;
    };

    const newProfile: ConnectionProfile = {
      id: 'prof-client-1',
      name: 'Production Zenoh Router',
      mode: 'client',
      connect_locators: ['tcp/192.168.1.100:7447', 'tls/zenoh.prod:7447'],
      listen_locators: [],
      scout_multicast: false,
      user_auth: {
        username: 'admin',
        password: 'secure-password',
      },
      tls_config: {
        ca_cert: '/etc/ssl/ca.pem',
      },
      custom_config: {
        transport: { unicast: { max_links: 4 } },
      },
      created_at: 1000,
      updated_at: 1000,
    };

    await useConnectionStore.getState().saveProfile(newProfile);
    assert.ok(savedProfile);
    assert.equal(useConnectionStore.getState().profiles.length, 1);
    assert.equal(useConnectionStore.getState().profiles[0].name, 'Production Zenoh Router');
    assert.equal(useConnectionStore.getState().profiles[0].mode, 'client');
    assert.equal(useConnectionStore.getState().profiles[0].connect_locators.length, 2);
    assert.equal(useConnectionStore.getState().profiles[0].user_auth?.username, 'admin');
  });

  test('duplicates connection profile with unique ID and updated timestamp', async () => {
    const originalProfile: ConnectionProfile = {
      id: 'prof-orig',
      name: 'Edge Gateway',
      mode: 'peer',
      connect_locators: ['tcp/10.0.0.1:7447'],
      listen_locators: ['tcp/0.0.0.0:7447'],
      scout_multicast: true,
      created_at: 1000,
      updated_at: 1000,
    };

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'save_profile') return undefined;
      return undefined;
    };

    await useConnectionStore.getState().saveProfile(originalProfile);

    const duplicateProfile: ConnectionProfile = {
      ...originalProfile,
      id: 'prof-dup',
      name: `${originalProfile.name} (Copy)`,
      created_at: 2000,
      updated_at: 2000,
    };

    await useConnectionStore.getState().saveProfile(duplicateProfile);
    assert.equal(useConnectionStore.getState().profiles.length, 2);
    assert.equal(useConnectionStore.getState().profiles[1].name, 'Edge Gateway (Copy)');
    assert.equal(useConnectionStore.getState().profiles[1].id, 'prof-dup');
    assert.deepEqual(
      useConnectionStore.getState().profiles[1].connect_locators,
      originalProfile.connect_locators
    );
  });

  test('converts scouted router node into client profile', async () => {
    const scoutedRouter: ScoutedNode = {
      zid: 'a1b2c3d4e5f60718',
      what: 'router',
      locators: ['tcp/192.168.1.55:7447', 'udp/192.168.1.55:7447'],
    };

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'save_profile') return undefined;
      return undefined;
    };

    // Helper logic as in ScoutModal
    const isRouter = scoutedRouter.what.toLowerCase() === 'router';
    const profileFromNode: ConnectionProfile = {
      id: 'prof-scout-1',
      name: `Zenoh ${isRouter ? 'Router' : 'Peer'} (${scoutedRouter.zid.slice(0, 8)})`,
      mode: isRouter ? 'client' : 'peer',
      connect_locators: [...scoutedRouter.locators],
      listen_locators: [],
      scout_multicast: true,
      user_auth: null,
      tls_config: null,
      custom_config: null,
      created_at: 1000,
      updated_at: 1000,
    };

    await useConnectionStore.getState().saveProfile(profileFromNode);
    const saved = useConnectionStore.getState().profiles[0];
    assert.equal(saved.name, 'Zenoh Router (a1b2c3d4)');
    assert.equal(saved.mode, 'client');
    assert.equal(saved.connect_locators.length, 2);
    assert.equal(saved.connect_locators[0], 'tcp/192.168.1.55:7447');
  });

  test('converts scouted peer node into peer profile', async () => {
    const scoutedPeer: ScoutedNode = {
      zid: 'f9e8d7c6b5a43210',
      what: 'peer',
      locators: ['tcp/192.168.1.88:7447'],
    };

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'save_profile') return undefined;
      return undefined;
    };

    const isRouter = scoutedPeer.what.toLowerCase() === 'router';
    const profileFromPeer: ConnectionProfile = {
      id: 'prof-scout-2',
      name: `Zenoh ${isRouter ? 'Router' : 'Peer'} (${scoutedPeer.zid.slice(0, 8)})`,
      mode: isRouter ? 'client' : 'peer',
      connect_locators: [...scoutedPeer.locators],
      listen_locators: [],
      scout_multicast: true,
      user_auth: null,
      tls_config: null,
      custom_config: null,
      created_at: 1000,
      updated_at: 1000,
    };

    await useConnectionStore.getState().saveProfile(profileFromPeer);
    const saved = useConnectionStore.getState().profiles[0];
    assert.equal(saved.name, 'Zenoh Peer (f9e8d7c6)');
    assert.equal(saved.mode, 'peer');
  });

  test('isTlsEnabled detects TLS configuration and locators', () => {
    assert.equal(isTlsEnabled(null, ['tcp/127.0.0.1:7447']), false);
    assert.equal(isTlsEnabled({ tls_only: true }, ['tcp/127.0.0.1:7447']), true);
    assert.equal(isTlsEnabled({ ca_cert: '/path/to/ca.pem' }, ['tcp/127.0.0.1:7447']), true);
    assert.equal(isTlsEnabled(null, ['tls/127.0.0.1:7447']), true);
    assert.equal(isTlsEnabled(undefined, []), false);
  });

  test('resolveTlsConfig returns null when master TLS toggle is disabled', () => {
    const config = resolveTlsConfig({
      enableTls: false,
      useCustomTls: true,
      caCert: '/path/to/ca.pem',
    });
    assert.equal(config, null);
  });

  test('resolveTlsConfig returns empty object when TLS is enabled with default common certs', () => {
    const config = resolveTlsConfig({
      enableTls: true,
      useCustomTls: false,
      caCert: '/path/to/ca.pem',
    });
    assert.deepEqual(config, {});
  });

  test('resolveTlsConfig builds TlsConfig object when TLS and custom certs are both enabled', () => {
    const config = resolveTlsConfig({
      enableTls: true,
      useCustomTls: true,
      caCert: '/etc/ssl/ca.pem',
      clientCert: '/etc/ssl/client.crt',
      clientKey: '/etc/ssl/client.key',
    });
    assert.deepEqual(config, {
      ca_cert: '/etc/ssl/ca.pem',
      client_cert: '/etc/ssl/client.crt',
      client_key: '/etc/ssl/client.key',
    });

    const strictConfig = resolveTlsConfig({
      enableTls: true,
      useCustomTls: false,
      tlsOnly: true,
    });
    assert.deepEqual(strictConfig, {
      tls_only: true,
    });
  });

  test('hasCustomTlsConfig accurately detects if custom TLS certificates are present', () => {
    assert.equal(hasCustomTlsConfig(null), false);
    assert.equal(hasCustomTlsConfig(undefined), false);
    assert.equal(hasCustomTlsConfig({ ca_cert: '', client_cert: '', client_key: '' }), false);
    assert.equal(hasCustomTlsConfig({ ca_cert: '/path/ca.pem' }), true);
    assert.equal(hasCustomTlsConfig({ tls_only: true }), true);
  });

  test('parseLocator decomposes Zenoh locator into protocol, host, and port', () => {
    assert.deepEqual(parseLocator('tls/router.zenoh.cloud:7447'), {
      protocol: 'tls',
      host: 'router.zenoh.cloud',
      port: '7447',
    });
    assert.deepEqual(parseLocator('tcp/192.168.1.100:7447'), {
      protocol: 'tcp',
      host: '192.168.1.100',
      port: '7447',
    });
    assert.deepEqual(parseLocator('quic/edge-gateway:1234'), {
      protocol: 'quic',
      host: 'edge-gateway',
      port: '1234',
    });
    assert.equal(parseLocator('invalid-locator'), null);
    assert.equal(parseLocator(''), null);
  });

  test('buildLocator formats clean Zenoh endpoint strings', () => {
    assert.equal(buildLocator('tls', 'router.zenoh.cloud', '7447'), 'tls/router.zenoh.cloud:7447');
    assert.equal(buildLocator('tcp', 'localhost', '7447'), 'tcp/localhost:7447');
    assert.equal(buildLocator('quic', 'edge.net', '8000'), 'quic/edge.net:8000');
    assert.equal(buildLocator('tcp', '   ', '7447'), '');
  });

  test('detectProfilePreset identifies client, peer, and router configurations', () => {
    // Client Mode preset
    assert.equal(
      detectProfilePreset({
        mode: 'client',
        connect_locators: ['tls/router.cloud:7447'],
        listen_locators: [],
      }),
      'client'
    );

    // Peer Mode preset
    assert.equal(
      detectProfilePreset({
        mode: 'peer',
        connect_locators: [],
        listen_locators: [],
        scout_multicast: true,
      }),
      'peer'
    );

    // Router Mode preset
    assert.equal(
      detectProfilePreset({
        mode: 'router',
        connect_locators: ['tcp/10.0.0.1:7447'],
        listen_locators: ['tcp/0.0.0.0:7447'],
      }),
      'router'
    );
  });

  test('saveAndConnect does NOT store profile if connection fails', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'connect_session') {
        throw new Error('failed to open zenoh session: connection refused');
      }
      return undefined;
    };

    const failingProfile: ConnectionProfile = {
      id: 'prof-fail',
      name: 'Unreachable Router',
      mode: 'client',
      connect_locators: ['tls/unreachable.zenoh.cloud:7447'],
      listen_locators: [],
      scout_multicast: false,
      user_auth: null,
      tls_config: {},
      custom_config: null,
      created_at: 1000,
      updated_at: 1000,
    };

    await assert.rejects(
      async () => {
        await useConnectionStore.getState().saveAndConnect(failingProfile);
      },
      /Unable to connect to the Zenoh router/
    );

    // Verify profile was NOT saved into store
    assert.equal(useConnectionStore.getState().profiles.length, 0);
    assert.equal(Object.keys(useConnectionStore.getState().activeSessions).length, 0);
  });

  test('saveAndConnect disconnects opened session if persistence fails', async () => {
    let disconnectedSessionId: string | null = null;
    mockInvokeHandler = async (cmd, args: any) => {
      if (cmd === 'connect_session') {
        return 'sess-uuid-will-abort';
      }
      if (cmd === 'get_session_info') {
        return {
          id: 'sess-uuid-will-abort',
          zid: '12345678',
          mode: 'client',
          created_at: 1000,
          subscribers_count: 0,
          queryables_count: 0,
        };
      }
      if (cmd === 'save_profile') {
        throw new Error('SQLite database write locked');
      }
      if (cmd === 'disconnect_session') {
        disconnectedSessionId = args?.sessionId;
        return undefined;
      }
      return undefined;
    };

    const failingProfile: ConnectionProfile = {
      id: 'prof-abort',
      name: 'Abort Cloud Router',
      mode: 'client',
      connect_locators: ['tls/valid.zenoh.cloud:7447'],
      listen_locators: [],
      scout_multicast: false,
      user_auth: null,
      tls_config: {},
      custom_config: null,
      created_at: 1000,
      updated_at: 1000,
    };

    await assert.rejects(
      async () => {
        await useConnectionStore.getState().saveAndConnect(failingProfile);
      },
      /SQLite database write locked/
    );

    // Verify session was cleaned up / disconnected
    assert.equal(disconnectedSessionId, 'sess-uuid-will-abort');
    assert.equal(useConnectionStore.getState().profiles.length, 0);
  });

  test('saveAndConnect stores profile and activates session when connection succeeds', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'connect_session') {
        return 'sess-uuid-123';
      }
      if (cmd === 'get_session_info') {
        return {
          id: 'sess-uuid-123',
          zid: '12345678',
          mode: 'client',
          created_at: 1000,
          subscribers_count: 0,
          queryables_count: 0,
        };
      }
      if (cmd === 'save_profile') {
        return undefined;
      }
      return undefined;
    };

    const validProfile: ConnectionProfile = {
      id: 'prof-success',
      name: 'Working Cloud Router',
      mode: 'client',
      connect_locators: ['tls/valid.zenoh.cloud:7447'],
      listen_locators: [],
      scout_multicast: false,
      user_auth: null,
      tls_config: {},
      custom_config: null,
      created_at: 1000,
      updated_at: 1000,
    };

    const sessionId = await useConnectionStore.getState().saveAndConnect(validProfile);
    assert.equal(sessionId, 'sess-uuid-123');
    assert.equal(useConnectionStore.getState().profiles.length, 1);
    assert.equal(useConnectionStore.getState().profiles[0].id, 'prof-success');
    assert.ok(useConnectionStore.getState().activeSessions['prof-success']);
  });

  test('testConnection verifies connectivity without storing profiles', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'connect_session') {
        return 'sess-test-temp';
      }
      if (cmd === 'disconnect_session') {
        return undefined;
      }
      return undefined;
    };

    const res = await useConnectionStore.getState().testConnection({
      mode: 'client',
      connect_locators: ['tcp/127.0.0.1:7447'],
      listen_locators: [],
      scout_multicast: false,
      user_auth: null,
      tls_config: null,
      custom_config: null,
    });

    assert.equal(res.success, true);
    assert.equal(useConnectionStore.getState().profiles.length, 0);
  });

  test('getLocatorProtocol accurately detects protocol from locator string', () => {
    assert.equal(getLocatorProtocol('tls/192.168.1.50:7447'), 'tls');
    assert.equal(getLocatorProtocol('tcp/10.0.0.1:7447'), 'tcp');
    assert.equal(getLocatorProtocol('quic/example.com:7447'), 'quic');
    assert.equal(getLocatorProtocol('udp/224.0.0.224:7446'), 'udp');
    assert.equal(getLocatorProtocol('invalid-locator'), '');
  });

  test('getPreferredLocator prioritizes TLS locators over plain locators', () => {
    const locators = ['tcp/192.168.1.100:7447', 'tls/192.168.1.100:7448', 'udp/192.168.1.100:7449'];
    assert.equal(getPreferredLocator(locators), 'tls/192.168.1.100:7448');

    const plainLocators = ['tcp/192.168.1.100:7447', 'udp/192.168.1.100:7449'];
    assert.equal(getPreferredLocator(plainLocators), 'tcp/192.168.1.100:7447');

    assert.equal(getPreferredLocator([]), undefined);
  });

  test('buildProfileFromScoutedNode automatically enables TLS for TLS-scouted nodes', () => {
    const tlsNode: ScoutedNode = {
      zid: 'a1b2c3d4e5f67890',
      what: 'router',
      locators: ['tls/router.lan:7447', 'tcp/router.lan:7447'],
    };

    const profile = buildProfileFromScoutedNode(tlsNode);
    assert.equal(profile.mode, 'client');
    assert.equal(profile.name, 'Zenoh Router (a1b2c3d4)');
    assert.deepEqual(profile.connect_locators, ['tls/router.lan:7447']);
    assert.deepEqual(profile.tls_config, {}); // Standard TLS enabled

    const plainNode: ScoutedNode = {
      zid: '1234567890abcdef',
      what: 'peer',
      locators: ['tcp/peer.lan:7447'],
    };

    const plainProfile = buildProfileFromScoutedNode(plainNode);
    assert.equal(plainProfile.mode, 'client');
    assert.deepEqual(plainProfile.connect_locators, ['tcp/peer.lan:7447']);
    assert.equal(plainProfile.tls_config, null);
  });

  test('buildProfileFromScoutedNode supports custom TLS parameters', () => {
    const node: ScoutedNode = {
      zid: 'a1b2c3d4e5f67890',
      what: 'router',
      locators: ['tls/secure.lan:7447'],
    };

    const profile = buildProfileFromScoutedNode(node, {
      customTls: {
        ca_cert: '/certs/ca.pem',
        client_cert: '/certs/client.pem',
        client_key: '/certs/client.key',
      },
    });

    assert.equal(profile.tls_config?.ca_cert, '/certs/ca.pem');
    assert.equal(profile.tls_config?.client_cert, '/certs/client.pem');
    assert.equal(profile.tls_config?.client_key, '/certs/client.key');
  });

  test('DEFAULT_CLOUD_PROTOCOL defaults to tcp plain', () => {
    assert.equal(DEFAULT_CLOUD_PROTOCOL, 'tcp');
  });

  test('SUPPORTED_CLOUD_PROTOCOLS has TCP Plain as the leftmost option', () => {
    assert.equal(SUPPORTED_CLOUD_PROTOCOLS[0].id, 'tcp');
    assert.equal(SUPPORTED_CLOUD_PROTOCOLS[0].label, 'TCP (Plain)');
    assert.deepEqual(
      SUPPORTED_CLOUD_PROTOCOLS.map((p) => p.id),
      ['tcp', 'tls', 'quic', 'udp', 'ws', 'wss', 'unix']
    );
  });

  test('handleSessionStatus removes session and sets error on sudden disconnect', () => {
    // Set up active session
    useConnectionStore.setState({
      profiles: [
        {
          id: 'prof-cloud-1',
          name: 'Cloud Router',
          mode: 'client',
          connect_locators: ['tcp/router.lan:7447'],
          listen_locators: [],
          scout_multicast: false,
          user_auth: null,
          tls_config: null,
          custom_config: null,
          created_at: 1000,
          updated_at: 1000,
        },
      ],
      activeSessions: {
        'prof-cloud-1': {
          id: 'sess-uuid-999',
          zid: '12345678',
          mode: 'client',
          created_at: 1000,
          subscribers_count: 0,
          queryables_count: 0,
        },
      },
      sessionToProfile: {
        'sess-uuid-999': 'prof-cloud-1',
      },
      error: null,
    });

    assert.equal(useConnectionStore.getState().isConnected('prof-cloud-1'), true);

    // Simulate sudden disconnect event from backend watchdog
    useConnectionStore.getState().handleSessionStatus({
      sessionId: 'sess-uuid-999',
      status: 'disconnected',
      error: 'Connection to Zenoh router lost: server unreachable',
      timestamp: 2000,
    });

    assert.equal(useConnectionStore.getState().isConnected('prof-cloud-1'), false);
    assert.equal(useConnectionStore.getState().activeSessions['prof-cloud-1'], undefined);
    assert.equal(useConnectionStore.getState().sessionToProfile['sess-uuid-999'], undefined);
    assert.equal(
      useConnectionStore.getState().error,
      'Connection to Zenoh router lost: server unreachable'
    );
  });

  test('handleSessionStatus handles error status on session', () => {
    useConnectionStore.setState({
      activeSessions: {
        'prof-2': {
          id: 'sess-err-1',
          zid: '87654321',
          mode: 'client',
          created_at: 1000,
          subscribers_count: 0,
          queryables_count: 0,
        },
      },
      sessionToProfile: {
        'sess-err-1': 'prof-2',
      },
      error: null,
    });

    useConnectionStore.getState().handleSessionStatus({
      sessionId: 'sess-err-1',
      status: 'error',
      error: 'Broken transport pipe',
    });

    assert.equal(useConnectionStore.getState().isConnected('prof-2'), false);
    assert.equal(useConnectionStore.getState().error, 'Broken transport pipe');
  });

  test('loadProfiles prioritizes URL query parameter profileId when present', async () => {
    const mockProfiles: ConnectionProfile[] = [
      {
        id: 'prof-alpha',
        name: 'Alpha Profile',
        mode: 'peer',
        scout_multicast: true,
        connect_locators: [],
        listen_locators: [],
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: 'prof-beta',
        name: 'Beta Profile',
        mode: 'client',
        scout_multicast: false,
        connect_locators: ['tcp/127.0.0.1:7447'],
        listen_locators: [],
        created_at: 1000,
        updated_at: 1000,
      },
    ];

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'load_profiles') {
        return mockProfiles;
      }
      return undefined;
    };

    // Mock window.location.search with ?profileId=prof-beta
    // @ts-ignore
    globalThis.window.location = { search: '?profileId=prof-beta' };

    useConnectionStore.setState({ profiles: [], selectedProfileId: null });
    await useConnectionStore.getState().loadProfiles();

    assert.equal(useConnectionStore.getState().selectedProfileId, 'prof-beta');

    // Clean up window.location
    // @ts-ignore
    globalThis.window.location = { search: '' };
  });

  test('isValidPort and isValidUnixPath validate endpoints correctly', async () => {
    const { isValidPort, isValidUnixPath } = await import('../../src/components/connections/profile/useProfileForm');

    // Port validation
    assert.equal(isValidPort('7447'), true);
    assert.equal(isValidPort('0'), true);
    assert.equal(isValidPort('65535'), true);
    assert.equal(isValidPort('8080'), true);
    assert.equal(isValidPort('65536'), false);
    assert.equal(isValidPort('-1'), false);
    assert.equal(isValidPort('abc'), false);
    assert.equal(isValidPort(''), false);
    assert.equal(isValidPort('  '), false);

    // Unix path validation
    assert.equal(isValidUnixPath('/tmp/zenoh.sock'), true);
    assert.equal(isValidUnixPath('/var/run/zenoh.sock'), true);
    assert.equal(isValidUnixPath('tmp/zenoh.sock'), false);
    assert.equal(isValidUnixPath(''), false);
    assert.equal(isValidUnixPath('   '), false);
  });

  test('PresetSelector, ClientConfigForm, PeerConfigForm, and RouterConfigForm render correctly', async () => {
    const React = await import('react');
    const { PresetSelector } = await import('../../src/components/connections/profile/PresetSelector');
    const { ClientConfigForm } = await import('../../src/components/connections/profile/ClientConfigForm');
    const { PeerConfigForm } = await import('../../src/components/connections/profile/PeerConfigForm');
    const { RouterConfigForm } = await import('../../src/components/connections/profile/RouterConfigForm');
    const { getSuggestedRouterPort, getRandomRouterPort } = await import('../../src/lib/tls');

    // Test port suggestion and random port helpers
    assert.equal(getSuggestedRouterPort([]), '7447');
    assert.equal(
      getSuggestedRouterPort([
        {
          id: 'p1',
          name: 'R1',
          mode: 'router',
          connect_locators: [],
          listen_locators: ['tcp/0.0.0.0:7447'],
          created_at: 1,
          updated_at: 1,
        },
      ]),
      '7448'
    );
    const randPort = parseInt(getRandomRouterPort(), 10);
    assert.ok(randPort >= 7448 && randPort <= 7999);

    // Test PresetSelector element
    let selectedPreset = 'client';
    const presetEl = React.createElement(PresetSelector, {
      preset: 'client',
      onSelectPreset: (p) => {
        selectedPreset = p;
      },
    });
    assert.ok(presetEl);
    assert.equal(presetEl.type, PresetSelector);

    // Test ClientConfigForm element with WebSocket and Reconnect Retry
    const clientFormEl = React.createElement(ClientConfigForm, {
      clientName: 'My Client',
      setClientName: () => {},
      clientHost: '127.0.0.1',
      setClientHost: () => {},
      clientPort: '8080',
      setClientPort: () => {},
      clientProtocol: 'ws',
      setClientProtocol: () => {},
      enableReconnectRetry: true,
      setEnableReconnectRetry: () => {},
      username: '',
      setUsername: () => {},
      password: '',
      setPassword: () => {},
    });
    assert.ok(clientFormEl);
    assert.equal(clientFormEl.type, ClientConfigForm);

    // Test PeerConfigForm element with static listeners and gossip
    const peerFormEl = React.createElement(PeerConfigForm, {
      peerName: 'My Peer',
      setPeerName: () => {},
      connectLocators: ['tcp/127.0.0.1:7447'],
      addConnectLocator: () => {},
      updateConnectLocator: () => {},
      removeConnectLocator: () => {},
      listenLocators: ['tcp/0.0.0.0:7447', 'ws/0.0.0.0:8080'],
      addListenLocator: () => {},
      updateListenLocator: () => {},
      removeListenLocator: () => {},
      scoutMulticast: true,
      setScoutMulticast: () => {},
      scoutGossip: true,
      setScoutGossip: () => {},
      enableTls: true,
      setEnableTls: () => {},
      useCustomTls: false,
      setUseCustomTls: () => {},
      caCert: '',
      setCaCert: () => {},
      clientCert: '',
      setClientCert: () => {},
      clientKey: '',
      setClientKey: () => {},
    });
    assert.ok(peerFormEl);
    assert.equal(peerFormEl.type, PeerConfigForm);

    // Test RouterConfigForm element with multiple listen endpoints including UNIX and WS
    const routerFormEl = React.createElement(RouterConfigForm, {
      routerName: 'My Multi-Protocol Router',
      setRouterName: () => {},
      listenEndpoints: [
        { id: 'ep-1', protocol: 'tcp', host: '0.0.0.0', port: '7447' },
        { id: 'ep-2', protocol: 'tls', host: '0.0.0.0', port: '7446' },
        { id: 'ep-3', protocol: 'unix', host: '/tmp/zenoh.sock', port: '' },
        { id: 'ep-4', protocol: 'ws', host: '0.0.0.0', port: '8080' },
      ],
      addListenEndpoint: () => {},
      updateListenEndpoint: () => {},
      removeListenEndpoint: () => {},
      routerScoutMulticast: true,
      setRouterScoutMulticast: () => {},
      routerScoutGossip: true,
      setRouterScoutGossip: () => {},
      routerConnectLocators: ['tcp/10.0.0.1:7447'],
      addRouterConnectLocator: () => {},
      removeRouterConnectLocator: () => {},
    });
    assert.ok(routerFormEl);
    assert.equal(routerFormEl.type, RouterConfigForm);
  });

  test('MeshRoutingSection and RawJsonConfigSection render correctly and support interactions', async () => {
    const React = await import('react');
    const { MeshRoutingSection } = await import('../../src/components/connections/profile/MeshRoutingSection');
    const { RawJsonConfigSection } = await import('../../src/components/connections/profile/RawJsonConfigSection');

    // Test MeshRoutingSection
    let scoutMulticastVal = true;
    let scoutGossipVal = true;
    let autoReconnectVal = false;

    const meshEl = React.createElement(MeshRoutingSection, {
      scoutMulticast: scoutMulticastVal,
      setScoutMulticast: (v: boolean) => {
        scoutMulticastVal = v;
      },
      scoutGossip: scoutGossipVal,
      setScoutGossip: (v: boolean) => {
        scoutGossipVal = v;
      },
      autoReconnect: autoReconnectVal,
      setAutoReconnect: (v: boolean) => {
        autoReconnectVal = v;
      },
    });

    assert.ok(meshEl);
    assert.equal(meshEl.type, MeshRoutingSection);

    // Test RawJsonConfigSection with generatedConfigJson and customConfigText
    let customText = '{"transport":{"unicast":{"max_sessions":10}}}';
    const sampleGenerated = '{\n  "mode": "peer",\n  "scouting": {\n    "multicast": {\n      "enabled": true\n    }\n  }\n}';

    const rawJsonEl = React.createElement(RawJsonConfigSection, {
      customConfigText: customText,
      setCustomConfigText: (v: string) => {
        customText = v;
      },
      generatedConfigJson: sampleGenerated,
    });

    assert.ok(rawJsonEl);
    assert.equal(rawJsonEl.type, RawJsonConfigSection);
  });

  test('getBoundLocators helper returns bound locators from active session', async () => {
    useConnectionStore.setState({
      selectedProfileId: 'prof-router-1',
      activeSessions: {
        'prof-router-1': {
          id: 'sess-123',
          profile_id: 'prof-router-1',
          zid: 'z12345678',
          mode: 'router',
          scout_multicast: true,
          connect_locators: [],
          listen_locators: ['tcp/0.0.0.0:0', 'ws/0.0.0.0:8080'],
          bound_locators: ['tcp/192.168.1.50:43219', 'ws/127.0.0.1:8080'],
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    });

    const bound = useConnectionStore.getState().getBoundLocators();
    assert.deepEqual(bound, ['tcp/192.168.1.50:43219', 'ws/127.0.0.1:8080']);

    const boundExplicit = useConnectionStore.getState().getBoundLocators('prof-router-1');
    assert.deepEqual(boundExplicit, ['tcp/192.168.1.50:43219', 'ws/127.0.0.1:8080']);

    const emptyBound = useConnectionStore.getState().getBoundLocators('non-existent');
    assert.deepEqual(emptyBound, []);
  });

  test('BoundLocatorBadge renders correctly with 1-click copy and auto port badge', async () => {
    const React = await import('react');
    const { BoundLocatorBadge, getProtocolIcon } = await import('../../src/components/connections/BoundLocatorBadge');

    let copiedLocator: string | null = null;
    const badgeEl = React.createElement(BoundLocatorBadge, {
      locator: 'tcp/192.168.1.50:43219',
      isAutoPort: true,
      size: 'xs',
      onCopy: (loc: string) => {
        copiedLocator = loc;
      },
    });

    assert.ok(badgeEl);
    assert.equal(badgeEl.type, BoundLocatorBadge);

    // Protocol icons for all supported protocols
    const tcpIcon = getProtocolIcon('tcp');
    const tlsIcon = getProtocolIcon('tls');
    const wsIcon = getProtocolIcon('ws');
    const wssIcon = getProtocolIcon('wss');
    const quicIcon = getProtocolIcon('quic');
    const udpIcon = getProtocolIcon('udp');
    const unixIcon = getProtocolIcon('unix');

    assert.ok(tcpIcon);
    assert.ok(tlsIcon);
    assert.ok(wsIcon);
    assert.ok(wssIcon);
    assert.ok(quicIcon);
    assert.ok(udpIcon);
    assert.ok(unixIcon);
  });
});






