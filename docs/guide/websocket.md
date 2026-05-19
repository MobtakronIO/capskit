# WebSocket Protocol

CapsKit supports real-time communication via WebSocket through the built-in `websocket` capsule. This document describes the capsule interface, how to write an adapter for any framework, and the wire protocol for clients.

---

## Built-in WebSocket Capsule

CapsKit ships with a built-in `websocket` capsule that provides the `buildSocket` action. This action returns a socket configuration that any framework adapter can consume.

### Using the built-in capsule

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const capskit = await createCapsKit({ /* ... */ });

const config = await capskit.call('websocket.buildSocket', {
  body: { adapter: 'elysia' },
});
// config.sockets.default = { adapter: 'elysia', path: '/ws' }
```

The capsule returns a configuration object. Your framework adapter is responsible for:
1. Creating the WebSocket server
2. Handling the CapsKit wire protocol (call, emit, subscribe, etc.)
3. Managing client connections and subscriptions

---

## Writing a Framework Adapter

The adapter is responsible for receiving WebSocket frames, routing them to CapsKit (`call`, `emit`, `subscribe`, `tell`, `describe`), and sending responses back.

### Express + ws example

```ts
import { WebSocketServer } from 'ws';
import { createCapsKit } from '@mobtakronio/capskit';

const capskit = await createCapsKit({ /* ... */ });

const wss = new WebSocketServer({ path: '/ws/capskit', port: 3000 });

wss.on('connection', (ws) => {
  const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const subscriptions = new Map();

  ws.on('message', async (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }));
      return;
    }

    try {
      switch (frame.type) {
        case 'call': {
          const result = await capskit.call(frame.actionPath, frame.payload);
          ws.send(JSON.stringify({ type: 'response', id: frame.id, ok: true, result }));
          break;
        }
        case 'emit': {
          capskit.emit(frame.event, frame.data);
          break;
        }
        case 'subscribe': {
          subscriptions.set(frame.id, frame.patterns);
          // Register with your event bus to push events to this client
          break;
        }
        case 'unsubscribe': {
          subscriptions.delete(frame.id);
          break;
        }
        case 'describe': {
          const manifests = capskit.getManifests();
          ws.send(JSON.stringify({ type: 'manifest', id: frame.id, data: manifests }));
          break;
        }
        default:
          ws.send(JSON.stringify({ type: 'error', error: { code: 'UNKNOWN_FRAME', message: `Unknown frame type: ${frame.type}` } }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', id: frame.id, error: { code: 'ACTION_ERROR', message: err.message } }));
    }
  });

  ws.on('close', () => {
    // Clean up subscriptions
  });
});
```

### Fastify + @fastify/websocket example

```ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

const app = Fastify();
app.register(websocket);

app.register(async (fastify) => {
  fastify.get('/ws/capskit', { websocket: true }, (socket, req) => {
    const clientId = `ws-${Date.now()}`;
    const subscriptions = new Map();

    socket.on('message', async (raw) => {
      const frame = JSON.parse(raw.toString());
      // Same frame routing as Express example above
      const result = await capskit.call(frame.actionPath, frame.payload);
      socket.send(JSON.stringify({ type: 'response', id: frame.id, ok: true, result }));
    });
  });
});
```

### Hono + WebSocket example

```ts
import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.get('/ws/capskit', upgradeWebSocket((c) => ({
  onOpen: (_evt, ws) => {
    // Initialize client state
  },
  onMessage: async (evt, ws) => {
    const frame = JSON.parse(evt.data);
    const result = await capskit.call(frame.actionPath, frame.payload);
    ws.send(JSON.stringify({ type: 'response', id: frame.id, ok: true, result }));
  },
  onClose: () => {
    // Clean up
  },
})));
```

---

## Using the Elysia Adapter

The `@mobtakronio/capskit-elysia` package provides a ready-made WebSocket adapter:

```ts
import { createSocket } from '@mobtakronio/capskit-elysia/websocket';
import { capskit } from './capskit';

const sockets = createSocket(capskit, {
  path: '/ws/capskit', // default
});

const app = new Elysia().ws(sockets).listen(3000);
```

Or use the unified adapter for combined HTTP + WebSocket:

```ts
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';

const { app, sockets, shutdown } = await createElysiaAdapter(capskit, {
  http: true,
  websocket: true,
});

app.ws(sockets).listen(3000);
```

### Helper functions

```ts
import { getEventBus, getConnectedClients } from '@mobtakronio/capskit-elysia/websocket';

const bus = getEventBus();        // Access the shared EventBus instance
const count = getConnectedClients(); // Number of active WebSocket connections
```

---

## Connection

Connect to the WebSocket endpoint at:

```
ws://<host>:<port>/ws/capskit
```

The URL path depends on your adapter configuration.

---

## Frame Format

All frames are JSON objects sent over the WebSocket connection.

### Client-to-Server Frames

#### call

Invoke a server-side action.

**Request:**
```json
{
  "type": "call",
  "id": "req-1",
  "actionPath": "orders.sum",
  "payload": { "body": { "a": 15, "b": 30 } }
}
```

**Response (success):**
```json
{
  "type": "response",
  "id": "req-1",
  "ok": true,
  "result": 45,
  "durationMs": 12
}
```

**Response (error):**
```json
{
  "type": "response",
  "id": "req-1",
  "ok": false,
  "error": { "code": "VALIDATION", "message": "Missing required field: b" },
  "durationMs": 3
}
```

#### emit

Publish an event.

**Request:**
```json
{
  "type": "emit",
  "event": "order.created",
  "data": { "orderId": "123" }
}
```

#### tell

Fire-and-forget dispatch (no response expected).

**Request:**
```json
{
  "type": "tell",
  "actionPath": "notifications.send",
  "payload": { "body": { "to": "user@example.com" } }
}
```

#### subscribe

Subscribe to event patterns.

**Request:**
```json
{
  "type": "subscribe",
  "id": "sub-1",
  "patterns": ["order.*", "user.created"]
}
```

#### unsubscribe

Unsubscribe from event patterns.

**Request:**
```json
{
  "type": "unsubscribe",
  "id": "sub-1"
}
```

#### describe

Fetch the server manifest.

**Request:**
```json
{
  "type": "describe",
  "id": "req-4"
}
```

**Response:**
```json
{
  "type": "manifest",
  "id": "req-4",
  "data": [
    { "name": "orders", "actions": { ... }, "routes": [...] },
    { "name": "users", "actions": { ... }, "routes": [...] }
  ]
}
```

### Server-Pushed Frames

#### event

When subscribed, the server pushes events as frames:

```json
{
  "type": "event",
  "event": "order.created",
  "data": { "orderId": "123", "userId": "456" },
  "pattern": "order.*"
}
```

Event frames do not have an `id` field — they are server-initiated.

#### error

When a frame fails, the server sends an error frame:

```json
{
  "type": "error",
  "id": "req-1",
  "error": {
    "code": "ACTION_NOT_FOUND",
    "message": "Action 'orders.nonexistent' not found"
  }
}
```

### Common Error Codes

| Code | Description |
|---|---|
| `PARSE_ERROR` | Invalid JSON frame |
| `ACTION_NOT_FOUND` | The requested action does not exist |
| `VALIDATION` | Input failed schema validation |
| `ACTION_ERROR` | Action execution failed |
| `UNKNOWN_FRAME` | Unrecognized frame type |

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

- [HTTP Protocol](./http.md) — RESTful HTTP route exposure
- [Client SDK](./client.md) — Full client package documentation
- [Interceptors](./interceptors.md) — Request/response middleware pipeline
