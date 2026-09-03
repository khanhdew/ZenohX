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

  it('parses session link entries with remote peer/router ZID in payload', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/local-router-zid/session/link/1',
        zid: 'local-router-zid',
        category: 'link',
        payloadJson: JSON.stringify({
          zid: 'remote-router-zid',
          whatami: 'Router',
          src: 'tcp/10.0.0.1:54321',
          dst: 'tcp/10.0.0.2:7447',
          is_streamed: true,
          mtu: 1500,
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    assert.equal(parsed.links.length, 1);
    assert.equal(parsed.links[0].sourceZid, 'local-router-zid');
    assert.equal(parsed.links[0].targetZid, 'remote-router-zid');
    assert.equal(parsed.links[0].dstLocator, 'tcp/10.0.0.2:7447');

    const localNode = parsed.nodes.get('local-router-zid');
    assert.ok(localNode);
    assert.equal(localNode.links.length, 1);
    assert.equal(localNode.links[0].zid, 'remote-router-zid');
  });

  it('does NOT create independent nodes for listen transports or listen locators of a remote router', () => {
    const routerZid = '16c8087948a803dd35c400495f5be4f2';
    const entries: AdminSpaceEntry[] = [
      // 1. Router session info
      {
        keyExpr: `@/${routerZid}/session/info`,
        zid: routerZid,
        category: 'info',
        payloadJson: JSON.stringify({
          zid: routerZid,
          whatami: 'Router',
          version: '1.7.2',
          locators: [
            'tcp/192.168.1.100:7447',
            'tls/192.168.1.100:7446',
            'quic/192.168.1.100:7448',
            'ws/192.168.1.100:8080',
          ],
        }),
        timestamp: 1000,
      },
      // 2. Unicast listen transport entries
      {
        keyExpr: `@/${routerZid}/session/transport/unicast/listen/tcp/0.0.0.0/7447`,
        zid: routerZid,
        category: 'transport',
        payloadJson: JSON.stringify({
          locator: 'tcp/0.0.0.0:7447',
          mtu: 65535,
        }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${routerZid}/session/transport/unicast/listen/tls/0.0.0.0/7446`,
        zid: routerZid,
        category: 'transport',
        payloadJson: JSON.stringify({
          locator: 'tls/0.0.0.0:7446',
          mtu: 65535,
        }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${routerZid}/session/transport/unicast/listen/quic/0.0.0.0/7448`,
        zid: routerZid,
        category: 'transport',
        payloadJson: JSON.stringify({
          locator: 'quic/0.0.0.0:7448',
          mtu: 65535,
        }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${routerZid}/session/transport/unicast/listen/ws/0.0.0.0/8080`,
        zid: routerZid,
        category: 'transport',
        payloadJson: JSON.stringify({
          locator: 'ws/0.0.0.0:8080',
          mtu: 65535,
        }),
        timestamp: 1000,
      },
      // 3. Listen link entries (listening sockets)
      {
        keyExpr: `@/${routerZid}/session/link/unicast/listen/0`,
        zid: routerZid,
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/0.0.0.0:7447',
          dst: '',
          is_streamed: true,
          interfaces: ['192.168.1.100'],
        }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${routerZid}/session/link/unicast/listen/1`,
        zid: routerZid,
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tls/0.0.0.0:7446',
          dst: '',
          is_streamed: true,
          interfaces: ['192.168.1.100'],
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);

    // MUST ONLY have 1 node (the router itself) and 0 fake nodes
    assert.equal(parsed.nodes.size, 1, `Expected exactly 1 node for the router, but found ${parsed.nodes.size} nodes: ${Array.from(parsed.nodes.keys()).join(', ')}`);
    assert.ok(parsed.nodes.has(routerZid), 'Router node must exist with its exact ZID');

    // No fake nodes for port numbers or path tokens
    assert.equal(parsed.nodes.has('7447'), false, 'Port 7447 must NOT be a node');
    assert.equal(parsed.nodes.has('7446'), false, 'Port 7446 must NOT be a node');
    assert.equal(parsed.nodes.has('7448'), false, 'Port 7448 must NOT be a node');
    assert.equal(parsed.nodes.has('8080'), false, 'Port 8080 must NOT be a node');
    assert.equal(parsed.nodes.has('unicast'), false, 'Token "unicast" must NOT be a node');
    assert.equal(parsed.nodes.has('listen'), false, 'Token "listen" must NOT be a node');
    assert.equal(parsed.nodes.has('transport'), false, 'Token "transport" must NOT be a node');

    // Listen sockets must not create inter-node links
    assert.equal(parsed.links.length, 0, 'Listen interfaces must not be treated as inter-node connection links');

    // The router node should have all real advertised locators
    const routerNode = parsed.nodes.get(routerZid)!;
    assert.equal(routerNode.whatami, 'router');
    assert.ok(routerNode.locators.includes('tcp/192.168.1.100:7447'));
    assert.ok(routerNode.locators.includes('tls/192.168.1.100:7446'));
    assert.ok(routerNode.locators.includes('quic/192.168.1.100:7448'));
    assert.ok(routerNode.locators.includes('ws/192.168.1.100:8080'));
  });

  it('parses connect locators from session link and config entries', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/remote-node-1/session/info',
        zid: 'remote-node-1',
        category: 'info',
        payloadJson: JSON.stringify({
          zid: 'remote-node-1',
          whatami: 'Peer',
          locators: ['tcp/192.168.1.50:7447'],
        }),
        timestamp: 1000,
      },
      {
        keyExpr: '@/remote-node-1/session/link/0',
        zid: 'remote-node-1',
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/192.168.1.50:52134',
          dst: 'tcp/10.0.0.1:7447',
          is_streamed: true,
        }),
        timestamp: 1000,
      },
      {
        keyExpr: '@/remote-node-1/config',
        zid: 'remote-node-1',
        category: 'config',
        payloadJson: JSON.stringify({
          connect: {
            endpoints: ['tls/cloud.zenoh.io:7447'],
          },
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    const node = parsed.nodes.get('remote-node-1');
    assert.ok(node);
    assert.ok(node.connectLocators.includes('tcp/10.0.0.1:7447'));
    assert.ok(node.connectLocators.includes('tls/cloud.zenoh.io:7447'));
  });

  it('parses connect locators from connect_locators array and connect string array in config', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/remote-node-2/session/info',
        zid: 'remote-node-2',
        category: 'info',
        payloadJson: JSON.stringify({ zid: 'remote-node-2', whatami: 'Router' }),
        timestamp: 1000,
      },
      {
        keyExpr: '@/remote-node-2/config',
        zid: 'remote-node-2',
        category: 'config',
        payloadJson: JSON.stringify({
          connect_locators: ['tcp/10.20.30.40:7447'],
          connect: ['quic/10.20.30.41:7448'],
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    const node = parsed.nodes.get('remote-node-2');
    assert.ok(node);
    assert.ok(node.connectLocators.includes('tcp/10.20.30.40:7447'));
    assert.ok(node.connectLocators.includes('quic/10.20.30.41:7448'));
  });

  it('does not add listen sockets to connectLocators', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/remote-node-3/session/info',
        zid: 'remote-node-3',
        category: 'info',
        payloadJson: JSON.stringify({ zid: 'remote-node-3', whatami: 'Router' }),
        timestamp: 1000,
      },
      {
        keyExpr: '@/remote-node-3/session/link/unicast/listen/0',
        zid: 'remote-node-3',
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/0.0.0.0:7447',
          dst: '',
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    const node = parsed.nodes.get('remote-node-3');
    assert.ok(node);
    assert.deepEqual(node.connectLocators, []);
  });

  it('does not classify inbound links with ephemeral ports as connect locators', () => {
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: '@/remote-node-ephemeral/session/info',
        zid: 'remote-node-ephemeral',
        category: 'info',
        payloadJson: JSON.stringify({ zid: 'remote-node-ephemeral', whatami: 'Router' }),
        timestamp: 1000,
      },
      {
        keyExpr: '@/remote-node-ephemeral/session/link/unicast/0',
        zid: 'remote-node-ephemeral',
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/10.0.0.1:7447',
          dst: 'tcp/192.168.1.50:49152',
          is_streamed: true,
        }),
        timestamp: 1000,
      },
      {
        keyExpr: '@/remote-node-ephemeral/session/link/unicast/1',
        zid: 'remote-node-ephemeral',
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/10.0.0.1:7447',
          dst: 'tcp/10.0.0.2:7447',
          is_streamed: true,
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    const node = parsed.nodes.get('remote-node-ephemeral');
    assert.ok(node);
    assert.ok(node.connectLocators.includes('tcp/10.0.0.2:7447'));
    assert.equal(node.connectLocators.includes('tcp/192.168.1.50:49152'), false);
    assert.equal(parsed.links.length, 2);
  });

  it('parses Zenoh transport and link paths with peer ZID in path (@/<zid>/session/transport/unicast/<peer_zid>/link/<hash>)', () => {
    const routerZid = 'a5dbc51858315285b3fad82d9f78e521';
    const clientZid = 'aedda2e79de1506ea1f3338f44cd78cf';
    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: `@/${routerZid}/session/transport/unicast/${clientZid}`,
        zid: routerZid,
        category: 'transport',
        payloadJson: JSON.stringify({
          zid: clientZid,
          whatami: 'client',
          is_qos: true,
        }),
        timestamp: 1000,
      },
      {
        keyExpr: `@/${routerZid}/session/transport/unicast/${clientZid}/link/16852510730545110870`,
        zid: routerZid,
        category: 'link',
        payloadJson: JSON.stringify({
          src: 'tcp/192.168.1.100:7447',
          dst: 'tcp/192.168.1.50:42804',
          group: null,
          mtu: 49152,
          is_streamed: true,
          interfaces: ['eth0'],
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    assert.equal(parsed.nodes.size, 2);
    const routerNode = parsed.nodes.get(routerZid);
    const clientNode = parsed.nodes.get(clientZid);

    assert.ok(routerNode, 'router node should exist');
    assert.ok(clientNode, 'client node should exist');
    assert.equal(clientNode.whatami, 'client');
    assert.ok(routerNode.neighbors.includes(clientZid));
    assert.ok(clientNode.neighbors.includes(routerZid));
    assert.ok(clientNode.connectLocators.includes('tcp/192.168.1.100:7447'), 'client should have router listen locator as upstream connect locator');

    assert.equal(parsed.links.length, 1);
    assert.equal(parsed.links[0].sourceZid, routerZid);
    assert.equal(parsed.links[0].targetZid, clientZid);
    assert.equal(parsed.links[0].srcLocator, 'tcp/192.168.1.100:7447');
    assert.equal(parsed.links[0].dstLocator, 'tcp/192.168.1.50:42804');
  });

  it('parses Zenoh @/<router_zid>/router entry containing sessions array with connected peers/clients and links', () => {
    const routerZid = 'b2e5805197a5b6c37245c63ff5bc6882';
    const client1Zid = '579b636048e466b9803d39c2f006c37';
    const client2Zid = '89e3fe305f2d27d154bac010b07c9d97';

    const entries: AdminSpaceEntry[] = [
      {
        keyExpr: `@/${routerZid}/router`,
        zid: routerZid,
        category: 'router',
        payloadJson: JSON.stringify({
          locators: ['tcp/172.17.0.2:7447'],
          metadata: null,
          plugins: {},
          sessions: [
            {
              links: [
                {
                  dst: 'tcp/104.28.222.74:64517',
                  src: 'tcp/172.17.0.2:7447',
                },
              ],
              peer: client1Zid,
              region: 'south:0:client',
              shm: false,
              weight: null,
              whatami: 'client',
            },
            {
              links: [
                {
                  dst: 'tcp/104.28.222.74:64963',
                  src: 'tcp/172.17.0.2:7447',
                },
              ],
              peer: client2Zid,
              region: 'south:0:client',
              shm: false,
              weight: null,
              whatami: 'client',
            },
          ],
          version: 'v1.10.0',
          zid: routerZid,
        }),
        timestamp: 1000,
      },
    ];

    const parsed = parseAdminSpaceEntries(entries);
    assert.equal(parsed.nodes.size, 3);
    const routerNode = parsed.nodes.get(routerZid);
    const client1 = parsed.nodes.get(client1Zid);
    const client2 = parsed.nodes.get(client2Zid);

    assert.ok(routerNode);
    assert.ok(client1);
    assert.ok(client2);

    assert.equal(routerNode.whatami, 'router');
    assert.equal(client1.whatami, 'client');
    assert.equal(client2.whatami, 'client');

    assert.ok(routerNode.neighbors.includes(client1Zid));
    assert.ok(routerNode.neighbors.includes(client2Zid));
    assert.ok(client1.neighbors.includes(routerZid));
    assert.ok(client2.neighbors.includes(routerZid));

    assert.ok(client1.connectLocators.includes('tcp/172.17.0.2:7447'));
    assert.ok(client2.connectLocators.includes('tcp/172.17.0.2:7447'));

    assert.equal(parsed.links.length, 2);
    assert.equal(parsed.links[0].sourceZid, routerZid);
    assert.equal(parsed.links[0].targetZid, client1Zid);
    assert.equal(parsed.links[1].sourceZid, routerZid);
    assert.equal(parsed.links[1].targetZid, client2Zid);
  });
});


