import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProtoSchema,
  encodeProtobufPayload,
  decodeProtobufPayload,
  generateProtoSampleJson,
  resolveProtoType,
  extractMessageTypes,
} from '../../src/lib/protobufEngine';

const PROTO3_SENSOR_SCHEMA = `
syntax = "proto3";
package iot.sensor;

enum SensorStatus {
  UNKNOWN = 0;
  ACTIVE = 1;
  WARNING = 2;
  ERROR = 3;
}

message Location {
  double latitude = 1;
  double longitude = 2;
  string label = 3;
}

message TelemetryData {
  string sensor_id = 1;
  int64 timestamp = 2;
  double temperature = 3;
  double humidity = 4;
  bool is_calibrated = 5;
  SensorStatus status = 6;
  Location location = 7;
  repeated double historical_readings = 8;
  repeated string tags = 9;
  map<string, string> metadata = 10;
  bytes raw_calibration = 11;
}
`;

const PROTO2_PERSON_SCHEMA = `
syntax = "proto2";
package legacy.directory;

enum PhoneType {
  MOBILE = 0;
  HOME = 1;
  WORK = 2;
}

message PhoneNumber {
  required string number = 1;
  optional PhoneType type = 2 [default = HOME];
}

message Person {
  required string name = 1;
  required int32 id = 2;
  optional string email = 3;
  repeated PhoneNumber phones = 4;
}

message AddressBook {
  repeated Person people = 1;
}
`;

const PROTO3_NO_PACKAGE_SCHEMA = `
syntax = "proto3";

message Ping {
  string nonce = 1;
}

message Pong {
  string nonce = 1;
  int64 reply_timestamp = 2;
}
`;

const PROTO3_NESTED_SCHEMA = `
syntax = "proto3";
package robotics;

message RobotState {
  string robot_id = 1;
  
  message ArmPose {
    double x = 1;
    double y = 2;
    double z = 3;

    message GripperState {
      bool is_closed = 1;
      double grip_force = 2;
    }

    GripperState gripper = 4;
  }

  ArmPose left_arm = 2;
  ArmPose right_arm = 3;
}
`;

const RECURSIVE_SCHEMA = `
syntax = "proto3";
package tree;

message TreeNode {
  string value = 1;
  repeated TreeNode children = 2;
  TreeNode parent = 3;
}
`;

describe('Protobuf Engine - Schema Parser (parseProtoSchema)', () => {
  test('parses valid proto3 schema with package and multiple message types', () => {
    const result = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    assert.ok(result.root, 'Root should be defined');
    assert.equal(result.syntax, 'proto3');
    assert.equal(result.package, 'iot.sensor');
    assert.deepEqual(result.messageTypes.sort(), [
      'iot.sensor.Location',
      'iot.sensor.TelemetryData',
    ].sort());
  });

  test('parses proto2 schema correctly and detects proto2 syntax', () => {
    const result = parseProtoSchema(PROTO2_PERSON_SCHEMA);
    assert.ok(result.root);
    assert.equal(result.syntax, 'proto2');
    assert.equal(result.package, 'legacy.directory');
    assert.deepEqual(result.messageTypes.sort(), [
      'legacy.directory.AddressBook',
      'legacy.directory.Person',
      'legacy.directory.PhoneNumber',
    ].sort());
  });

  test('parses proto schema without package declaration', () => {
    const result = parseProtoSchema(PROTO3_NO_PACKAGE_SCHEMA);
    assert.ok(result.root);
    assert.equal(result.syntax, 'proto3');
    assert.equal(result.package, undefined);
    assert.deepEqual(result.messageTypes.sort(), ['Ping', 'Pong'].sort());
  });

  test('parses nested message types properly', () => {
    const result = parseProtoSchema(PROTO3_NESTED_SCHEMA);
    assert.ok(result.root);
    assert.equal(result.package, 'robotics');
    assert.ok(result.messageTypes.includes('robotics.RobotState'));
    assert.ok(result.messageTypes.includes('robotics.RobotState.ArmPose'));
    assert.ok(result.messageTypes.includes('robotics.RobotState.ArmPose.GripperState'));
  });

  test('throws error on empty or whitespace-only schema', () => {
    assert.throws(() => parseProtoSchema(''), /empty/i);
    assert.throws(() => parseProtoSchema('   \n  \t '), /empty/i);
  });

  test('throws descriptive error on malformed proto syntax', () => {
    const malformed = `
      syntax = "proto3";
      message Broken {
        string invalid_field_definition without id;
      }
    `;
    assert.throws(() => parseProtoSchema(malformed), /illegal|syntax|error/i);
  });
});

