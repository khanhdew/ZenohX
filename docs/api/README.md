# ZenohX MCP API Documentation

ZenohX provides a comprehensive Model Context Protocol (MCP) toolset. These tools allow AI assistants to programmatically inspect network topologies, scout Zenoh peers, publish and subscribe to data streams, and query distributed storage.

## Tools

### `zenoh_scout`

Scans the local physical network via multicast for external Zenoh routers, peers, and locators. NOTE: To inspect or interact with nodes inside the ZenohX app, use 'zenoh_get_sessions' or 'zenoh_get_profiles' instead.

**Input Parameters:**

- `timeout_ms` (integer, Optional): Scouting timeout in milliseconds (default: 1000) Default: `1000`.

### `zenoh_connect_session`

Starts/opens a Zenoh session. To start an existing node configured in the app, pass 'profile_id' (retrieve IDs via 'zenoh_get_profiles'). Only pass mode/locators without profile_id if an ad-hoc session is explicitly requested.

**Input Parameters:**

- `profile_id` (string, Optional): Optional saved profile ID to load connection configuration from
- `mode` (string, Optional): Zenoh session mode (default: client) Must be one of: "peer", "client", "router".
- `connect_locators` (array of strings, Optional): List of endpoint locators to connect to
- `listen_locators` (array of strings, Optional): List of endpoint locators to listen on
- `username` (string, Optional): Optional username for user authentication
- `password` (string, Optional): Optional password for user authentication
- `token` (string, Optional): Optional token for token-based authentication
- `user_auth` (object, Optional): Optional user authentication object with username/password/token

### `zenoh_disconnect_session`

Disconnects an active Zenoh session, or all active sessions if session_id is omitted.

**Input Parameters:**

- `session_id` (string, Optional): UUID of the session to disconnect. If omitted, disconnects all sessions.

### `zenoh_get_sessions`

Returns active Zenoh nodes/sessions currently running in the ZenohX app. ALWAYS call this first to discover active node sessions before subscribing, publishing, or creating new sessions.

**Input Parameters:** None

### `zenoh_get_profiles`

Lists all saved connection profiles (nodes) configured in the ZenohX app (e.g. Local Router, Edge Client). Use this to see configured nodes and retrieve their profile IDs.

**Input Parameters:** None

### `zenoh_create_profile`

Creates a new connection profile (node) in ZenohX, saves it to SQLite so it appears in the GUI, and optionally connects it immediately.

**Input Parameters:**

- `name` (string, **Required**): Display name of the new node profile (e.g. 'R3', 'Edge Sensor')
- `mode` (string, **Required**): Zenoh operation mode Must be one of: "peer", "client", "router".
- `connect_locators` (array of strings, Optional): List of connect locators (e.g. ['tcp/127.0.0.1:7448'])
- `listen_locators` (array of strings, Optional): List of listen locators (e.g. ['tcp/0.0.0.0:7449'])
- `scout_multicast` (boolean, Optional): Enable or disable multicast scouting (default: true) Default: `true`.
- `connect_now` (boolean, Optional): If true, immediately opens an active Zenoh session for this new profile after saving Default: `false`.
- `username` (string, Optional): Optional username for user authentication
- `password` (string, Optional): Optional password for user authentication
- `token` (string, Optional): Optional token for token-based authentication
- `user_auth` (object, Optional): Optional user authentication object with username/password/token

### `zenoh_edit_profile`

Edits an existing connection profile (node) in ZenohX. You can update its name, connect locators, listen locators, multicast scouting, or user authentication. NOTE: The Zenoh operation mode (peer/client/router) CANNOT be changed.

**Input Parameters:**

- `profile_id` (string, **Required**): ID of the profile to edit
- `name` (string, Optional): New display name for the profile
- `connect_locators` (array of strings, Optional): New list of connect locators (e.g. ['tcp/192.168.1.50:7447'])
- `listen_locators` (array of strings, Optional): New list of listen locators (e.g. ['tcp/0.0.0.0:7447'])
- `scout_multicast` (boolean, Optional): Enable or disable multicast scouting
- `username` (string, Optional): Optional username for user authentication
- `password` (string, Optional): Optional password for user authentication
- `token` (string, Optional): Optional token for token-based authentication
- `user_auth` (object, Optional): Optional user authentication object with username/password/token
- `restart_session` (boolean, Optional): If true and the profile currently has an active running session, disconnect and restart the session with the updated profile configuration

