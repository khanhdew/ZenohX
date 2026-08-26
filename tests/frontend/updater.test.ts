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
import { useUpdateStore } from '../../src/stores/updateStore';
import { useSettingsStore } from '../../src/stores/settingsStore';

describe('Update Store & Workflow', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
    useUpdateStore.getState().resetUpdateState();
  });

  test('initializes with default idle state', () => {
    const state = useUpdateStore.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.availableUpdate, null);
    assert.equal(state.showNotification, false);
    assert.equal(state.skippedConsent, false);
    assert.equal(state.percentage, 0);
  });

  test('skipConsent hides notification and marks skippedConsent true', () => {
    useUpdateStore.setState({
      status: 'downloaded',
      showNotification: true,
      skippedConsent: false,
      version: '0.3.0',
    });

    useUpdateStore.getState().skipConsent();

    const state = useUpdateStore.getState();
    assert.equal(state.showNotification, false);
    assert.equal(state.skippedConsent, true);
    assert.equal(state.status, 'downloaded');
  });

  test('resetUpdateState restores initial state', () => {
    useUpdateStore.setState({
      status: 'downloaded',
      showNotification: true,
      skippedConsent: true,
      version: '0.3.0',
      percentage: 100,
    });

    useUpdateStore.getState().resetUpdateState();

    const state = useUpdateStore.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.showNotification, false);
    assert.equal(state.skippedConsent, false);
    assert.equal(state.version, null);
  });

  test('dismissNotification closes the notification banner', () => {
    useUpdateStore.setState({
      showNotification: true,
    });

    useUpdateStore.getState().dismissNotification();
    assert.equal(useUpdateStore.getState().showNotification, false);
    assert.equal(useUpdateStore.getState().skippedConsent, true);
  });
});
