import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatThroughput, formatMessageRate, formatByteSize } from '../../src/lib/trafficFormatters';

describe('Traffic Formatters', () => {
  test('formatThroughput', () => {
    assert.equal(formatThroughput(0), '0 B/s');
    assert.equal(formatThroughput(-10), '0 B/s');
    assert.equal(formatThroughput(512), '512 B/s');
    assert.equal(formatThroughput(1024), '1.00 KB/s');
    assert.equal(formatThroughput(1024 * 1024 * 2.5), '2.50 MB/s');
  });

  test('formatMessageRate', () => {
    assert.equal(formatMessageRate(0), '0 msgs/s');
    assert.equal(formatMessageRate(-5), '0 msgs/s');
    assert.equal(formatMessageRate(42), '42 msgs/s');
    assert.equal(formatMessageRate(1500), '1.5k msgs/s');
    assert.equal(formatMessageRate(25400), '25.4k msgs/s');
  });

  test('formatByteSize', () => {
    assert.equal(formatByteSize(0), '0 B');
    assert.equal(formatByteSize(-1), '0 B');
    assert.equal(formatByteSize(512), '512 B');
    assert.equal(formatByteSize(1024), '1.00 KB');
    assert.equal(formatByteSize(1024 * 1024), '1.00 MB');
    assert.equal(formatByteSize(1024 * 1024 * 1024 * 1.5), '1536.00 MB');
  });
});
