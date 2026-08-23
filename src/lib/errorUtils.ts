/**
 * User-Friendly Error Formatter & Sanitizer for ZenohX
 * Translates low-level Rust, OS, IPC, and network error messages into
 * clear, polite, and actionable explanations for end users.
 */

export interface FriendlyError {
  /** Short, human-friendly title of the error */
  title: string;
  /** Primary gentle explanation of what went wrong */
  message: string;
  /** Optional recommendation or next step for the user */
  suggestion?: string;
  /** Formatted full string combining message and suggestion */
  fullMessage: string;
}

/**
 * Strips raw internal Rust wrappers (e.g. `Custom { kind: ..., error: "..." }` or `zenoh::net::link::...`)
 */
export function sanitizeErrorMessage(rawMessage: string): string {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'An unknown error occurred.';
  }

  let cleaned = rawMessage.trim();

  // Match Custom { kind: ..., error: "..." }
  const customMatch = cleaned.match(/error:\s*["']([^"']+)["']/i);
  if (customMatch && customMatch[1]) {
    cleaned = customMatch[1].trim();
  }

  // Remove common Rust module prefixes like `zenoh::net::link::unicast::...: `
  cleaned = cleaned.replace(/^[a-zA-Z0-9_]+(?:::[a-zA-Z0-9_]+)+:\s*/g, '');

  // Strip redundant "Error: " or "Failed to execute: " prefix if nested
  cleaned = cleaned.replace(/^(?:Error|Failed to [^:]+):\s*/i, '');

  return cleaned.trim() || 'An unexpected issue occurred.';
}

/**
 * Parses any unknown error (Error instance, string, or object) and returns
 * a user-friendly, gentle error description with a title and actionable recommendation.
 */
export function formatFriendlyError(err: unknown, fallbackContext?: string): FriendlyError {
  let raw = '';
  if (err instanceof Error) {
    raw = err.message || err.name;
  } else if (typeof err === 'string') {
    raw = err;
  } else if (err && typeof err === 'object') {
    raw = JSON.stringify(err);
  } else {
    raw = '';
  }

  const lower = raw.toLowerCase();

  // 1. Connection Refused / Unreachable
  if (
    lower.includes('connection refused') ||
    lower.includes('os error 111') ||
    lower.includes('econnrefused') ||
    lower.includes('connect failed') ||
    lower.includes('no route to host') ||
    lower.includes('endpoint unreachable')
  ) {
    const title = 'Connection Failed';
    const message = 'Unable to connect to the Zenoh router.';
    const suggestion = 'Please verify that the router is running and the address/port is reachable.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 2. DNS / Host Resolution
  if (
    lower.includes('failed to lookup address') ||
    lower.includes('name or service not known') ||
    lower.includes('enotfound') ||
    lower.includes('could not resolve host')
  ) {
    const title = 'Host Unresolved';
    const message = 'The router address could not be resolved.';
    const suggestion = 'Please check the hostname or IP address in your connection profile.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 3. Timeouts
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('deadline has elapsed')
  ) {
    const title = 'Request Timed Out';
    const message = 'The operation timed out waiting for a response.';
    const suggestion = 'Check your network connectivity or increase the query timeout setting.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 4. TLS / SSL Handshake
  if (
    lower.includes('tls') ||
    lower.includes('ssl') ||
    lower.includes('certificate') ||
    lower.includes('handshake') ||
    lower.includes('unknownissuer') ||
    lower.includes('unknown ca')
  ) {
    const title = 'TLS / SSL Security Error';
    const message = 'Secure connection handshake failed.';
    const suggestion = 'Verify your SSL certificates, CA configuration, or encryption parameters.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 5. Authentication & Permissions
  if (
    lower.includes('unauthorized') ||
    lower.includes('authentication') ||
    lower.includes('bad credentials') ||
    lower.includes('permission denied') ||
    lower.includes('access denied')
  ) {
    const title = 'Authentication Failed';
    const message = 'Authentication was rejected by the Zenoh router.';
    const suggestion = 'Please verify your username, password, or token in the profile.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 6. Payload & Parsing
  if (
    lower.includes('invalid json') ||
    lower.includes('json.parse') ||
    lower.includes('unexpected token') ||
    lower.includes('failed to serialize')
  ) {
    const title = 'Invalid Payload Syntax';
    const message = 'The payload has invalid syntax.';
    const suggestion = 'Please check for formatting errors in your JSON or CBOR payload.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 7. Session Disconnected / Closed
  if (
    lower.includes('session closed') ||
    lower.includes('session not found') ||
    lower.includes('not connected') ||
    lower.includes('session terminated')
  ) {
    const title = 'Session Inactive';
    const message = 'The connection to the Zenoh router is closed.';
    const suggestion = 'Please connect to an active profile to resume streaming or queries.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 8. Auto-Updater Endpoint
  if (
    lower.includes('could not fetch a valid release json') ||
    lower.includes('release endpoint') ||
    lower.includes('status code 404') ||
    lower.includes('notfound')
  ) {
    const title = 'Update Check';
    const message = 'No newer version is available.';
    const suggestion = 'You are already running the latest build of ZenohX.';
    return {
      title,
      message,
      suggestion,
      fullMessage: `${message} ${suggestion}`,
    };
  }

  // 9. Generic Fallback with sanitized message
  const cleaned = sanitizeErrorMessage(raw);
  const fallbackTitle = fallbackContext || 'Operation Error';
  return {
    title: fallbackTitle,
    message: cleaned || 'An unexpected issue occurred.',
    fullMessage: cleaned || 'An unexpected issue occurred.',
  };
}
