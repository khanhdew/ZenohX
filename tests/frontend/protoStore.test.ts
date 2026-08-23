import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useProtoStore } from '../../src/stores/protoStore';

const VALID_PROTO_3 = `
syntax = "proto3";
package robot.sensors;

message BatteryState {
  float voltage = 1;
  float percentage = 2;
  bool is_charging = 3;
}

message ImuData {
  double accel_x = 1;
  double accel_y = 2;
  double accel_z = 3;
}
`;

const VALID_PROTO_2 = `
syntax = "proto2";
package legacy.telemetry;

message StatusReport {
  required int32 code = 1;
  optional string message = 2;
}
`;

const INVALID_PROTO = `
syntax = "proto3";
package broken;
message Incomplete {
  invalid_type value = 1;
`;

describe('Protobuf Store (useProtoStore)', () => {
  beforeEach(() => {
    useProtoStore.getState().clearAll();
  });

  test('initializes with empty schemas and mappings', () => {
    const state = useProtoStore.getState();
    assert.deepEqual(state.schemas, []);
    assert.deepEqual(state.mappings, []);
    assert.deepEqual(state.getAllMessageTypes(), []);
    assert.equal(state.findMappingForKey('robot/sensors/battery'), undefined);
  });

  describe('Schema Management (addSchema, updateSchema, removeSchema)', () => {
    test('addSchema successfully adds valid proto3 schema', () => {
      const res = useProtoStore.getState().addSchema('robot_sensors.proto', VALID_PROTO_3);

      assert.equal(res.success, true);
      assert.ok(res.id);
      assert.equal(res.error, undefined);

      const schemas = useProtoStore.getState().schemas;
      assert.equal(schemas.length, 1);
      const schema = schemas[0];
      assert.equal(schema.id, res.id);
      assert.equal(schema.name, 'robot_sensors.proto');
      assert.equal(schema.syntax, 'proto3');
      assert.equal(schema.package, 'robot.sensors');
      assert.deepEqual(schema.messageTypes, [
        'robot.sensors.BatteryState',
        'robot.sensors.ImuData',
      ]);
      assert.ok(schema.createdAt > 0);
      assert.ok(schema.updatedAt > 0);
    });

    test('addSchema successfully adds valid proto2 schema and handles fallback name', () => {
      const res = useProtoStore.getState().addSchema('   ', VALID_PROTO_2);

      assert.equal(res.success, true);
      assert.ok(res.id);

      const schemas = useProtoStore.getState().schemas;
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].name, 'schema.proto');
      assert.equal(schemas[0].syntax, 'proto2');
      assert.equal(schemas[0].package, 'legacy.telemetry');
      assert.deepEqual(schemas[0].messageTypes, ['legacy.telemetry.StatusReport']);
    });

    test('addSchema fails with invalid or empty proto content', () => {
      const resEmpty = useProtoStore.getState().addSchema('empty.proto', '   ');
      assert.equal(resEmpty.success, false);
      assert.ok(resEmpty.error);
      assert.equal(useProtoStore.getState().schemas.length, 0);

      const resInvalid = useProtoStore.getState().addSchema('broken.proto', INVALID_PROTO);
      assert.equal(resInvalid.success, false);
      assert.ok(resInvalid.error);
      assert.equal(useProtoStore.getState().schemas.length, 0);
    });

    test('updateSchema successfully updates existing schema and message types', () => {
      const addRes = useProtoStore.getState().addSchema('sensors.proto', VALID_PROTO_3);
      assert.ok(addRes.id);

      const updatedProto = `
        syntax = "proto3";
        package robot.sensors.v2;

        message PowerInfo {
          float current = 1;
        }
      `;

      const updateRes = useProtoStore.getState().updateSchema(addRes.id, updatedProto);
      assert.equal(updateRes.success, true);

      const schema = useProtoStore.getState().schemas[0];
      assert.equal(schema.package, 'robot.sensors.v2');
      assert.deepEqual(schema.messageTypes, ['robot.sensors.v2.PowerInfo']);
      assert.equal(schema.rawContent, updatedProto);
      assert.ok(schema.updatedAt >= schema.createdAt);
    });

    test('updateSchema rejects invalid syntax without modifying existing schema', () => {
      const addRes = useProtoStore.getState().addSchema('sensors.proto', VALID_PROTO_3);
      assert.ok(addRes.id);

      const updateRes = useProtoStore.getState().updateSchema(addRes.id, INVALID_PROTO);
      assert.equal(updateRes.success, false);
      assert.ok(updateRes.error);

      // Existing schema remains untouched
      const schema = useProtoStore.getState().schemas[0];
      assert.equal(schema.package, 'robot.sensors');
      assert.deepEqual(schema.messageTypes, [
        'robot.sensors.BatteryState',
        'robot.sensors.ImuData',
      ]);
    });

    test('updateSchema fails on non-existent schema ID', () => {
      const res = useProtoStore.getState().updateSchema('non-existent-id', VALID_PROTO_3);
      assert.equal(res.success, false);
      assert.ok(res.error?.includes('not found'));
    });

    test('removeSchema removes schema and cascades removal of associated mappings', () => {
      const res1 = useProtoStore.getState().addSchema('s1.proto', VALID_PROTO_3);
      const res2 = useProtoStore.getState().addSchema('s2.proto', VALID_PROTO_2);
      assert.ok(res1.id && res2.id);

      // Add mappings referencing both schemas
      useProtoStore.getState().addMapping('robot/sensors/battery', res1.id, 'robot.sensors.BatteryState');
      useProtoStore.getState().addMapping('robot/sensors/imu', res1.id, 'robot.sensors.ImuData');
      useProtoStore.getState().addMapping('legacy/status', res2.id, 'legacy.telemetry.StatusReport');

      assert.equal(useProtoStore.getState().schemas.length, 2);
      assert.equal(useProtoStore.getState().mappings.length, 3);

      // Remove schema 1
      useProtoStore.getState().removeSchema(res1.id);

      assert.equal(useProtoStore.getState().schemas.length, 1);
      assert.equal(useProtoStore.getState().schemas[0].id, res2.id);

      // Cascaded deletion: mappings referencing res1.id should be gone
      assert.equal(useProtoStore.getState().mappings.length, 1);
      assert.equal(useProtoStore.getState().mappings[0].protoId, res2.id);
    });
  });

  describe('Topic Mapping Management (addMapping, removeMapping)', () => {
    test('addMapping creates mapping record with trimmed properties and unique ID', () => {
      const res = useProtoStore.getState().addSchema('s.proto', VALID_PROTO_3);
      assert.ok(res.id);

      useProtoStore.getState().addMapping('  robot/sensors/**  ', res.id, '  robot.sensors.BatteryState  ');

      const mappings = useProtoStore.getState().mappings;
      assert.equal(mappings.length, 1);
      assert.ok(mappings[0].id);
      assert.equal(mappings[0].keyPattern, 'robot/sensors/**');
      assert.equal(mappings[0].protoId, res.id);
      assert.equal(mappings[0].messageTypeName, 'robot.sensors.BatteryState');
      assert.ok(mappings[0].createdAt > 0);
    });

    test('removeMapping removes specified mapping', () => {
      const res = useProtoStore.getState().addSchema('s.proto', VALID_PROTO_3);
      assert.ok(res.id);

      useProtoStore.getState().addMapping('m1/**', res.id, 'robot.sensors.BatteryState');
      useProtoStore.getState().addMapping('m2/**', res.id, 'robot.sensors.ImuData');

      const mappings = useProtoStore.getState().mappings;
      assert.equal(mappings.length, 2);
      const m1Id = mappings[0].id;

      useProtoStore.getState().removeMapping(m1Id);

      const remaining = useProtoStore.getState().mappings;
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].keyPattern, 'm2/**');
    });
  });

  describe('Topic Matching & Resolution (findMappingForKey)', () => {
    test('resolves exact match, single wildcard, and recursive wildcard', () => {
      const res = useProtoStore.getState().addSchema('s.proto', VALID_PROTO_3);
      assert.ok(res.id);

      useProtoStore.getState().addMapping('robot/battery', res.id, 'robot.sensors.BatteryState');
      useProtoStore.getState().addMapping('robot/sensors/*', res.id, 'robot.sensors.ImuData');
      useProtoStore.getState().addMapping('fleet/**', res.id, 'robot.sensors.BatteryState');

      // Exact match
      const matchExact = useProtoStore.getState().findMappingForKey('robot/battery');
      assert.ok(matchExact);
      assert.equal(matchExact.messageTypeName, 'robot.sensors.BatteryState');

      // Single-level wildcard match
      const matchSingle = useProtoStore.getState().findMappingForKey('robot/sensors/imu');
      assert.ok(matchSingle);
      assert.equal(matchSingle.messageTypeName, 'robot.sensors.ImuData');

      // Single-level does not match multi-level
      const matchSingleFail = useProtoStore.getState().findMappingForKey('robot/sensors/imu/raw');
      assert.equal(matchSingleFail, undefined);

      // Multi-level recursive match
      const matchMulti = useProtoStore.getState().findMappingForKey('fleet/robot1/arm/pose');
      assert.ok(matchMulti);
      assert.equal(matchMulti.messageTypeName, 'robot.sensors.BatteryState');

      // Non-matching key
      const noMatch = useProtoStore.getState().findMappingForKey('unrelated/topic');
      assert.equal(noMatch, undefined);
    });

    test('prioritizes exact match over wildcard and more specific prefix over general wildcard', () => {
      const res = useProtoStore.getState().addSchema('s.proto', VALID_PROTO_3);
      assert.ok(res.id);

      useProtoStore.getState().addMapping('**', res.id, 'GeneralFallback');
      useProtoStore.getState().addMapping('robot/**', res.id, 'RobotFallback');
      useProtoStore.getState().addMapping('robot/sensors/**', res.id, 'RobotSensorsRecursive');
      useProtoStore.getState().addMapping('robot/sensors/*', res.id, 'RobotSensorsSingle');
      useProtoStore.getState().addMapping('robot/sensors/battery', res.id, 'ExactBattery');

      // 1. Exact match has highest priority
      assert.equal(
        useProtoStore.getState().findMappingForKey('robot/sensors/battery')?.messageTypeName,
        'ExactBattery'
      );

      // 2. Single wildcard '*' has priority over recursive '**' at same depth
      assert.equal(
        useProtoStore.getState().findMappingForKey('robot/sensors/imu')?.messageTypeName,
        'RobotSensorsSingle'
      );

      // 3. Longest prefix recursive wildcard ('robot/sensors/**' vs 'robot/**' vs '**')
      assert.equal(
        useProtoStore.getState().findMappingForKey('robot/sensors/nested/depth/imu')?.messageTypeName,
        'RobotSensorsRecursive'
      );

      assert.equal(
        useProtoStore.getState().findMappingForKey('robot/actuators/arm')?.messageTypeName,
        'RobotFallback'
      );

      assert.equal(
        useProtoStore.getState().findMappingForKey('other/system/status')?.messageTypeName,
        'GeneralFallback'
      );
    });

    test('handles empty and whitespace keyExpr safely', () => {
      assert.equal(useProtoStore.getState().findMappingForKey(''), undefined);
      assert.equal(useProtoStore.getState().findMappingForKey('   '), undefined);
    });
  });

  describe('Message Types Aggregation (getAllMessageTypes)', () => {
    test('aggregates message types from all loaded schemas with proto metadata', () => {
      const res1 = useProtoStore.getState().addSchema('battery.proto', VALID_PROTO_3);
      const res2 = useProtoStore.getState().addSchema('status.proto', VALID_PROTO_2);

      const allTypes = useProtoStore.getState().getAllMessageTypes();
      assert.equal(allTypes.length, 3);
      assert.deepEqual(allTypes, [
        {
          protoId: res1.id,
          protoName: 'battery.proto',
          typeName: 'robot.sensors.BatteryState',
        },
        {
          protoId: res1.id,
          protoName: 'battery.proto',
          typeName: 'robot.sensors.ImuData',
        },
        {
          protoId: res2.id,
          protoName: 'status.proto',
          typeName: 'legacy.telemetry.StatusReport',
        },
      ]);
    });
  });

  describe('Compiled Root Cache (getCompiledRoot & getGlobalRoot)', () => {
    test('compiles, caches, and returns protobuf.Root instance for schema ID', () => {
      const res = useProtoStore.getState().addSchema('s.proto', VALID_PROTO_3);
      assert.ok(res.id);

      const root1 = useProtoStore.getState().getCompiledRoot(res.id);
      assert.ok(root1);
      const batteryType = root1.lookupType('robot.sensors.BatteryState');
      assert.ok(batteryType);

      // Caching: subsequent call should return the exact same instance reference
      const root2 = useProtoStore.getState().getCompiledRoot(res.id);
      assert.equal(root1, root2);
    });

    test('invalidates and rebuilds cached Root when schema is updated', () => {
      const res = useProtoStore.getState().addSchema('s.proto', VALID_PROTO_3);
      assert.ok(res.id);

      const root1 = useProtoStore.getState().getCompiledRoot(res.id);
      assert.ok(root1);

      const updatedProto = `
        syntax = "proto3";
        package robot.sensors;
        message NewType {
          string name = 1;
        }
      `;
      useProtoStore.getState().updateSchema(res.id, updatedProto);

      const root2 = useProtoStore.getState().getCompiledRoot(res.id);
      assert.ok(root2);
      assert.notEqual(root1, root2);
      assert.ok(root2.lookupType('robot.sensors.NewType'));
    });

    test('returns null for unknown schema ID', () => {
      const root = useProtoStore.getState().getCompiledRoot('unknown-id');
      assert.equal(root, null);
    });

    test('getGlobalRoot provides unified root covering types across schemas', () => {
      useProtoStore.getState().addSchema('s1.proto', VALID_PROTO_3);
      useProtoStore.getState().addSchema('s2.proto', VALID_PROTO_2);

      const globalRoot = useProtoStore.getState().getGlobalRoot();
      assert.ok(globalRoot);
      assert.ok(globalRoot.lookupType('robot.sensors.BatteryState'));
      assert.ok(globalRoot.lookupType('legacy.telemetry.StatusReport'));
    });
  });
});
