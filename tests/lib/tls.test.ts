import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLocator,
  buildLocator,
  SUPPORTED_TRANSPORT_PROTOCOLS,
  PRODUCTION_PRESETS,
} from '../../src/lib/tls';

describe('Transport Protocol & Locator Utilities', () => {
  it('supports all 7 required protocols', () => {
    const ids = SUPPORTED_TRANSPORT_PROTOCOLS.map((p) => p.id);
    assert.deepEqual(ids, ['tcp', 'tls', 'quic', 'udp', 'ws', 'wss', 'unix']);
  });

  it('provides default port for each supported protocol', () => {
    const portMap = Object.fromEntries(SUPPORTED_TRANSPORT_PROTOCOLS.map((p) => [p.id, (p as any).defaultPort]));
    assert.equal(portMap.tcp, '7447');
    assert.equal(portMap.tls, '7446');
    assert.equal(portMap.quic, '7448');
    assert.equal(portMap.udp, '7449');
    assert.equal(portMap.ws, '8080');
    assert.equal(portMap.wss, '8443');
    assert.equal(portMap.unix, '');
  });

  it('correctly parses network locators', () => {
    assert.deepEqual(parseLocator('tcp/127.0.0.1:7447'), { protocol: 'tcp', host: '127.0.0.1', port: '7447' });
    assert.deepEqual(parseLocator('ws/0.0.0.0:8080'), { protocol: 'ws', host: '0.0.0.0', port: '8080' });
    assert.deepEqual(parseLocator('quic/192.168.1.10:7448'), { protocol: 'quic', host: '192.168.1.10', port: '7448' });
    assert.deepEqual(parseLocator('udp/localhost:7449'), { protocol: 'udp', host: 'localhost', port: '7449' });
    assert.deepEqual(parseLocator('wss/cloud.zenoh.io:8443'), { protocol: 'wss', host: 'cloud.zenoh.io', port: '8443' });
    assert.deepEqual(parseLocator('tls/secure.host:7446'), { protocol: 'tls', host: 'secure.host', port: '7446' });
  });

  it('correctly parses unix domain socket locators', () => {
    assert.deepEqual(parseLocator('unixpipe//tmp/zenoh.sock'), { protocol: 'unix', host: '/tmp/zenoh.sock', port: '' });
    assert.deepEqual(parseLocator('unixpipe/var/run/zenoh.sock'), { protocol: 'unix', host: '/var/run/zenoh.sock', port: '' });
    assert.deepEqual(parseLocator('unix//tmp/zenoh.sock'), { protocol: 'unix', host: '/tmp/zenoh.sock', port: '' });
  });

  it('correctly parses locators without protocol prefix or missing port', () => {
    assert.deepEqual(parseLocator('127.0.0.1:7447'), { protocol: 'tcp', host: '127.0.0.1', port: '7447' });
    assert.deepEqual(parseLocator('tcp/127.0.0.1'), { protocol: 'tcp', host: '127.0.0.1', port: '7447' });
    assert.deepEqual(parseLocator(''), null);
    assert.deepEqual(parseLocator('   '), null);
  });

  it('correctly builds network locators', () => {
    assert.equal(buildLocator('tcp', '127.0.0.1', '7447'), 'tcp/127.0.0.1:7447');
    assert.equal(buildLocator('ws', '0.0.0.0', '8080'), 'ws/0.0.0.0:8080');
    assert.equal(buildLocator('tcp', '0.0.0.0', '0'), 'tcp/0.0.0.0:0');
    assert.equal(buildLocator('quic', '192.168.1.10', '7448'), 'quic/192.168.1.10:7448');
    assert.equal(buildLocator('wss', 'cloud.zenoh.io', '8443'), 'wss/cloud.zenoh.io:8443');
    assert.equal(buildLocator('tls', 'secure.host', '7446'), 'tls/secure.host:7446');
    assert.equal(buildLocator('udp', '127.0.0.1', '7449'), 'udp/127.0.0.1:7449');
  });

  it('correctly builds network locators when host already includes protocol or port', () => {
    assert.equal(buildLocator('tcp', 'tcp/127.0.0.1:7447', ''), 'tcp/127.0.0.1:7447');
    assert.equal(buildLocator('ws', 'tcp/127.0.0.1:7447', '8080'), 'ws/127.0.0.1:8080');
  });

  it('correctly builds unix domain socket locators', () => {
    assert.equal(buildLocator('unix', '/tmp/zenoh.sock', ''), 'unixpipe//tmp/zenoh.sock');
    assert.equal(buildLocator('unix', 'tmp/zenoh.sock', ''), 'unixpipe//tmp/zenoh.sock');
    assert.equal(buildLocator('unixpipe', '/var/run/zenoh.sock', ''), 'unixpipe//var/run/zenoh.sock');
  });

  it('handles empty or blank host when building locator', () => {
    assert.equal(buildLocator('tcp', '', '7447'), '');
    assert.equal(buildLocator('unix', '   ', ''), '');
  });

  it('provides standard production presets', () => {
    assert.ok(Array.isArray(PRODUCTION_PRESETS));
    assert.ok(PRODUCTION_PRESETS.length >= 3);
    const roles = PRODUCTION_PRESETS.map((p) => p.role);
    assert.ok(roles.includes('router'));
    assert.ok(roles.includes('peer'));
    assert.ok(roles.includes('client'));
  });
});
