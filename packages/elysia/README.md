# @mobtakronio/capskit-elysia

Unified Elysia adapter for CapsKit with HTTP and WebSocket support.

## Installation

```bash
npm install @mobtakronio/capskit-elysia
# or
pnpm add @mobtakronio/capskit-elysia
# or
yarn add @mobtakronio/capskit-elysia
```

## Requirements

- **Elysia**: `^1.4.27`
- **CapsKit**: `^0.3.0` (peer dependency)

## Version Compatibility

| Adapter Version | Elysia Version | CapsKit Version |
|-----------------|----------------|-----------------|
| `0.1.x`        | `^1.4.27`     | `^0.3.0`       |

### Upgrade Policy

- **Minor versions** (0.x.y) may add new features while maintaining backward compatibility
- **Patch versions** (0.0.x) are bug fixes only
- Breaking changes will increment the major version and be documented in the [migration guide](../../guide/adapters/elysia-migration.md)

## Quick Start

```ts
import { Elysia } from 'elysia';
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
});

const adapter = await createElysiaAdapter(capskit, {
  http: true,
  websocket: true
});

new Elysia()
  .use(adapter.app)
  .listen(3000);
```

## Adapter Options

### `CreateElysiaAdapterOptions`

```ts
interface CreateElysiaAdapterOptions {
  /**
   * Enable HTTP transport.
   * - `true` - enable with default options
   * - `HttpOptions` - enable with custom options
   * - `false` or `undefined` - disabled
   */
  http?: boolean | HttpOptions;

  /**
   * Enable WebSocket transport.
   * - `true` - enable with default options
   * - `WebSocketOptions` - enable with custom options (reserved for future)
   * - `false` or `undefined` - disabled
   */
  websocket?: boolean | WebSocketOptions;

  /**
   * @deprecated Use hook caps instead. See docs/guide/hooks.md
   * Shared trait handlers applied to both HTTP and WebSocket transports.
   * Can be overridden per-transport via transport-specific options.
   * Hooks are now handled by the kernel via meta.hooks and capsuleDef.hooks.
   * This field will be removed in a future version.
   */
  traitHandlers?: Record<string, TraitHandler>;

  /**
   * Called when the adapter is fully initialized and ready.
   * Use for warm-up tasks, connection pool priming, etc.
   */
  onReady?: () => void | Promise<void>;

  /**
   * Called during graceful shutdown.
   * Use for cleanup tasks like closing DB connections, flushing buffers.
   */
  onClose?: () => void | Promise<void>;

  /**
   * Called for any unhandled errors in the adapter lifecycle.
   * If not provided, errors are logged to console.
   */
  onError?: (error: unknown) => void | Promise<void>;
}
```

### `HttpOptions`

```ts
interface HttpOptions {
  /**
   * @deprecated Use hook caps instead. See docs/guide/hooks.md
   * Trait handlers for HTTP routes.
   * Merged with top-level `traitHandlers` (transport-specific takes precedence).
   * Hooks are now handled by the kernel via meta.hooks and capsuleDef.hooks.
   */
  traitHandlers?: Record<string, TraitHandler>;

  /**
   * CORS configuration.
   * - `true` - enable with default settings
   * - `CorsOptions` - enable with custom settings (origin, methods, credentials, etc.)
   * - `false` or `undefined` - disabled
   *
   * Requires `@elysia/cors` as a peer dependency.
   */
  cors?: boolean | CorsOptions;
}
```

### `CorsOptions`

```ts
interface CorsOptions {
  origin?: boolean | string | RegExp | Array<string | RegExp>;
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
  preflight?: boolean;
}
```

### `WebSocketOptions`

```ts
interface WebSocketOptions {
  // Reserved for future WebSocket-specific options
  // (e.g., heartbeat interval, max message size, per-connection limits)
}
```

### `LifecycleHooks`

```ts
interface LifecycleHooks {
  /** Called after adapter initialization completes */
  onReady?: () => void | Promise<void>;
  
  /** Called during graceful shutdown */
  onClose?: () => void | Promise<void>;
  
  /** Called for unhandled errors */
  onError?: (error: unknown) => void | Promise<void>;
}
```

### Feature Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `http` | `boolean \| HttpOptions` | `undefined` (disabled) | Enable HTTP transport |
| `websocket` | `boolean \| WebSocketOptions` | `undefined` (disabled) | Enable WebSocket transport |

### Conflict Handling

- **At least one transport must be enabled** - throws `Error` if both `http` and `websocket` are `false`/`undefined`
- **Trait handlers are merged** - top-level `traitHandlers` are combined with transport-specific handlers; transport-specific handlers take precedence for the same trait name
- **Lifecycle hooks are shared** - `onReady`, `onClose`, and `onError` apply to the entire adapter, not individual transports

### Validation Semantics

The adapter validates incoming requests against action schemas defined in capsule manifests. Errors are mapped consistently:

| Error Type | HTTP Response | WebSocket Behavior |
|------------|---------------|-------------------|
| `FrameworkError` with `status` | Sets response status code, returns `{ error, details? }` | Sends JSON error message |
| Unknown error | Sets status 500, returns `{ error }` | Sends JSON error or closes with code 1011 |

