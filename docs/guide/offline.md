# Offline Support

The client SDK includes an offline queue that buffers operations when the browser loses connectivity, then replays them when the connection is restored.

---

## OfflineQueue Class

The `OfflineQueue` provides a durable queue backed by IndexedDB (browser) or in-memory storage (Node.js/SSR).

```ts
import { OfflineQueue } from '@mobtakronio/capskit-client';

const queue = new OfflineQueue({
  maxQueueSize: 100,
  storage: 'indexeddb',
});
```

### Storage Modes

| Mode | Environment | Persistence | Description |
|---|---|---|---|
| `indexeddb` | Browser | Yes | Uses IndexedDB for durable storage across page reloads |
| `memory` | Node.js / SSR | No | In-memory array, lost on process exit |

The client auto-detects the best mode: `indexeddb` in browsers, `memory` in Node.js.

---

## How It Works

### Enabling Offline Mode

```ts
const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  offline: {
    enabled: true,
    maxQueueSize: 100,
    storage: 'indexeddb',
  },
});
```

### Behavior When Offline

When `navigator.onLine` is `false`:

1. **`client.call()`** — The operation is enqueued instead of sent. A Promise is returned that resolves when the operation is replayed.
2. **`client.emit()`** — Same as `call()` — queued for later delivery.
3. **Auto-flush** — When the browser fires the `online` event, the queue is automatically flushed.

### Queue Entry Format

```ts
interface QueueEntry {
  id: string;          // Auto-generated unique ID
  actionPath: string;  // e.g., 'orders.create-order' or event pattern
  payload: unknown;    // The call/emit payload
  timestamp: number;   // When the entry was enqueued
  type: 'call' | 'emit';
}
```

---

## Queue Management API

### `client.getQueueStatus()`

Check the current queue state.

```ts
const status = await client.getQueueStatus();
// { pending: 5, maxSize: 100, oldestEntry: Date('2026-05-15T10:30:00Z') }
```

Returns a `QueueStatus`:

```ts
interface QueueStatus {
  pending: number;         // Number of queued entries
  maxSize: number;         // Maximum queue size
  oldestEntry: Date | null; // Timestamp of oldest entry
}
```

### `client.flushQueue()`

Manually trigger a flush of all queued operations.

```ts
await client.flushQueue();
```

Operations are replayed in FIFO order (oldest first). Each operation's Promise is resolved or rejected based on the server response.

### `client.clearQueue()`

Discard all queued operations.

```ts
await client.clearQueue();
```

All pending Promises are rejected with an `OfflineError`.

---

## OfflineQueue Direct API

For advanced use cases, the `OfflineQueue` class can be used directly:

```ts
import { OfflineQueue } from '@mobtakronio/capskit-client';

const queue = new OfflineQueue({ maxQueueSize: 50 });

// Add an entry
const entry = await queue.enqueue({
  actionPath: 'orders.create',
  payload: { items: [{ id: 1 }] },
  type: 'call',
});

// Check size
const size = await queue.size(); // 1

// Peek at oldest entry
const oldest = await queue.peek();

// Get all entries (sorted by timestamp)
const entries = await queue.getAll();

// Remove oldest entry
const removed = await queue.dequeue();

// Clear everything
await queue.clear();
```

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable offline queuing |
| `maxQueueSize` | `number` | `100` | Maximum entries in queue |
| `storage` | `'indexeddb' \| 'memory'` | Auto-detect | Storage backend |

### Max Queue Size

When the queue reaches `maxQueueSize`, the oldest entry is dropped to make room for the new one. This prevents unbounded memory/disk growth.

---

## Reconnection Flow

1. Browser detects online (`window.addEventListener('online', ...)`)
2. Client calls `flushOfflineQueue()`
3. Entries are replayed in order via the interceptor pipeline
4. Each entry's pending Promise is resolved with the server response
5. Queue is cleared after all entries are processed

If a replayed operation fails, its Promise is rejected but remaining operations continue to be replayed.

---

## Next Steps

- [Client SDK](./client.md) — Full client package documentation
- [Interceptors](./interceptors.md) — Request/response middleware pipeline
- [WebSocket](./websocket.md) — WebSocket protocol details
