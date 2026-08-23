import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatThroughput, formatMessageRate, formatByteSize } from '../../src/lib/trafficFormatters';
import { useTrafficStore } from '../../src/stores/trafficStore';

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

describe('Traffic Store', () => {
  test('Traffic Store - recording events and calculating tick rates', () => {
    const store = useTrafficStore.getState();
    store.clearTrafficHistory();

    // Record an inbound sample
    store.recordEvent({
      direction: 'inbound',
      opType: 'sub',
      keyExpr: 'demo/telemetry',
      bytes: 2048,
    });

    // Record an outbound sample
    store.recordEvent({
      direction: 'outbound',
      opType: 'pub',
      keyExpr: 'demo/telemetry',
      bytes: 1024,
    });

    // Check cumulative key stats
    const keyStats = useTrafficStore.getState().keyStats['demo/telemetry'];
    assert.ok(keyStats);
    assert.equal(keyStats.inboundBytes, 2048);
    assert.equal(keyStats.outboundBytes, 1024);
    assert.equal(keyStats.inboundMsgs, 1);
    assert.equal(keyStats.outboundMsgs, 1);

    // Tick a second
    store.tickSecond();

    const stateAfterTick = useTrafficStore.getState();
    assert.equal(stateAfterTick.currentInboundBps, 2048);
    assert.equal(stateAfterTick.currentOutboundBps, 1024);
    assert.equal(stateAfterTick.currentInboundMps, 1);
    assert.equal(stateAfterTick.currentOutboundMps, 1);
    assert.equal(stateAfterTick.timeline.length, 1);
  });

  test('Traffic Store - respects isRecording flag', () => {
    const store = useTrafficStore.getState();
    store.clearTrafficHistory();

    store.toggleRecording(); // isRecording = false
    assert.equal(useTrafficStore.getState().isRecording, false);

    store.recordEvent({
      direction: 'inbound',
      opType: 'sub',
      keyExpr: 'test/ignored',
      bytes: 500,
    });

    assert.equal(useTrafficStore.getState().totalInboundBytes, 0);
    assert.equal(useTrafficStore.getState().keyStats['test/ignored'], undefined);

    store.toggleRecording(); // isRecording = true
    assert.equal(useTrafficStore.getState().isRecording, true);
  });

  test('Traffic Store - timeline window trimming at historyWindowSeconds limit', () => {
    const store = useTrafficStore.getState();
    store.clearTrafficHistory();

    // Tick 65 times
    for (let i = 0; i < 65; i++) {
      store.recordEvent({
        direction: 'inbound',
        opType: 'sub',
        keyExpr: 'test/window',
        bytes: 10,
      });
      store.tickSecond();
    }

    const state = useTrafficStore.getState();
    assert.equal(state.timeline.length, 60);
  });

  test('Traffic Store - setSelectedMetric and clearTrafficHistory', () => {
    const store = useTrafficStore.getState();
    store.setSelectedMetric('messages');
    assert.equal(useTrafficStore.getState().selectedMetric, 'messages');

    store.clearTrafficHistory();
    const state = useTrafficStore.getState();
    assert.equal(state.currentInboundBps, 0);
    assert.equal(state.currentOutboundBps, 0);
    assert.equal(state.currentInboundMps, 0);
    assert.equal(state.currentOutboundMps, 0);
    assert.equal(state.totalInboundBytes, 0);
    assert.equal(state.totalOutboundBytes, 0);
    assert.equal(state.timeline.length, 0);
    assert.deepEqual(state.keyStats, {});
  });

  test('Traffic Store - Integration with PubSub and Query simulation', () => {
    const traffic = useTrafficStore.getState();
    traffic.clearTrafficHistory();

    // Simulate subscription sample
    traffic.recordEvent({
      direction: 'inbound',
      opType: 'sub',
      keyExpr: 'sensors/lidar',
      bytes: 4096,
    });

    // Simulate query response
    traffic.recordEvent({
      direction: 'inbound',
      opType: 'query_res',
      keyExpr: 'config/all',
      bytes: 512,
    });

    const keys = useTrafficStore.getState().keyStats;
    assert.equal(keys['sensors/lidar'].inboundBytes, 4096);
    assert.equal(keys['config/all'].inboundBytes, 512);
    assert.equal(useTrafficStore.getState().totalInboundBytes, 4608);
  });
});

