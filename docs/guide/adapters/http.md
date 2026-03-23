# HTTP Adapter

The HTTP adapter exposes capsule actions as HTTP endpoints using the Elysia framework (or Express). This guide covers route generation, traits, middleware, and customization.

## Setup

```ts
import { createCapsKit } from '@mobtakronio/capskit'
import { Elysia } from 'elysia'

const capskit = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
})

await capskit.start()

// Build Elysia router from capsule routes
const { router } = await capskit.call('http.buildRouter', {
  adapter: 'elysia'
})

new Elysia()
  .use(router)
  .listen(3000)
```

## Defining Routes

In your capsule manifest, declare HTTP routes:

```ts
export const service: CapsuleManifest = {
  name: 'user-capsule',
  actions: {
    get: { handler: './actions/get' },
    create: { handler: './actions/create' },
    delete: { handler: './actions/delete' }
  },
  routes: [
    { method: 'GET', path: '/users/:id', action: 'get' },
    { method: 'POST', path: '/users', action: 'create' },
    { method: 'DELETE', path: '/users/:id', action: 'delete' }
  ]
}
```

### Route Object

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `method` | `'GET' \| 'POST' \| ...` | ✓ | HTTP method |
| `path` | `string` | ✓ | URL path with optional `:params` |
| `action` | `string` | ✓ | Action name in this capsule |
| `traits` | `string[]` | ✗ | Trait names for middleware injection |

## Path Parameters

URL parameters (`:id`) are available in `context.params`:

```ts
// GET /users/123 → context.params.id = '123'
export default async function get(payload, ctx) {
  const userId = ctx.params.id // string
  const user = await ctx.deps.database.users.findById(userId)
  return { user }
}
```

## Query Parameters

Query strings are available in `context.query`:

```ts
// GET /users?page=1&limit=20 → ctx.query.page = '1', ctx.query.limit = '20'
export default async function list(payload, ctx) {
  const page = Number(ctx.query.page) || 1
  const limit = Number(ctx.query.limit) || 20
  const users = await ctx.deps.database.users.paginate(page, limit)
  return { users, page, limit }
}
```

## Request Body

