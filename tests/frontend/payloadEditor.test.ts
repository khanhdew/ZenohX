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

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PAYLOAD_TEMPLATES, PayloadEditor } from '../../src/components/viewer/PayloadEditor';
import { useProtoStore } from '../../src/stores/protoStore';
import { generateProtoSampleJson, encodeProtobufPayload } from '../../src/lib/protobufEngine';

describe('PayloadEditor Exports & Templates', () => {
  test('PayloadEditor component is properly exported as React FC and default', () => {
    assert.equal(typeof PayloadEditor, 'function');
  });

  test('PAYLOAD_TEMPLATES contains valid built-in templates', () => {
    assert.ok(PAYLOAD_TEMPLATES.length >= 5);
    for (const tmpl of PAYLOAD_TEMPLATES) {
      assert.ok(tmpl.name && typeof tmpl.name === 'string');
      assert.ok(tmpl.encoding && typeof tmpl.encoding === 'string');
      assert.ok(tmpl.content && typeof tmpl.content === 'string');
      if (tmpl.encoding === 'json') {
        assert.doesNotThrow(() => JSON.parse(tmpl.content));
      }
    }
  });
});

describe('PayloadEditor Protobuf validation & sample generation logic', () => {
  const sensorProto = `
    syntax = "proto3";
    package iot.sensor;

    message SensorData {
      string sensor_id = 1;
      double temperature = 2;
      double humidity = 3;
      bool active = 4;
      repeated string tags = 5;
    }
  `;

  test('generates valid sample JSON for Protobuf schema', () => {
    useProtoStore.getState().clearAll();
    const res = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(res.success, true);

    const root = useProtoStore.getState().getCompiledRoot(res.id!)!;
    assert.ok(root);

    const sample = generateProtoSampleJson(root, 'iot.sensor.SensorData');
    assert.equal(typeof sample, 'object');
    assert.equal(typeof sample.sensor_id, 'string');
    assert.equal(typeof sample.temperature, 'number');
    assert.equal(typeof sample.humidity, 'number');
    assert.equal(typeof sample.active, 'boolean');
    assert.ok(Array.isArray(sample.tags));

    // Verify sample can be encoded directly without errors
    const encoded = encodeProtobufPayload(root, 'iot.sensor.SensorData', sample);
    assert.ok(encoded.length > 0);
  });

  test('encodes valid JSON payload to Protobuf wire bytes and calculates size', () => {
    useProtoStore.getState().clearAll();
    const res = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(res.success, true);

    const root = useProtoStore.getState().getCompiledRoot(res.id!)!;
    const payload = {
      sensor_id: 'sensor-99',
      temperature: 23.4,
      humidity: 45.6,
      active: true,
      tags: ['lab', 'indoor'],
    };

    const encoded = encodeProtobufPayload(root, 'iot.sensor.SensorData', payload);
    assert.ok(encoded.length > 0);
    assert.ok(encoded instanceof Uint8Array);
  });

  test('rejects mismatched types or invalid structure during validation', () => {
    useProtoStore.getState().clearAll();
    const res = useProtoStore.getState().addSchema('sensor.proto', sensorProto);
    assert.equal(res.success, true);

    const root = useProtoStore.getState().getCompiledRoot(res.id!)!;

    // Non-numeric temperature
    assert.throws(
      () =>
        encodeProtobufPayload(root, 'iot.sensor.SensorData', {
          sensor_id: 'sensor-99',
          temperature: 'not-a-number',
        }),
      /numeric/
    );

    // Non-array repeated field
    assert.throws(
      () =>
        encodeProtobufPayload(root, 'iot.sensor.SensorData', {
          sensor_id: 'sensor-99',
          tags: 'not-an-array',
        }),
      /Expected array/
    );
  });
});
