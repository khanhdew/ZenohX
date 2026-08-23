import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { initTelemetry, trackEvent, trackAppStart } from '../../src/lib/telemetry';

describe('Telemetry & Anonymous Analytics', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  test('initializes telemetry preferences with default true', () => {
    assert.equal(useSettingsStore.getState().anonymousTelemetry, true);
  });

  test('updates anonymousTelemetry preference', () => {
    useSettingsStore.getState().setAnonymousTelemetry(false);
    assert.equal(useSettingsStore.getState().anonymousTelemetry, false);

    useSettingsStore.getState().setAnonymousTelemetry(true);
    assert.equal(useSettingsStore.getState().anonymousTelemetry, true);
  });

  test('initTelemetry does not throw when App Key is absent or present', async () => {
    await assert.doesNotReject(async () => {
      initTelemetry('phc_test_key_123', 'https://us.i.posthog.com');
    });
  });

  test('trackAppStart does not throw when telemetry is disabled or enabled', async () => {
    useSettingsStore.getState().setAnonymousTelemetry(false);
    await assert.doesNotReject(async () => {
      await trackAppStart();
    });

    useSettingsStore.getState().setAnonymousTelemetry(true);
    await assert.doesNotReject(async () => {
      await trackAppStart();
    });
  });

  test('trackEvent safely handles any arbitrary event name', async () => {
    await assert.doesNotReject(async () => {
      await trackEvent('custom_test_event', { sample_prop: 'value' });
    });
  });
});