describe('Protobuf Engine - Type Resolution (resolveProtoType)', () => {
  test('resolves type by fully qualified name, dot-prefixed name, and short name', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    
    const type1 = resolveProtoType(root, 'iot.sensor.TelemetryData');
    assert.ok(type1);
    assert.equal(type1.name, 'TelemetryData');

    const type2 = resolveProtoType(root, '.iot.sensor.TelemetryData');
    assert.ok(type2);
    assert.equal(type2.name, 'TelemetryData');

    const type3 = resolveProtoType(root, 'TelemetryData');
    assert.ok(type3);
    assert.equal(type3.name, 'TelemetryData');
  });

  test('resolves nested types correctly', () => {
    const { root } = parseProtoSchema(PROTO3_NESTED_SCHEMA);
    const armPoseType = resolveProtoType(root, 'robotics.RobotState.ArmPose');
    assert.ok(armPoseType);
    assert.equal(armPoseType.name, 'ArmPose');

    const shortArmPose = resolveProtoType(root, 'ArmPose');
    assert.ok(shortArmPose);
    assert.equal(shortArmPose.name, 'ArmPose');
  });

  test('throws descriptive error when message type is not found', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    assert.throws(
      () => resolveProtoType(root, 'NonExistentMessage'),
      /message type "NonExistentMessage" not found/i
    );
  });
});

describe('Protobuf Engine - Encoder & Decoder (encodeProtobufPayload / decodeProtobufPayload)', () => {
  test('encodes JSON object to binary bytes and decodes back accurately', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);

    const payload = {
      sensor_id: 'sensor-xyz-001',
      timestamp: '1724457600000',
      temperature: 23.75,
      humidity: 58.2,
      is_calibrated: true,
      status: 'ACTIVE',
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        label: 'San Francisco HQ',
      },
      historical_readings: [23.1, 23.4, 23.75],
      tags: ['lab', 'indoor', 'temperature'],
      metadata: {
        firmware: 'v2.1.0',
        environment: 'production',
      },
    };

    const encodedBytes = encodeProtobufPayload(root, 'iot.sensor.TelemetryData', payload);
    assert.ok(encodedBytes instanceof Uint8Array);
    assert.ok(encodedBytes.length > 0);

    const decoded = decodeProtobufPayload(root, 'iot.sensor.TelemetryData', encodedBytes);
    assert.equal(decoded.sensor_id, 'sensor-xyz-001');
    assert.equal(decoded.temperature, 23.75);
    assert.equal(decoded.humidity, 58.2);
    assert.equal(decoded.is_calibrated, true);
    assert.equal(decoded.status, 'ACTIVE');
    assert.equal(decoded.location?.label, 'San Francisco HQ');
    assert.deepEqual(decoded.historical_readings, [23.1, 23.4, 23.75]);
    assert.deepEqual(decoded.tags, ['lab', 'indoor', 'temperature']);
    assert.equal(decoded.metadata?.firmware, 'v2.1.0');
  });

  test('decodes number[] byte array input seamlessly', () => {
    const { root } = parseProtoSchema(PROTO3_NO_PACKAGE_SCHEMA);
    const original = { nonce: 'test-nonce-123', reply_timestamp: '1700000000' };

    const encoded = encodeProtobufPayload(root, 'Pong', original);
    const numberArray = Array.from(encoded);

    const decoded = decodeProtobufPayload(root, 'Pong', numberArray);
    assert.equal(decoded.nonce, 'test-nonce-123');
  });

  test('encodes JSON string input seamlessly', () => {
    const { root } = parseProtoSchema(PROTO3_NO_PACKAGE_SCHEMA);
    const jsonStr = JSON.stringify({ nonce: 'str-nonce-999' });

    const encoded = encodeProtobufPayload(root, 'Ping', jsonStr);
    assert.ok(encoded.length > 0);

    const decoded = decodeProtobufPayload(root, 'Ping', encoded);
    assert.equal(decoded.nonce, 'str-nonce-999');
  });

  test('supports proto2 required, optional, and default fields', () => {
    const { root } = parseProtoSchema(PROTO2_PERSON_SCHEMA);

    const personObj = {
      name: 'John Doe',
      id: 101,
      email: 'john@example.com',
      phones: [
        { number: '+1234567890', type: 'WORK' },
        { number: '+0987654321', type: 'MOBILE' },
      ],
    };

    const encoded = encodeProtobufPayload(root, 'legacy.directory.Person', personObj);
    const decoded = decodeProtobufPayload(root, 'legacy.directory.Person', encoded);

    assert.equal(decoded.name, 'John Doe');
    assert.equal(decoded.id, 101);
    assert.equal(decoded.email, 'john@example.com');
    assert.equal(decoded.phones?.length, 2);
    assert.equal(decoded.phones[0].number, '+1234567890');
    assert.equal(decoded.phones[0].type, 'WORK');
  });

  test('throws error when decoding corrupted or malformed byte buffer', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    const corruptedBytes = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    
    assert.throws(
      () => decodeProtobufPayload(root, 'iot.sensor.TelemetryData', corruptedBytes),
      /decode|error|invalid/i
    );
  });

  test('throws error when encoding invalid JSON string', () => {
    const { root } = parseProtoSchema(PROTO3_NO_PACKAGE_SCHEMA);
    assert.throws(
      () => encodeProtobufPayload(root, 'Ping', '{bad json}'),
      /json/i
    );
  });

  test('throws error when encoding payload with incompatible types', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    const invalidPayload = {
      temperature: 'definitely not a number and invalid for float/double',
    };
    // Note: protobufjs verify will catch invalid field types
    assert.throws(
      () => encodeProtobufPayload(root, 'iot.sensor.TelemetryData', invalidPayload),
      /verify|invalid|payload|type/i
    );
  });
});

