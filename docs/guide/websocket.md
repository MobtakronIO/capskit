# WebSocket Protocol

CapsKit supports real-time communication via WebSocket. This document describes the wire protocol for clients implementing WebSocket connections.

---

## Connection

Connect to the WebSocket endpoint at:

```
ws://<host>:<port>/ws
```

The URL path may vary depending on your adapter configuration.

---

## Frame Format

All frames are JSON objects with a `command` field and optional `payload` and `id` fields:

```json
{
  "command": "call",
  "id": "req-1",
  "payload": {
    "actionPath": "orders.sum",
    "body": { "a": 15, "b": 30 }
  }
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `command` | `string` | Yes | The operation type |
| `id` | `string` | Yes | Unique request ID for correlating responses |
| `payload` | `object` | Yes | Command-specific data |

---

## Commands

### call

Invoke a server-side action.

**Request:**
```json
{
  "command": "call",
  "id": "req-1",
  "payload": {
    "actionPath": "orders.sum",
    "body": { "a": 15, "b": 30 }
  }
}
```

**Response (success):**
```json
{
  "id": "req-1",
  "type": "response",
  "data": { "result": 45 }
}
```

**Response (error):**
```json
{
  "id": "req-1",
  "type": "error",
  "error": {
    "code": "VALIDATION",
    "message": "Missing required field: b"
  }
}
```

### emit

Publish an event.

**Request:**
```json
{
  "command": "emit",
  "id": "req-2",
  "payload": {
    "event": "order.created",
    "data": { "orderId": "123" }
  }
}
```

**Response:**
```json
{
  "id": "req-2",
  "type": "response",
  "data": { "emitted": true, "event": "order.created" }
}
```

### tell

Fire-and-forget dispatch (no response expected).

**Request:**
```json
{
  "command": "tell",
  "id": "req-3",
  "payload": {
    "actionPath": "notifications.send",
    "body": { "to": "user@example.com" }
  }
}
```

### subscribe

Subscribe to event patterns.

**Request:**
```json
{
  "command": "subscribe",
  "id": "sub-1",
  "payload": {
    "patterns": ["order.*", "user.created"]
  }
}
```

**Response:**
```json
{
  "id": "sub-1",
  "type": "response",
  "data": { "subscribed": true }
}
```

### unsubscribe

Unsubscribe from event patterns.

**Request:**
```json
{
  "command": "unsubscribe",
  "id": "unsub-1",
  "payload": {
    "subscriptionId": "sub-1"
  }
}
```

### describe

Fetch the server manifest.

**Request:**
```json
{
  "command": "describe",
  "id": "req-4"
}
```

**Response:**
```json
{
  "id": "req-4",
  "type": "response",
  "data": {
    "capsules": [...],
    "capsuleCount": 5,
    "capCount": 23
  }
}
```

---

## Server-Pushed Events

When subscribed, the server pushes events as frames:

```json
{
  "type": "event",
  "event": "order.created",
  "data": { "orderId": "123", "userId": "456" }
}
```

Note: Event frames do not have a `command` or `id` field — they are server-initiated.

---

## Ping/Pong

The server sends periodic `ping` frames. Clients should respond with `pong`:

**Server ping:**
```json
{ "command": "ping" }
```

**Client pong:**
```json
{ "command": "pong" }
```

---

## Error Frames

When a command fails, the server sends an error frame:

```json
{
  "id": "req-1",
  "type": "error",
  "error": {
    "code": "ACTION_NOT_FOUND",
    "message": "Action 'orders.nonexistent' not found",
    "details": {
      "actionPath": "orders.nonexistent"
    }
  }
}
```

### Common Error Codes

| Code | Description |
|---|---|
| `ACTION_NOT_FOUND` | The requested action does not exist |
| `VALIDATION` | Input failed schema validation |
| `AUTHORIZATION` | Caller lacks required permissions |
| `INTERNAL_ERROR` | Unexpected server error |

---

## Reconnection Behavior

The client SDK handles reconnection automatically when configured:

1. **Exponential backoff** — Delay doubles with each attempt
2. **Re-subscription** — Active subscriptions are re-sent after reconnect
3. **Queue flushing** — Offline-queued operations are replayed

### Manual Reconnection

For custom clients, implement reconnection with:

```ts
function connectWithRetry(url: string, maxAttempts: number) {
  let attempts = 0;

  function tryConnect() {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      attempts = 0;
      // Re-subscribe to patterns
    };

    ws.onclose = () => {
      if (attempts < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempts, 30000);
        attempts++;
        setTimeout(tryConnect, delay);
      }
    };

    return ws;
  }

  return tryConnect();
}
```

---

## Next Steps

- [Client SDK](./client.md) — Full client package documentation
- [Interceptors](./interceptors.md) — Request/response middleware pipeline
- [Offline](./offline.md) — Offline-first queue for disconnected operations
