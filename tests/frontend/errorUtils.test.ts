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
import { formatFriendlyError, sanitizeErrorMessage } from '../../src/lib/errorUtils';

describe('Error Formatting Utilities (errorUtils)', () => {
  test('formats connection refused errors gently', () => {
    const raw = 'Failed to connect session: zenoh::net::link::unicast::... connection refused (os error 111)';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Connection Failed');
    assert.match(result.message, /Unable to connect to the Zenoh router/i);
    assert.match(result.suggestion || '', /verify that the router is running/i);
    assert.match(result.fullMessage, /Unable to connect to the Zenoh router/i);
  });

  test('formats DNS / host lookup errors gently', () => {
    const raw = 'failed to lookup address information: Name or service not known';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Host Unresolved');
    assert.match(result.message, /router address could not be resolved/i);
    assert.match(result.suggestion || '', /hostname or IP address/i);
  });

  test('formats timeout errors gently', () => {
    const raw = 'zenoh query timed out after 3000ms';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Request Timed Out');
    assert.match(result.message, /timed out/i);
    assert.match(result.suggestion || '', /network connectivity/i);
  });

  test('formats TLS / SSL handshake failures gently', () => {
    const raw = 'TLS handshake failed: invalid peer certificate: UnknownIssuer';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'TLS / SSL Security Error');
    assert.match(result.message, /Secure connection handshake failed/i);
    assert.match(result.suggestion || '', /certificates/i);
  });

  test('formats authentication failures gently', () => {
    const raw = 'unauthorized: bad credentials provided for user admin';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Authentication Failed');
    assert.match(result.message, /Authentication was rejected/i);
    assert.match(result.suggestion || '', /username, password, or token/i);
  });

  test('formats payload parsing errors gently', () => {
    const raw = 'JSON.parse: Unexpected token } in JSON at position 14';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Invalid Payload Syntax');
    assert.match(result.message, /payload has invalid syntax/i);
  });

  test('formats disconnected / closed session errors gently', () => {
    const raw = 'Session not found: session closed or terminated';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Session Inactive');
    assert.match(result.message, /connection to the Zenoh router is closed/i);
  });

  test('formats update check endpoint errors gently', () => {
    const raw = 'Could not fetch a valid release JSON from endpoint';
    const result = formatFriendlyError(raw);

    assert.equal(result.title, 'Update Check');
    assert.match(result.message, /No newer version is available/i);
  });

  test('sanitizes and strips internal rust debug wrappers for unknown errors', () => {
    const raw = 'Failed to execute: Custom { kind: Other, error: "Something went wrong in driver" }';
    const cleaned = sanitizeErrorMessage(raw);
    assert.ok(!cleaned.includes('Custom { kind'));
    assert.match(cleaned, /Something went wrong in driver/);
  });

  test('handles null, undefined, and non-Error objects safely', () => {
    const resultNull = formatFriendlyError(null);
    assert.equal(resultNull.title, 'Operation Error');
    assert.ok(resultNull.message.length > 0);

    const resultObj = formatFriendlyError({ custom: 'err' });
    assert.equal(resultObj.title, 'Operation Error');
    assert.ok(resultObj.message.length > 0);
  });
});
