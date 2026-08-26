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
import type { SessionInfo } from '../types/zenoh';

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

export * from './tauri';
