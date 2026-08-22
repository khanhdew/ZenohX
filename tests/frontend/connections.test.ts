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
    assert.equal(isTlsEnabled({}, ['tcp/127.0.0.1:7447']), true);
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
  });

  test('hasCustomTlsConfig accurately detects if custom TLS certificates are present', () => {
    assert.equal(hasCustomTlsConfig(null), false);
    assert.equal(hasCustomTlsConfig(undefined), false);
    assert.equal(hasCustomTlsConfig({ ca_cert: '', client_cert: '', client_key: '' }), false);
    assert.equal(hasCustomTlsConfig({ ca_cert: '/path/ca.pem' }), true);
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

  test('detectProfilePreset identifies cloud, local, and custom configurations', () => {
    // Cloud / Remote preset
    assert.equal(
      detectProfilePreset({
        mode: 'client',
        connect_locators: ['tls/router.cloud:7447'],
        listen_locators: [],
      }),
      'cloud'
    );

    // Local LAN preset
    assert.equal(
      detectProfilePreset({
        mode: 'peer',
        connect_locators: [],
        listen_locators: [],
        scout_multicast: true,
      }),
      'local'
    );

    // Custom / Advanced preset
    assert.equal(
      detectProfilePreset({
        mode: 'router',
        connect_locators: ['tcp/10.0.0.1:7447'],
        listen_locators: ['tcp/0.0.0.0:7447'],
      }),
      'custom'
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
      /failed to open zenoh session/
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
    assert.equal(plainProfile.mode, 'peer');
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
});


