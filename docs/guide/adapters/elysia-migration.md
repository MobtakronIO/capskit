# Elysia Adapter Migration Guide

This guide helps you migrate from legacy Elysia adapter patterns to the unified `@capskit/adapter-elysia` package.

> **Note**: This guide covers adapter-level migration. For migrating capsules from the legacy `manifest.ts` format to the **Cap model** (`caps.ts` + `.cap/` directories), see the [Cap model migration guide](../capsules.md#migration-guide-manifest--cap-model). The adapter itself is format-agnostic and works with both capsule styles.

## Overview

The unified adapter provides:
- Single package for both HTTP and WebSocket transports
- Consistent error handling across transports
- Shared lifecycle hooks
- Simplified configuration

## Migration Steps

### 1. Update Dependencies

**Before:**
```bash
npm install @mobtakronio/capskit
# Separate adapters were internal
```

**After:**
```bash
npm install @capskit/adapter-elysia
npm install @mobtakronio/capskit  # peer dependency
```

### 2. Replace Legacy Imports

#### HTTP-Only Pattern

**Before:**
```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';

// Legacy internal adapter access
const { router } = await capskit.use('http').buildRouter({
  adapter: 'elysia'
});

new Elysia()
  .use(router)
  .listen(3000);
```

**After:**
```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import { createElysiaAdapter } from '@capskit/adapter-elysia';

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
});

const { app } = await createElysiaAdapter(capskit, {
  http: true
});

new Elysia()
  .use(app)
  .listen(3000);
```

#### WebSocket-Only Pattern

**Before:**
```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import { ws } from '@elysiajs/websocket';

const { sockets } = await capskit.call('websocket.buildSocket', {
  adapter: 'elysia'
});

new Elysia()
  .use(ws({ '/ws': sockets }))
  .listen(3000);
```

**After:**
```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import { ws } from '@elysiajs/websocket';
import { createElysiaAdapter } from '@capskit/adapter-elysia';

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
});

const { sockets } = await createElysiaAdapter(capskit, {
  websocket: true
});

new Elysia()
  .use(ws({ '/ws': sockets }))
  .listen(3000);
```

#### Combined HTTP + WebSocket

**Before:**
```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import { ws } from '@elysiajs/websocket';

const { router } = await capskit.use('http').buildRouter({
  adapter: 'elysia'
});
const { sockets } = await capskit.call('websocket.buildSocket', {
  adapter: 'elysia'
});

new Elysia()
  .use(router)
  .use(ws({ '/ws': sockets }))
  .listen(3000);
```

**After:**
```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import { ws } from '@elysiajs/websocket';
import { createElysiaAdapter } from '@capskit/adapter-elysia';

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
});

const adapter = await createElysiaAdapter(capskit, {
  http: true,
  websocket: true
});

new Elysia()
  .use(adapter.app)
  .use(ws({ '/ws': adapter.sockets }))
  .listen(3000);

// Graceful shutdown
process.on('SIGINT', async () => {
  await adapter.shutdown();
  process.exit(0);
});
```

### 3. Update Trait Handlers

Trait handlers are now configured via the adapter options instead of during CapsKit initialization:

**Before:**
```ts
const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }],
  traitHandlers: {
    'auth:role': (role, ctx) => {
      if (ctx.deps.user.role !== role) {
        throw new Error('Unauthorized');
      }
    }
  }
});
```

**After:**
```ts
const adapter = await createElysiaAdapter(capskit, {
  http: {
    traitHandlers: {
      'auth:role': (role, ctx) => {
        if (ctx.deps.user.role !== role) {
          throw new Error('Unauthorized');
        }
      }
    }
  }
});
```

### 4. Update Lifecycle Hooks

**Before:**
```ts
// Lifecycle was handled manually or via separate setup
app.onStart(() => { /* ... */ });
app.onClose(() => { /* ... */ });
```

**After:**
```ts
const adapter = await createElysiaAdapter(capskit, {
  http: true,
  onReady: () => {
    console.log('Adapter ready');
  },
  onClose: async () => {
    console.log('Cleaning up...');
    await db.close();
  },
  onError: (error) => {
    console.error('Adapter error:', error);
  }
});
```

### 5. Update Error Handling Imports

**Before:**
```ts
import { errorHandler } from '@mobtakronio/capskit/adapters/elysia';
```

**After:**
```ts
import { 
  mapToHttpResponse, 
  handleWebSocketError 
} from '@capskit/adapter-elysia';
```

## Breaking Changes

### 1. Package Name Change

| Before | After |
|--------|-------|
| Internal adapter access via `capskit.use('http').buildRouter()` | `@capskit/adapter-elysia` |

### 2. Adapter Return Type

The unified adapter returns a single object:

```ts
const { app, sockets, shutdown } = await createElysiaAdapter(capskit, options);
```

Previously, HTTP and WebSocket were built separately.

### 3. Trait Handler Scope

Trait handlers configured at the CapsKit level no longer automatically apply to adapters. You must configure them in adapter options:

```ts
// Before: worked at CapsKit init
createCapsKit({ traitHandlers: { 'auth': fn } });

// After: must be in adapter options
createElysiaAdapter(capskit, { http: { traitHandlers: { 'auth': fn } } });
```

## Feature Comparison

| Feature | Legacy | Unified Adapter |
|---------|--------|----------------|
| HTTP transport | ✅ | ✅ |
| WebSocket transport | ✅ | ✅ |
| Combined mode | Manual | ✅ Built-in |
| Shared lifecycle hooks | ❌ | ✅ |
| Consistent error mapping | Partial | ✅ Full parity |
| Tree-shakable imports | ❌ | ✅ (`/http`, `/websocket`, `/shared`) |

## Rollback Plan

If issues arise:

1. **Keep legacy imports available** during transition
2. **Pin adapter version** in package.json:
   ```json
   {
     "dependencies": {
       "@capskit/adapter-elysia": "0.1.0"
     }
   }
   ```
3. **Test in staging** before production deployment

## Getting Help

- **Issues**: Report bugs at the [CapsKit GitHub repository](https://github.com/mobtakronio/capskit)
- **Discussion**: Join the [CapsKit Discord](https://discord.gg/capskit)
- **Examples**: See `packages/adapters/elysia/test/adapter.test.ts` for usage patterns
