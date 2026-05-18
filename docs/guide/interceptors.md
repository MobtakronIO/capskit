# Interceptors

Interceptors are middleware functions that run before and after each client call. They enable cross-cutting concerns like logging, authentication, retry logic, and error normalization.

---

## Interceptor Interface

```ts
interface ClientInterceptor {
  name: string;
  before?: (ctx: InterceptorContext) => Promise<InterceptorContext> | InterceptorContext;
  after?: (ctx: InterceptorContext) => Promise<InterceptorContext> | InterceptorContext;
}
```

### InterceptorContext

```ts
interface InterceptorContext {
  actionPath: string;
  payload: unknown;
  result?: unknown;
  error?: unknown;
  durationMs?: number;
  metadata: Record<string, unknown>;
}
```

| Field | Phase | Description |
|---|---|---|
| `actionPath` | before/after | The action being called (e.g., `orders.sum`) |
| `payload` | before | The request payload |
| `result` | after | The response from the server |
| `error` | after | Any error that occurred |
| `durationMs` | after | Time taken for the call |
| `metadata` | before/after | Shared state between interceptors |

---

## Execution Order

```
before[0] → before[1] → ... → HTTP Call → after[0] → after[1] → ...
```

Interceptors run in the order they are registered. All `before` hooks execute before the call, then the call executes, then all `after` hooks execute.

### Short-Circuiting

If a `before` hook sets `ctx.result`, the pipeline short-circuits and returns that result without making the actual call:

```ts
const cacheInterceptor: ClientInterceptor = {
  name: 'cache',
  before: (ctx) => {
    const cached = cache.get(ctx.actionPath);
    if (cached) {
      ctx.result = cached;
    }
    return ctx;
  },
};
```

---

## buildInterceptorPipeline()

The core pipeline builder function. Used internally by the client, but available for custom use cases.

```ts
import { buildInterceptorPipeline } from '@mobtakronio/capskit-client';

const result = await buildInterceptorPipeline(
  interceptors,   // ClientInterceptor[]
  executor,       // (actionPath, payload) => Promise<unknown>
  'orders.sum',   // actionPath
  { a: 1, b: 2 }, // payload
);
```

---

## Built-in Interceptors

### loggingInterceptor

Logs action calls with duration.

```ts
import { loggingInterceptor } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  interceptors: {
    after: [loggingInterceptor({ level: 'info' })],
  },
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `logger` | `(msg: string) => void` | `console.log` | Custom logging function |
| `level` | `'info' \| 'debug' \| 'warn'` | `'info'` | Log verbosity |

**Output:**
```
[CapsKit] ✓ orders.sum — 42ms
[CapsKit] ✗ orders.delete — 120ms
```

In `debug` mode, also logs the payload and error details.

### authInterceptor

Injects an authentication token into the request.

```ts
import { authInterceptor } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  interceptors: {
    before: [
      authInterceptor({
        getToken: () => localStorage.getItem('token') ?? '',
        headerName: 'Authorization',
        headerPrefix: 'Bearer ',
      }),
    ],
  },
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `getToken` | `() => string \| Promise<string>` | **required** | Function that returns the auth token |
| `headerName` | `string` | `'Authorization'` | HTTP header name |
| `headerPrefix` | `string` | `'Bearer '` | Token prefix |

### errorNormalizationInterceptor

Normalizes raw errors into `CapsKitClientError` instances.

```ts
import { errorNormalizationInterceptor } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  interceptors: {
    after: [errorNormalizationInterceptor()],
  },
});
```

Converts:
- `Error` instances → `ActionExecutionError`
- Plain strings → `CapsKitClientError`
- Error objects → `CapsKitClientError` with details

### retryInterceptor

Retries failed calls with configurable backoff.

```ts
import { retryInterceptor } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  interceptors: {
    after: [
      retryInterceptor({
        maxRetries: 3,
        backoff: 'exponential',
        retryOn: [429, 500, 502, 503, 504],
      }),
    ],
  },
});
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `3` | Maximum retry attempts |
| `backoff` | `'linear' \| 'exponential' \| 'none'` | `'exponential'` | Delay strategy |
| `retryOn` | `number[]` | `[429, 500, 502, 503, 504]` | HTTP status codes to retry |

**Backoff delays:**
- `exponential`: `1000 * 2^attempt` ms (capped at 30s)
- `linear`: `1000 * (attempt + 1)` ms
- `none`: 0ms delay

---

## Writing Custom Interceptors

### Timing Interceptor

```ts
import { ClientInterceptor } from '@mobtakronio/capskit-client';

const timingInterceptor: ClientInterceptor = {
  name: 'timing',
  before: (ctx) => {
    ctx.metadata.startTime = Date.now();
    return ctx;
  },
  after: (ctx) => {
    const duration = Date.now() - (ctx.metadata.startTime as number);
    console.log(`${ctx.actionPath} took ${duration}ms`);
    return ctx;
  },
};
```

### Caching Interceptor

```ts
const cache = new Map<string, unknown>();

const cacheInterceptor: ClientInterceptor = {
  name: 'cache',
  before: (ctx) => {
    const key = `${ctx.actionPath}:${JSON.stringify(ctx.payload)}`;
    if (cache.has(key)) {
      ctx.result = cache.get(key);
    }
    return ctx;
  },
  after: (ctx) => {
    if (ctx.result && !ctx.error) {
      const key = `${ctx.actionPath}:${JSON.stringify(ctx.payload)}`;
      cache.set(key, ctx.result);
    }
    return ctx;
  },
};
```

---

## Interceptor Ordering

The order of interceptors matters. Common patterns:

### Recommended Stack

```ts
const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  interceptors: {
    before: [
      authInterceptor({ getToken }),    // 1. Auth first
      cacheInterceptor,                  // 2. Then check cache
    ],
    after: [
      retryInterceptor(),                // 1. Retry on failure
      errorNormalizationInterceptor(),   // 2. Normalize errors
      loggingInterceptor(),              // 3. Log last (sees final state)
    ],
  },
});
```

**Why this order:**
- Auth runs before everything — no point checking cache for unauthorized requests
- Cache check before the call — avoid unnecessary network requests
- Retry before error normalization — retry needs raw error to check status codes
- Logging last — sees the final result/error after all transformations

---

## Next Steps

- [Client SDK](./client.md) — Full client package documentation
- [Offline](./offline.md) — Offline-first queue for disconnected operations
- [WebSocket](./websocket.md) — WebSocket protocol details
