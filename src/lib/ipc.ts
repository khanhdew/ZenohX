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

/**
 * IPC Layer with Environment Checks
 */

import * as tauri from './tauri';
import type { SessionInfo, MdnsStatus } from '../types/zenoh';

export function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window
  );
}

export async function connectNodeByZid(zid: string): Promise<SessionInfo> {
  if (isTauriAvailable()) {
    return tauri.connectNodeByZid(zid);
  }
  throw new Error('Tauri IPC is not available');
}

export async function getMdnsStatus(): Promise<MdnsStatus> {
  if (isTauriAvailable()) {
    return tauri.getMdnsStatus();
  }
  return {
    enabled: true,
    active_hostname: 'zenohx.local',
    configured_hostname: 'zenohx',
    port: 7447,
    addresses: ['127.0.0.1'],
    is_conflict: false,
  };
}

export async function setMdnsConfig(enabled: boolean, hostname: string): Promise<MdnsStatus> {
  if (isTauriAvailable()) {
    return tauri.setMdnsConfig(enabled, hostname);
  }
  const cleanHost = hostname.replace(/\.local\.?$/i, '').trim() || 'zenohx';
  return {
    enabled,
    active_hostname: `${cleanHost}.local`,
    configured_hostname: cleanHost,
    port: 7447,
    addresses: ['127.0.0.1'],
    is_conflict: false,
  };
}

export async function refreshMdnsInterfaces(): Promise<MdnsStatus> {
  if (isTauriAvailable()) {
    return tauri.refreshMdnsInterfaces();
  }
  return {
    enabled: true,
    active_hostname: 'zenohx.local',
    configured_hostname: 'zenohx',
    port: 7447,
    addresses: ['127.0.0.1'],
    is_conflict: false,
  };
}

export * from './tauri';