## Usage Patterns

### HTTP Only

```ts
const adapter = await createElysiaAdapter(capskit, {
  http: true
});

new Elysia()
  .use(adapter.app)
  .listen(3000);
```

### WebSocket Only

```ts
const adapter = await createElysiaAdapter(capskit, {
  websocket: true
});

new Elysia()
  .use(ws({ '/ws': adapter.sockets }))
  .listen(3000);
```

### Combined Mode

```ts
const adapter = await createElysiaAdapter(capskit, {
  http: true,
  websocket: true,
  onReady: () => console.log('Adapter ready'),
  onClose: () => console.log('Shutting down...')
});

new Elysia()
  .use(adapter.app)
  .use(ws({ '/ws': adapter.sockets }))
  .listen(3000);

// On shutdown:
await adapter.shutdown();
```

### With Hook Caps (Recommended)

Hooks are now handled by the kernel via `meta.hooks` and `capsuleDef.hooks`. Define hook caps in your capsule and reference them — no adapter configuration needed:

```ts
// capsules/orders/capsule.ts
export default {
  name: 'orders',
  hooks: {
    pre: [{ name: 'require-auth' }],
  },
} satisfies CapsuleDefinition;
```

```ts
// capsules/orders/caps/create-order.cap.ts
export const meta: CapMeta = {
  name: 'create-order',
  hooks: {
    pre: ['require-auth', 'validate-input'],
    post: ['audit-log'],
  },
  routes: [{ method: 'POST', path: '/orders', cap: 'create-order' }],
};
```

The adapter calls `capskit.call(route.cap, ...)` and the kernel automatically runs the hook pipeline. No adapter-level configuration needed.

### With Trait Handlers (Deprecated)

> **Deprecated:** Use hook caps instead. Trait handlers are legacy adapter-level middleware. See [Hooks Guide](../../docs/guide/hooks.md).

```ts
const adapter = await createElysiaAdapter(capskit, {
  http: {
    traitHandlers: {
      'auth:role': async (role, ctx) => {
        if (ctx.deps.user.role !== role) {
          throw new Error(`Requires role: ${role}`);
        }
      }
    }
  },
  websocket: {
    // WebSocket-specific handlers (future)
  }
});
```

### With CORS

```ts
// CORS with defaults
const adapter = await createElysiaAdapter(capskit, {
  http: { cors: true }
});

// CORS with custom options
const adapter = await createElysiaAdapter(capskit, {
  http: {
    cors: {
      origin: ['https://example.com', 'https://app.example.com'],
      methods: ['GET', 'POST'],
      credentials: true,
    }
  }
});

// Combined with trait handlers (deprecated)
const adapter = await createElysiaAdapter(capskit, {
  http: {
    cors: true,
    // traitHandlers is deprecated - use hook caps instead
  }
});
```

### With `createCapsKit` (high-level factory)

```ts
const { capskit, app, shutdown } = await createCapsKit({
  capsuleDirs: ['./capsules'],
  port: 3000,
  cors: true, // or pass cors: { origin: 'https://example.com' }
  wsPath: '/ws/capskit',
});
```

## Exports

### Main Entry

```ts
import { 
  createElysiaAdapter,
  createRouter,
  createSocket,
  mapToHttpResponse,
  handleWebSocketError
} from '@mobtakronio/capskit-elysia';
```

### Subpath Exports

For tree-shaking or selective imports:

```ts
// HTTP adapter only
import { createRouter } from '@mobtakronio/capskit-elysia/http';

// WebSocket adapter only
import { createSocket } from '@mobtakronio/capskit-elysia/websocket';

// Shared utilities only
import { mapToHttpResponse, handleWebSocketError } from '@mobtakronio/capskit-elysia/shared';
```

## Shared Error Mapping

The adapter provides consistent error handling across both transports:

### `mapToHttpResponse(error, set?)`

Maps errors to HTTP responses with proper status codes:

```ts
const response = mapToHttpResponse(error, set);
```

### `handleWebSocketError(error, ws, handlerType)`

Handles errors in WebSocket handlers:

```ts
handleWebSocketError(error, ws, 'message'); // 'open' | 'message' | 'close' | 'drain'
```

### `formatErrorResponse(error)`

Formats errors for logging/debugging:

```ts
const formatted = formatErrorResponse(error);
// { error, code, status?, details?, stack? }
```

## Migration from Legacy Imports

If you're migrating from separate adapter packages:

**Before (legacy):**

```ts
import { createHttpAdapter } from '@mobtakronio/capskit/adapters/elysia/http';
import { createWebSocketAdapter } from '@mobtakronio/capskit/adapters/elysia/websocket';
```

**After (unified):**

```ts
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';

// HTTP-only
const { app } = await createElysiaAdapter(capskit, { http: true });

// WebSocket-only
const { sockets } = await createElysiaAdapter(capskit, { websocket: true });

// Combined
const { app, sockets } = await createElysiaAdapter(capskit, { 
  http: true, 
  websocket: true 
});
```

See the [migration guide](../../guide/adapters/elysia-migration.md) for detailed upgrade instructions.

## TypeScript

This package is written in TypeScript and ships with full type definitions.

## License

MIT
