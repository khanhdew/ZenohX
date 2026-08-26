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

// tests/frontend/adminSpaceParser.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminSpaceEntries } from '../../src/lib/topology/adminSpaceParser';
import type { AdminSpaceEntry } from '../../src/types/topology';

describe('Admin Space Parser', () => {
  it('parses session info entry into remote node structure', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/a1b2c3d4e5f67890/session/info',
        zid: 'a1b2c3d4e5f67890',
        category: 'info',
        payloadJson: JSON.stringify({
          zid: 'a1b2c3d4e5f67890',
          whatami: 'Router',
          version: '1.7.2',
          locators: ['tcp/172.66.1.1:7447', 'tls/cloud.zenoh.io:7446'],
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    assert.equal(parsed.nodes.size, 1);
    const node = parsed.nodes.get('a1b2c3d4e5f67890');
    assert.ok(node);
    assert.equal(node.whatami, 'router');
    assert.equal(node.version, '1.7.2');
    assert.deepEqual(node.locators, ['tcp/172.66.1.1:7447', 'tls/cloud.zenoh.io:7446']);
  });

  it('parses session link entries into remote links and node links', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/a1b2c3d4e5f67890/session/link/0',
        zid: 'a1b2c3d4e5f67890',
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/172.66.1.1:7447',
          dst: 'tcp/192.168.1.50:54321',
          is_streamed: true,
          mtu: 65535,
          interfaces: ['172.66.1.1', '192.168.1.50'],
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    assert.equal(parsed.nodes.size, 1);
    assert.equal(parsed.links.length, 1);
    assert.equal(parsed.links[0].sourceZid, 'a1b2c3d4e5f67890');
    assert.equal(parsed.links[0].srcLocator, 'tcp/172.66.1.1:7447');
    assert.equal(parsed.links[0].dstLocator, 'tcp/192.168.1.50:54321');
    assert.equal(parsed.links[0].mtu, 65535);
  });

  it('parses router neighbor relations into bidirectional mesh topology', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/a1b2c3d4e5f67890/router/fedcba9876543210',
        zid: 'a1b2c3d4e5f67890',
        category: 'router',
        payloadJson: '{}',
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    assert.equal(parsed.nodes.size, 2);
    const nodeA = parsed.nodes.get('a1b2c3d4e5f67890');
    const nodeB = parsed.nodes.get('fedcba9876543210');

    assert.ok(nodeA);
    assert.ok(nodeB);
    assert.ok(nodeA.neighbors.includes('fedcba9876543210'));
    assert.ok(nodeB.neighbors.includes('a1b2c3d4e5f67890'));
  });
});
