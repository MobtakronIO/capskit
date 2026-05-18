# Client SDK

The `@mobtakronio/capskit-client` package provides a typed client for calling CapsKit actions, subscribing to events, and managing offline operations from browser or Node.js environments.

---

## Installation

```bash
npm install @mobtakronio/capskit-client
```

---

## Creating a Client

```ts
import { createCapsKitClient } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto',
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | **required** | The server URL (e.g., `http://localhost:3000`) |
| `transport` | `'http' \| 'websocket' \| 'auto'` | `'http'` | Transport mode — see [Transport Options](#transport-options) |
| `auth` | `AuthConfig` | — | Authentication configuration |
| `retry` | `RetryConfig` | — | Retry configuration for failed requests |
| `websocket` | `WebSocketConfig` | — | WebSocket-specific configuration |
| `offline` | `OfflineConfig` | — | Offline queue configuration |
| `interceptors` | `InterceptorConfig` | — | Request/response interceptors |

#### AuthConfig

```ts
interface AuthConfig {
  token: () => string | Promise<string>;
  refresh?: () => Promise<string>;
}
```

#### RetryConfig

```ts
interface RetryConfig {
  maxRetries?: number;             // Default: 3
  backoff?: 'linear' | 'exponential' | 'none';  // Default: 'exponential'
  retryOn?: number[];              // Default: [429, 500, 502, 503, 504]
}
```

#### WebSocketConfig

```ts
interface WebSocketConfig {
  reconnect?: boolean;             // Default: true
  maxReconnectAttempts?: number;   // Unlimited if not set
  reconnectInterval?: number;      // Base delay in ms
  reconnectIntervalMax?: number;   // Maximum delay in ms
}
```

#### OfflineConfig

```ts
interface OfflineConfig {
  enabled?: boolean;               // Default: false
  maxQueueSize?: number;           // Default: 100
  storage?: 'indexeddb' | 'memory'; // Default: 'indexeddb' in browser
}
```

#### InterceptorConfig

```ts
interface InterceptorConfig {
  before?: ClientInterceptor[];
  after?: ClientInterceptor[];
}
```

---

## Transport Options

### HTTP (default)

```ts
const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'http',
});
```

All calls go through HTTP POST requests. Subscriptions are not supported in HTTP-only mode and will throw a `SubscriptionError`.

### WebSocket

```ts
const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'websocket',
});
```

All communication goes through a persistent WebSocket connection. The client auto-connects on creation. Supports real-time subscriptions.

### Auto

```ts
const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto',
});
```

Uses HTTP for `call()`, `emit()`, and `tell()` operations. Lazily opens a WebSocket connection only when `subscribe()` is called. Best of both worlds — no persistent connection overhead unless you need real-time events.

---

## API Reference

### `client.call<T>(actionPath, payload?, options?)`

Invoke a server-side action and return its result.

```ts
const result = await client.call<{ result: number }>('orders.sum', { a: 15, b: 30 });
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `actionPath` | `string` | Format: `capsule-name.action-name` (e.g., `orders.create-order`) |
| `payload` | `unknown` | Action input payload |
| `options` | `CallOptions` | Optional headers, timeout, or abort signal |

**CallOptions:**

```ts
interface CallOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}
```

### `client.use<T>(capsuleName)`

Get a typed proxy for a capsule. Each method on the proxy calls the corresponding action.

```ts
const orders = client.use('orders');
const result = await orders.sum({ a: 15, b: 30 });
// Equivalent to: client.call('orders.sum', { a: 15, b: 30 })
```

The proxy is built from the manifest if `loadManifest()` or `describe()` has been called, enabling IDE autocomplete for known actions.

### `client.emit(event, data)`

Publish an event to the server's events capsule.

```ts
const result = await client.emit('order.created', { orderId: '123' });
// result: { emitted: true, event: 'order.created' }
```

### `client.tell(actionPath, payload)`

Fire-and-forget dispatch. Sends the action without waiting for a result. Errors are silently ignored.

```ts
await client.tell('notifications.send-email', { to: 'user@example.com' });
```

### `client.describe()`

Fetch the server manifest — all capsules, caps, routes, and schemas.

```ts
const manifest = await client.describe();
console.log(manifest.capsuleCount); // 5
console.log(manifest.capCount);     // 23
```

Returns a `DescribeResult`:

```ts
interface DescribeResult {
  capsules: CapsuleManifest[];
  capsuleCount: number;
  capCount: number;
}
```

### `client.subscribe(pattern, handler)`

Subscribe to server events via WebSocket. Returns an unsubscribe function.

```ts
const unsub = client.subscribe('order.*', (data, event) => {
  console.log(`${event}:`, data);
});

// Later:
unsub();
```

**Requires** `transport: 'websocket'` or `transport: 'auto'`. Throws `SubscriptionError` in HTTP-only mode.

**Event patterns:**
- Exact match: `'order.created'`
- Single-segment wildcard: `'orders.*'` matches `orders.created`, `orders.cancelled`

### `client.loadManifest()`

Fetch and cache the server manifest for IDE autocomplete on `use()` proxies. Unlike `describe()`, this does not return the manifest — it stores it internally.

```ts
await client.loadManifest();

// Now the proxy knows available actions for autocomplete
const orders = client.use('orders');
// orders.sum, orders.createOrder, etc. are discoverable
```

### `client.disconnect()`

Close all connections and clear subscriptions.

```ts
await client.disconnect();
```

### `client.getQueueStatus()`

Get the current offline queue status.

```ts
const status = await client.getQueueStatus();
// { pending: 5, maxSize: 100, oldestEntry: Date('2026-05-15T10:30:00Z') }
```

### `client.flushQueue()`

Manually flush the offline queue.

```ts
await client.flushQueue();
```

### `client.clearQueue()`

Clear all pending offline operations.

```ts
await client.clearQueue();
```

---

## Reconnection Behavior

When using `websocket` or `auto` transport, the client automatically reconnects on connection loss:

1. **Exponential backoff** — delay doubles with each attempt (capped at `reconnectIntervalMax`)
2. **Subscription restoration** — active subscriptions are re-sent after reconnect
3. **Queue flushing** — offline-queued operations are replayed on reconnect

Configure reconnection via `websocket` options:

```ts
const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'websocket',
  websocket: {
    reconnect: true,
    maxReconnectAttempts: 10,
    reconnectInterval: 1000,
    reconnectIntervalMax: 30000,
  },
});
```

---

## Next Steps

- [Interceptors](./interceptors.md) — Request/response middleware pipeline
- [Offline](./offline.md) — Offline-first queue for disconnected operations
- [React](./react.md) — React hooks and provider
- [Vue](./vue.md) — Vue composables
- [Type Generator](./type-generator.md) — Generate TypeScript types from server manifest
- [WebSocket](./websocket.md) — WebSocket protocol details
