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

import { useSettingsStore, applyThemeToDom } from '../../src/stores/settingsStore';
import { getMdnsStatus, setMdnsConfig, refreshMdnsInterfaces } from '../../src/lib/ipc';
import type { MdnsStatus } from '../../src/types/zenoh';

describe('Settings Store', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
    mockInvokeHandler = async () => undefined;
  });

  test('initializes with default preferences', () => {
    const state = useSettingsStore.getState();
    assert.equal(state.theme, 'dark');
    assert.equal(state.compactMode, false);
    assert.equal(state.codeFont, 'mono');
    assert.equal(state.autoCheckUpdates, true);
    assert.equal(state.updateChannel, 'stable');
    assert.equal(state.autoDownload, true);
    assert.equal(state.defaultPayloadEncoding, 'json');
    assert.equal(state.maxMessageBuffer, 1000);
    assert.equal(state.defaultQueryTimeoutMs, 3000);
    assert.equal(state.anonymousTelemetry, true);
    assert.equal(state.mdnsEnabled, true);
    assert.equal(state.mdnsHostname, 'zenohx');
    assert.equal(state.mdnsStatus, null);
    assert.equal(state.isMdnsLoading, false);
    assert.equal(state.isLoadingMdns, false);
    assert.equal(state.mdnsError, null);
  });

  test('updates appearance settings', () => {
    const { setTheme, setCompactMode, setCodeFont } = useSettingsStore.getState();

    setTheme('light');
    assert.equal(useSettingsStore.getState().theme, 'light');

    setCompactMode(true);
    assert.equal(useSettingsStore.getState().compactMode, true);

    setCodeFont('jetbrains');
    assert.equal(useSettingsStore.getState().codeFont, 'jetbrains');
  });

  test('updates auto-update preferences', () => {
    const { setAutoCheckUpdates, setUpdateChannel, setAutoDownload, setLastCheckedUpdate } =
      useSettingsStore.getState();

    setAutoCheckUpdates(false);
    assert.equal(useSettingsStore.getState().autoCheckUpdates, false);

    setUpdateChannel('beta');
    assert.equal(useSettingsStore.getState().updateChannel, 'beta');

    setAutoDownload(true);
    assert.equal(useSettingsStore.getState().autoDownload, true);

    const now = Date.now();
    setLastCheckedUpdate(now);
    assert.equal(useSettingsStore.getState().lastCheckedUpdate, now);
  });

  test('updates general and protocol defaults', () => {
    const { setDefaultPayloadEncoding, setMaxMessageBuffer, setDefaultQueryTimeoutMs } =
      useSettingsStore.getState();

    setDefaultPayloadEncoding('cbor');
    assert.equal(useSettingsStore.getState().defaultPayloadEncoding, 'cbor');

    setMaxMessageBuffer(5000);
    assert.equal(useSettingsStore.getState().maxMessageBuffer, 5000);

    setDefaultQueryTimeoutMs(5000);
    assert.equal(useSettingsStore.getState().defaultQueryTimeoutMs, 5000);
  });

  test('updates mDNS direct setters', () => {
    const { setMdnsEnabled, setMdnsHostname } = useSettingsStore.getState();

    setMdnsEnabled(false);
    assert.equal(useSettingsStore.getState().mdnsEnabled, false);

    setMdnsHostname('my-robot');
    assert.equal(useSettingsStore.getState().mdnsHostname, 'my-robot');
  });

  test('fetchMdnsStatus fetches and populates status from backend', async () => {
    const mockStatus: MdnsStatus = {
      enabled: true,
      active_hostname: 'zenohx-host.local',
      configured_hostname: 'zenohx-host',
      port: 7447,
      addresses: ['192.168.1.50', '10.0.0.1'],
      is_conflict: false,
    };

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'get_mdns_status') return mockStatus;
      return undefined;
    };

    await useSettingsStore.getState().fetchMdnsStatus();

    const state = useSettingsStore.getState();
    assert.deepEqual(state.mdnsStatus, mockStatus);
    assert.equal(state.mdnsEnabled, true);
    assert.equal(state.mdnsHostname, 'zenohx-host');
    assert.equal(state.isMdnsLoading, false);
    assert.equal(state.isLoadingMdns, false);
    assert.equal(state.mdnsError, null);
  });

  test('fetchMdnsStatus handles IPC errors gracefully', async () => {
    mockInvokeHandler = async (cmd) => {
      if (cmd === 'get_mdns_status') {
        throw new Error('mDNS daemon unreachable');
      }
      return undefined;
    };

    await useSettingsStore.getState().fetchMdnsStatus();

    const state = useSettingsStore.getState();
    assert.equal(state.mdnsStatus, null);
    assert.equal(state.isMdnsLoading, false);
    assert.equal(state.isLoadingMdns, false);
    assert.equal(state.mdnsError, 'mDNS daemon unreachable');
  });

  test('updateMdnsConfig invokes set_mdns_config and updates store state', async () => {
    let invokedWith: Record<string, unknown> | undefined;

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'set_mdns_config') {
        invokedWith = args;
        const enabled = args?.enabled as boolean;
        const hostname = args?.hostname as string;
        const status: MdnsStatus = {
          enabled,
          active_hostname: enabled ? `${hostname}.local` : '',
          configured_hostname: hostname,
          port: 7447,
          addresses: enabled ? ['192.168.1.10'] : [],
          is_conflict: false,
        };
        return status;
      }
      return undefined;
    };

    await useSettingsStore.getState().updateMdnsConfig(true, 'rover-alpha');

    assert.deepEqual(invokedWith, { enabled: true, hostname: 'rover-alpha' });
    const state = useSettingsStore.getState();
    assert.equal(state.mdnsEnabled, true);
    assert.equal(state.mdnsHostname, 'rover-alpha');
    assert.ok(state.mdnsStatus);
    assert.equal(state.mdnsStatus.active_hostname, 'rover-alpha.local');
    assert.equal(state.isMdnsLoading, false);
    assert.equal(state.mdnsError, null);
  });

  test('updateMdnsSettings aliases updateMdnsConfig', async () => {
    let invokedCmd = '';

    mockInvokeHandler = async (cmd, args) => {
      if (cmd === 'set_mdns_config') {
        invokedCmd = cmd;
        const status: MdnsStatus = {
          enabled: args?.enabled as boolean,
          active_hostname: 'alias-node.local',
          configured_hostname: args?.hostname as string,
          port: 7447,
          addresses: ['127.0.0.1'],
          is_conflict: false,
        };
        return status;
      }
      return undefined;
    };

    await useSettingsStore.getState().updateMdnsSettings(true, 'alias-node');

    assert.equal(invokedCmd, 'set_mdns_config');
    assert.equal(useSettingsStore.getState().mdnsHostname, 'alias-node');
  });

  test('refreshMdnsInterfaces invokes refresh_mdns_interfaces and updates status', async () => {
    const refreshedStatus: MdnsStatus = {
      enabled: true,
      active_hostname: 'zenohx.local',
      configured_hostname: 'zenohx',
      port: 7447,
      addresses: ['192.168.1.120', '10.0.4.15'],
      is_conflict: false,
    };

    mockInvokeHandler = async (cmd) => {
      if (cmd === 'refresh_mdns_interfaces') return refreshedStatus;
      return undefined;
    };

    await useSettingsStore.getState().refreshMdnsInterfaces();

    const state = useSettingsStore.getState();
    assert.deepEqual(state.mdnsStatus, refreshedStatus);
    assert.equal(state.isMdnsLoading, false);
    assert.equal(state.mdnsError, null);
  });

  test('resets settings to defaults including mDNS settings', () => {
    const state = useSettingsStore.getState();
    state.setTheme('light');
    state.setCompactMode(true);
    state.setUpdateChannel('nightly');
    state.setMaxMessageBuffer(200);
    state.setMdnsEnabled(false);
    state.setMdnsHostname('custom-temp');

    state.resetToDefaults();

    const resetState = useSettingsStore.getState();
    assert.equal(resetState.theme, 'dark');
    assert.equal(resetState.compactMode, false);
    assert.equal(resetState.updateChannel, 'stable');
    assert.equal(resetState.maxMessageBuffer, 1000);
    assert.equal(resetState.mdnsEnabled, true);
    assert.equal(resetState.mdnsHostname, 'zenohx');
    assert.equal(resetState.mdnsStatus, null);
  });

  test('applyThemeToDom handles non-DOM environment gracefully', () => {
    assert.doesNotThrow(() => {
      applyThemeToDom('dark');
      applyThemeToDom('light');
      applyThemeToDom('system');
    });
  });

  test('browser mock fallbacks for mDNS IPC functions', async () => {
    // Save original tauri internals
    const originalInternals = (globalThis.window as any).__TAURI_INTERNALS__;
    delete (globalThis.window as any).__TAURI_INTERNALS__;

    try {
      const defaultStatus = await getMdnsStatus();
      assert.equal(defaultStatus.enabled, true);
      assert.equal(defaultStatus.active_hostname, 'zenohx.local');
      assert.equal(defaultStatus.configured_hostname, 'zenohx');
      assert.deepEqual(defaultStatus.addresses, ['127.0.0.1']);

      const updated = await setMdnsConfig(false, 'custom.local');
      assert.equal(updated.enabled, false);
      assert.equal(updated.active_hostname, 'custom.local');
      assert.equal(updated.configured_hostname, 'custom');

      const refreshed = await refreshMdnsInterfaces();
      assert.equal(refreshed.enabled, true);
      assert.equal(refreshed.active_hostname, 'zenohx.local');
    } finally {
      // Restore tauri internals
      (globalThis.window as any).__TAURI_INTERNALS__ = originalInternals;
    }
  });

  test('sanitizeHostname removes .local suffix and cleans input', async () => {
    const { sanitizeHostname } = await import('../../src/components/settings/tabs/NetworkTab');
    assert.equal(sanitizeHostname('zenohx.local'), 'zenohx');
    assert.equal(sanitizeHostname('my-robot.local'), 'my-robot');
    assert.equal(sanitizeHostname('  ROBOT-NODE.local  '), 'robot-node');
    assert.equal(sanitizeHostname('node-1'), 'node-1');
  });

  test('validateHostname enforces RFC 1123 naming rules', async () => {
    const { validateHostname } = await import('../../src/components/settings/tabs/NetworkTab');
    assert.equal(validateHostname('zenohx').isValid, true);
    assert.equal(validateHostname('robot-1').isValid, true);
    assert.equal(validateHostname('').isValid, false);
    assert.equal(validateHostname('-invalid').isValid, false);
    assert.equal(validateHostname('invalid-').isValid, false);
    assert.equal(validateHostname('invalid_char').isValid, false);
    assert.equal(validateHostname('has space').isValid, false);
  });
});