The request body is passed as the `payload` argument (already validated against the action's schema):

```ts
// POST /users
{
  "name": "Alice",
  "email": "alice@example.com"
}

// In action:
export default async function create(payload, ctx) {
  // payload = { name: 'Alice', email: 'alice@example.com' }
  const user = await ctx.deps.database.users.create(payload)
  return { user }
}
```

## Response Format

By default, responses are JSON:

```json
{
  "user": { "id": "1", "name": "Alice", ... }
}
```

You can customize the response format with **traits** or **post hooks**.

## Traits (Route Metadata)

Traits attach behavior to routes without polluting action code. Common use cases:

- Authentication & authorization
- Rate limiting
- CORS
- Request validation (beyond schema)
- Logging
- Metrics

### Built-in Traits

None are built-in—you define trait handlers:

```ts
const capskit = await createCapsKit({
  traitHandlers: {
    // Trait: 'auth:role:admin'
    'auth:role': (requiredRole, ctx) => {
      const userRole = ctx.deps.auth.currentUser().role
      if (userRole !== requiredRole) {
        throw new AuthorizationError(`Requires role: ${requiredRole}`)
      }
    },
    
    // Trait: 'rate-limit:10/min'
    'rate-limit': (limitStr, ctx) => {
      const [max, period] = limitStr.split('/')
      const key = `rate-limit:${ctx.request.ip}`
      const current = await ctx.deps.redis.get(key)
      if (current && Number(current) >= Number(max)) {
        throw new Error('Rate limit exceeded')
      }
      await ctx.deps.redis.incr(key)
      await ctx.deps.redis.expire(key, 60) // 1 minute
    },

    // Trait: 'cache:300' (cache response for 300 seconds)
    'cache': async (ttlStr, ctx, next) => {
      const ttl = Number(ttlStr)
      const cacheKey = `cache:${ctx.request.path}:${JSON.stringify(ctx.request.body)}`
      const cached = await ctx.deps.redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
      const result = await next()
      await ctx.deps.redis.setex(cacheKey, ttl, JSON.stringify(result))
      return result
    }
  }
})
```

Apply traits to routes:

```ts
routes: [
  { method: 'GET', path: '/admin', action: 'adminPanel', traits: ['auth:role:admin'] },
  { method: 'POST', path: '/users', action: 'create', traits: ['rate-limit:10/min'] },
  { method: 'GET', path: '/products/:id', action: 'get', traits: ['cache:300'] }
]
```

### Trait Parameters

Traits can take parameters separated by `:`:

```
auth:role:admin    → handler receives 'admin'
rate-limit:10/min  → handler receives '10/min'
cache:300          → handler receives '300'
```

In the handler, the first argument is the parameter string. Additional context is passed via `ctx`.

### Trait Syntax Variations

The exact trait handling is determined by the `traitHandlers` config. Here's a more flexible parser:

```ts
traitHandlers: {
  'auth': (role, ctx) => { /* auth:admin → role='admin' */ },
  'rate-limit': (limit, window, ctx) => { /* rate-limit:10/min → limit='10', window='min' */ },
  'cache': async (ttl, ctx, next) => { /* cache:300 → ttl='300' */ }
}
```

The kernel splits `traitName:arg1:arg2` and passes individual args.

## Middleware Pipeline

The HTTP adapter builds an Elysia middleware chain for each route:

1. **Trait interceptors** (in declared order)
2. **Body parsing** (JSON, URL-encoded)
3. **Schema validation** (against action schema)
4. **Handler execution** (via `ctx.call()`)
5. **Response serialization** (JSON)

You can insert custom Elysia middleware at the app level:

```ts
new Elysia()
  .use(loggingMiddleware)      // Before route handling
  .use(errorHandler)           // After route handling
  .use(router)
  .listen(3000)
```

## Custom Error Mapping

Transform errors into HTTP responses:

```ts
import { Elysia } from 'elysia'
import { errorHandler } from '@mobtakronio/capskit/adapters/elysia'

const app = new Elysia()
  .use(
    errorHandler({
      // Map specific error types
      mapError: (err) => {
        if (err instanceof ValidationError) {
          return { status: 422, body: { errors: err.details } }
        }
        if (err instanceof AuthorizationError) {
          return { status: 401, body: { error: 'UNAUTHORIZED' } }
        }
        // Default: 500
        return { status: 500, body: { error: 'INTERNAL_ERROR' } }
      },
      
      // Serialize error for response body
      formatError: (err, mapping) => ({
        success: false,
        code: err.code || 'ERROR',
        message: err.message,
        ...(err.details && { details: err.details })
      })
    })
  )
  .use(router)
```

## CORS

Add CORS headers at the Elysia app level:

```ts
import { cors } from '@elysiajs/cors'

new Elysia()
  .use(
    cors({
      origin: '*', // or specific origins
      credentials: true
    })
  )
  .use(router)
```

## File Uploads

Handle multipart uploads by accessing the raw Elysia request:

```ts
// In your action
export default async function uploadImage(payload, ctx) {
  // ctx.request is the Elysia request object
  const formData = await ctx.request.formData()
  const file = formData.get('file') as File
  
  const buffer = await file.arrayBuffer()
  await ctx.deps.storage.upload(file.name, Buffer.from(buffer))
  
  return { uploaded: true }
}
```

Note: Action schemas don't support file validation. Validate manually in handler or pre-hook.

## Streaming

For streaming responses, bypass the default JSON serializer:

```ts
export default async function stream(payload, ctx) {
  // Set custom headers
  ctx.response.headers.set('Content-Type', 'text/event-stream')
  
  // Return a ReadableStream (Elysia handles it)
  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 10; i++) {
        controller.enqueue(`data: ${i}\n\n`)
        await delay(1000)
      }
      controller.close()
    }
  })
}
```

## Testing HTTP Routes

Use Elysia's test client:

```ts
import { test, expect } from 'bun:test'
import { Elysia } from 'elysia'
import { createCapsKit } from '@mobtakronio/capskit'

test('POST /users creates user', async () => {
  const capskit = await createCapsKit({
    capsules: [{ type: 'directory', path: './src/capsules' }],
    dependencies: { database: mockDb }
  })
  
  const { router } = await capskit.call('http.buildRouter', { adapter: 'elysia' })
  
  const app = new Elysia().use(router)
  
  const response = await app.request('/users')
    .post({ name: 'Alice', email: 'alice@test.com' })
  
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    user: { id: '1', name: 'Alice', email: 'alice@test.com' }
  })
})
```

## Advanced: Custom Adapter

For non-Elysia frameworks (Express, Fastify), you need a custom adapter or use the generic `@mobtakronio/capskit/adapters/http`:

```ts
import { createHttpAdapter } from '@mobtakronio/capskit/adapters/http'

const adapter = await createHttpAdapter(capskit)
app.use(adapter.requestHandler) // Express middleware
```

## Performance Tips

1. **Cache trait results**—especially auth checks and rate limit counters
2. **Use schema caching**—the kernel caches compiled schemas; don't re-create them
3. **Batch DB calls**—leverage parallel `ctx.call()` when independent
4. **Connection pooling**—ensure your database client uses pooling
5. **Enable gzip**—Elysia has built-in compression middleware

## Next Steps

- **WebSocket Adapter**: Build real-time features
- **Traits**: Deep dive into custom middleware patterns
- **Interceptors**: Add non-HTTP-specific cross-cutting concerns
- **Events**: Decouple with pub/sub
