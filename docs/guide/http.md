# HTTP Protocol

CapsKit exposes capsule actions as RESTful HTTP routes through the built-in `http` capsule. This document describes the capsule interface, how to write an adapter for any framework, and the request/response format for clients.

---

## Built-in HTTP Capsule

CapsKit ships with a built-in `http` capsule that provides the `buildRouter` action. This action accepts an **adapter function** — a framework-agnostic factory that receives the CapsKit instance and returns a router object.

### The adapter contract

Any framework adapter is a function with this signature:

```ts
type AdapterFn = (capskit: ICapsKit, options: { traitHandlers?: Record<string, TraitHandler> }) => Router;
```

Where `Router` is whatever object your framework uses to represent routes (an Express app, a Fastify instance, an Elysia app, etc.).

### Using the built-in capsule

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const capskit = await createCapsKit({ /* ... */ });

// Call the built-in http capsule with your adapter
const router = await capskit.call('http.buildRouter', {
  body: {
    adapter: (capskit, { traitHandlers }) => {
      // Build and return your framework's router here
      return myFrameworkRouter(capskit, traitHandlers);
    },
    traitHandlers: {
      auth: async (role, ctx) => { /* ... */ },
    },
  },
});
```

---

## Writing a Framework Adapter

### Express example

```ts
import express from 'express';
import { createCapsKit } from '@mobtakronio/capskit';

const capskit = await createCapsKit({ /* ... */ });

function expressAdapter(capskit, { traitHandlers = {} }) {
  const app = express();
  app.use(express.json());

  const manifests = capskit.getManifests();

  for (const manifest of manifests) {
    if (!manifest.routes) continue;
    for (const route of manifest.routes) {
      const handler = async (req, res) => {
        try {
          const result = await capskit.call(`${manifest.name}.${route.action}`, {
            body: req.body,
            params: req.params,
            query: req.query,
          });
          res.json({ ok: true, result });
        } catch (err) {
          res.status(500).json({ ok: false, error: { message: err.message } });
        }
      };

      const method = route.method.toLowerCase();
      app[method](route.path, handler);
    }
  }

  return app;
}

const { router } = await capskit.call('http.buildRouter', {
  body: { adapter: expressAdapter },
});

router.listen(3000);
```

### Fastify example

```ts
import Fastify from 'fastify';

function fastifyAdapter(capskit, { traitHandlers = {} }) {
  const app = Fastify();
  const manifests = capskit.getManifests();

  for (const manifest of manifests) {
    if (!manifest.routes) continue;
    for (const route of manifest.routes) {
      app.route({
        method: route.method,
        url: route.path,
        handler: async (request, reply) => {
          const result = await capskit.call(`${manifest.name}.${route.action}`, {
            body: request.body,
            params: request.params,
            query: request.query,
          });
          return { ok: true, result };
        },
      });
    }
  }

  return app;
}
```

### Hono example

```ts
import { Hono } from 'hono';

function honoAdapter(capskit, { traitHandlers = {} }) {
  const app = new Hono();
  const manifests = capskit.getManifests();

  for (const manifest of manifests) {
    if (!manifest.routes) continue;
    for (const route of manifest.routes) {
      app.on(route.method.toLowerCase(), route.path, async (c) => {
        const body = await c.req.json().catch(() => undefined);
        const result = await capskit.call(`${manifest.name}.${route.action}`, {
          body,
          params: c.req.param(),
          query: Object.fromEntries(new URL(c.req.url).searchParams),
        });
        return c.json({ ok: true, result });
      });
    }
  }

  return app;
}
```

---

## Using the Elysia Adapter

The `@mobtakronio/capskit-elysia` package provides a ready-made adapter for Elysia:

```ts
import { createRouter } from '@mobtakronio/capskit-elysia/http';
import { capskit } from './capskit';

const router = createRouter(capskit, {
  traitHandlers: {
    auth: async (role, context) => { /* ... */ },
  },
});

const app = new Elysia().use(router).listen(3000);
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

---

## How Routes Are Generated

Routes are auto-generated from capsule manifests. Each capsule declares its routes in the manifest:

```ts
// In a capsule's caps.ts
export const meta: CapMeta = {
  name: 'orders',
  routes: [
    { method: 'GET', path: '/orders', cap: 'orders', action: 'list' },
    { method: 'POST', path: '/orders', cap: 'orders', action: 'create' },
    { method: 'GET', path: '/orders/:id', cap: 'orders', action: 'get' },
  ],
};
```

Supported HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`.

---

## Trait Handlers

Traits are route-level middleware declarations (e.g., `'auth:role:admin'`). Your adapter receives them via `traitHandlers`:

```ts
traitHandlers: {
  auth: async (traitValue, context) => {
    // traitValue = 'admin' (from 'auth:role:admin')
    // context = framework request context
  },
}
```

If a trait is declared on a route but no handler is provided, a warning is logged and the route remains unprotected.

---

## Request Format

The adapter forwards the framework request context to the capsule action:

| Source | Mapped to |
|---|---|
| Request body | `input.body` |
| URL params | `input.params` |
| Query string | `input.query` |

### Example: POST request

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"productId": "abc-123", "quantity": 2}'
```

Invokes the action with:

```ts
{
  body: { productId: "abc-123", quantity: 2 },
  params: {},
  query: {}
}
```

---

## Response Format

### Success

```json
{
  "ok": true,
  "result": { "orderId": "ord-456", "total": 59.98 }
}
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION",
    "message": "Missing required field: productId"
  }
}
```

HTTP status codes are mapped from error types:

| Error type | Status |
|---|---|
| Validation | `400` |
| Not found | `404` |
| Authorization | `401` / `403` |
| Internal error | `500` |

---

## Next Steps

- [WebSocket Protocol](./websocket.md) — Real-time communication via WebSocket
- [Client SDK](./client.md) — Full client package documentation
- [Interceptors](./interceptors.md) — Request/response middleware pipeline
