import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSettingsStore, applyThemeToDom } from '../../src/stores/settingsStore';

describe('Settings Store', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  test('initializes with default preferences', () => {
    const state = useSettingsStore.getState();
    assert.equal(state.theme, 'dark');
    assert.equal(state.compactMode, false);
    assert.equal(state.codeFont, 'mono');
    assert.equal(state.autoCheckUpdates, true);
    assert.equal(state.updateChannel, 'stable');
    assert.equal(state.autoDownload, false);
    assert.equal(state.defaultPayloadEncoding, 'json');
    assert.equal(state.maxMessageBuffer, 1000);
    assert.equal(state.defaultQueryTimeoutMs, 3000);
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

  test('resets settings to defaults', () => {
    const state = useSettingsStore.getState();
    state.setTheme('light');
    state.setCompactMode(true);
    state.setUpdateChannel('nightly');
    state.setMaxMessageBuffer(200);

    state.resetToDefaults();

    const resetState = useSettingsStore.getState();
    assert.equal(resetState.theme, 'dark');
    assert.equal(resetState.compactMode, false);
    assert.equal(resetState.updateChannel, 'stable');
    assert.equal(resetState.maxMessageBuffer, 1000);
  });

  test('applyThemeToDom handles non-DOM environment gracefully', () => {
    assert.doesNotThrow(() => {
      applyThemeToDom('dark');
      applyThemeToDom('light');
      applyThemeToDom('system');
    });
  });
});