### `zenoh_publish`

Publishes a data sample to the specified Zenoh key expression. Specify 'session_id' to publish through an existing running node session (from zenoh_get_sessions).

**Input Parameters:**

- `key_expr` (string, **Required**): Zenoh key expression to publish to
- `payload` (string, **Required**): Payload data (string or serialized JSON)
- `encoding` (string, Optional): MIME type / encoding (default: text/plain) Default: `text/plain`.
- `priority` (string, Optional): Zenoh priority QoS Must be one of: "real_time", "interactive_high", "interactive_low", "data_high", "data", "data_low", "background".
- `session_id` (string, Optional): Optional session UUID to use for publishing

### `zenoh_subscribe`

Declares a subscriber on a key expression to capture incoming samples. Specify 'session_id' to attach the subscriber to a specific running node session (from zenoh_get_sessions).

**Input Parameters:**

- `key_expr` (string, **Required**): Zenoh key expression to subscribe to
- `session_id` (string, Optional): Optional session UUID to subscribe on

### `zenoh_unsubscribe`

Cancels an active Zenoh subscription by subscription_id.

**Input Parameters:**

- `subscription_id` (string, **Required**): Subscription UUID to unsubscribe
- `session_id` (string, Optional): Optional session UUID

### `zenoh_get_messages`

Reads captured message buffers or SQLite message history.

**Input Parameters:**

- `key_expr` (string, Optional): Optional key expression filter
- `limit` (integer, Optional): Maximum number of messages to return (default: 50) Default: `50`.
- `profile_id` (string, Optional): Optional profile ID filter

### `zenoh_query`

Issues a Zenoh GET query and collects all replies.

**Input Parameters:**

- `key_expr` (string, **Required**): Zenoh key expression or selector to query
- `target` (string, Optional): Query target routing policy (default: all) Must be one of: "all", "best_matching", "complete". Default: `all`.
- `timeout_ms` (integer, Optional): Query timeout in milliseconds (default: 5000) Default: `5000`.
- `payload` (string, Optional): Optional query predicate payload
- `session_id` (string, Optional): Optional session UUID to use

### `zenoh_declare_queryable`

Registers a queryable endpoint that automatically returns a predefined response or executes dynamic JavaScript script responses.

**Input Parameters:**

- `key_expr` (string, **Required**): Zenoh key expression for the queryable
- `reply_payload` (string, Optional): Static payload string returned in replies (optional if script_code is provided)
- `script_code` (string, Optional): JavaScript code to dynamically compute query replies. Receives 'query' with { keyExpr, params, payload, timestamp }. Return a JSON object/string or explicit { payload, encoding, keyExpr }.
- `encoding` (string, Optional): Reply encoding (default: text/plain) Default: `text/plain`.
- `session_id` (string, Optional): Optional session UUID to register on

### `zenoh_inspect_topology`

Queries admin space (@/admin/**) to discover routers, peers, and links.

**Input Parameters:**

- `session_id` (string, Optional): Optional session UUID
- `max_depth` (integer, Optional): Maximum recursion depth (default: 3) Default: `3`.
- `timeout_ms` (integer, Optional): Timeout in milliseconds (default: 2000) Default: `2000`.

### `zenohx_gui_switch_workspace`

Switches the active workspace tab in the ZenohX desktop interface.

**Input Parameters:**

- `workspace` (string, **Required**): Target workspace tab Must be one of: "pubsub", "query", "traffic", "topology", "settings".

### `zenohx_gui_get_state`

Retrieves GUI state: current tab, active profile, and connection status.

**Input Parameters:** None

## Resources

### `zenohx://sessions`

**Name:** Active Zenoh Sessions

**Description:** JSON summary of active Zenoh sessions and status

**MIME Type:** `application/json`

### `zenohx://profiles`

**Name:** Connection Profiles

**Description:** List of saved connection profiles from SQLite

**MIME Type:** `application/json`

### `zenohx://messages/recent`

**Name:** Recent Messages

**Description:** Snapshot of recently published and received messages

**MIME Type:** `application/json`

### `zenohx://topology`

**Name:** Discovered Topology

**Description:** Discovered topology nodes, routers, and connectivity graph

**MIME Type:** `application/json`
