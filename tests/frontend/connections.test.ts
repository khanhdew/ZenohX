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
});