describe('Protobuf Engine - Sample JSON Generator (generateProtoSampleJson)', () => {
  test('generates complete sample JSON template with realistic default values', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    const sample = generateProtoSampleJson(root, 'iot.sensor.TelemetryData');

    assert.ok(sample, 'Sample object should be generated');
    assert.equal(typeof sample.sensor_id, 'string');
    assert.equal(typeof sample.temperature, 'number');
    assert.equal(typeof sample.humidity, 'number');
    assert.equal(typeof sample.is_calibrated, 'boolean');
    assert.equal(typeof sample.status, 'string');
    assert.ok(['UNKNOWN', 'ACTIVE', 'WARNING', 'ERROR'].includes(sample.status));

    // Nested object
    assert.ok(typeof sample.location === 'object' && sample.location !== null);
    assert.equal(typeof sample.location.latitude, 'number');
    assert.equal(typeof sample.location.longitude, 'number');
    assert.equal(typeof sample.location.label, 'string');

    // Repeated fields
    assert.ok(Array.isArray(sample.historical_readings));
    assert.equal(sample.historical_readings.length, 1);
    assert.equal(typeof sample.historical_readings[0], 'number');

    assert.ok(Array.isArray(sample.tags));
    assert.equal(sample.tags.length, 1);
    assert.equal(typeof sample.tags[0], 'string');

    // Map field
    assert.ok(typeof sample.metadata === 'object');
    assert.ok(Object.keys(sample.metadata).length > 0);

    // Bytes field
    assert.equal(typeof sample.raw_calibration, 'string');
  });

  test('generates sample JSON for deeply nested structures', () => {
    const { root } = parseProtoSchema(PROTO3_NESTED_SCHEMA);
    const sample = generateProtoSampleJson(root, 'robotics.RobotState');

    assert.ok(sample);
    assert.equal(typeof sample.robot_id, 'string');
    assert.ok(sample.left_arm);
    assert.equal(typeof sample.left_arm.x, 'number');
    assert.ok(sample.left_arm.gripper);
    assert.equal(typeof sample.left_arm.gripper.is_closed, 'boolean');
  });

  test('handles recursive schema definitions without infinite recursion or stack overflow', () => {
    const { root } = parseProtoSchema(RECURSIVE_SCHEMA);
    const sample = generateProtoSampleJson(root, 'tree.TreeNode');

    assert.ok(sample);
    assert.equal(typeof sample.value, 'string');
    assert.ok(Array.isArray(sample.children));
  });

  test('generated sample JSON can be successfully encoded and decoded', () => {
    const { root } = parseProtoSchema(PROTO3_SENSOR_SCHEMA);
    const sample = generateProtoSampleJson(root, 'iot.sensor.TelemetryData');

    const encoded = encodeProtobufPayload(root, 'iot.sensor.TelemetryData', sample);
    assert.ok(encoded.length > 0);

    const decoded = decodeProtobufPayload(root, 'iot.sensor.TelemetryData', encoded);
    assert.ok(decoded);
    assert.equal(decoded.sensor_id, sample.sensor_id);
    assert.equal(decoded.is_calibrated, sample.is_calibrated);
  });
});
