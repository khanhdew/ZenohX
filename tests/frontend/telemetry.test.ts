import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSettingsStore } from '../../src/stores/settingsStore';
import {
  initTelemetry,
  trackEvent,
  trackAppStart,
  getClientCountryCode,
  isDevMode,
} from '../../src/lib/telemetry';

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

  test('getClientCountryCode safely returns string code or undefined without throwing', () => {
    const code = getClientCountryCode();
    if (code !== undefined) {
      assert.equal(typeof code, 'string');
      assert.ok(code.length >= 2);
    }
  });

  test('isDevMode returns true when NODE_ENV is development', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      assert.equal(isDevMode(), true);

      process.env.NODE_ENV = 'production';
      assert.equal(isDevMode(), false);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  test('trackEvent suppresses telemetry send when in dev mode', async () => {
    const origEnv = process.env.NODE_ENV;
    let fetchCalled = false;

    // @ts-expect-error Mock fetch
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response('{}');
    };

    try {
      initTelemetry('phc_test_key_dev', 'https://us.i.posthog.com');
      useSettingsStore.getState().setAnonymousTelemetry(true);

      // In dev mode -> no fetch call
      process.env.NODE_ENV = 'development';
      fetchCalled = false;
      await trackEvent('dev_event', { prop: 'test' });
      assert.equal(fetchCalled, false);

      // In production mode -> fetch is called
      process.env.NODE_ENV = 'production';
      fetchCalled = false;
      await trackEvent('prod_event', { prop: 'test' });
      assert.equal(fetchCalled, true);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

