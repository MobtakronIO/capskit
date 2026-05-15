# Actions & Handlers

Actions are the executable units of CapsKit. Each action implements a single, well-defined capability. This guide covers action implementation, the `ActionContext`, return values, and error handling.

> **Note**: The examples below use the legacy `manifest.ts` format for simplicity. In the recommended **Cap model**, actions are methods on a Cap class and metadata is declared in `cap.meta.ts`. See [Capsules](./capsules.md) for the full Cap model documentation.

## Action Structure

An action is an `async` function with this signature:

```ts
type ActionHandler = (
  input: ActionInput,
  context: ActionContext
) => Promise<any>
```

### Input

`ActionInput` provides the payload and HTTP-specific data:

```ts
interface ActionInput {
  body: any;              // Raw payload (already validated against schema)
  params?: Record<string, string>;  // URL params (for HTTP)
  query?: Record<string, string>;   // Query string (for HTTP)
}
```

- `body`: The main payload object. For non-HTTP calls, this is the entire payload.
- `params`: Route parameters (`/users/:id`) populated by HTTP adapter
- `query`: Query string parameters (`?page=1`) for HTTP

### Context

`ActionContext` provides runtime capabilities:

```ts
interface ActionContext {
  deps: Record<string, any>;           // Injected dependencies
  emit: (event: string, data: any) => void;  // Publish event
  call: (action: string, payload: any) => Promise<any>; // Call another action
  use: <T = any>(capsuleName: string) => T;  // Get capsule client proxy
}
```

#### `context.deps`

Access dependencies injected at boot:

```ts
export default async function createUser(payload, ctx) {
  const { database, logger, config } = ctx.deps
  const user = await database.users.create(payload)
  logger.info('User created', { userId: user.id })
  return { user }
}
```

Dependencies are declared in `createCapsKit()`:

```ts
const capskit = await createCapsKit({
  dependencies: {
    database: new Database(),
    logger: new Logger(),
    config: loadConfig()
  }
})
```

#### `context.emit(event, data)`

Publish an event to the event bus:

```ts
export default async function deleteUser(payload, ctx) {
  await ctx.deps.database.users.delete(payload.id)
  ctx.emit('user.deleted', { userId: payload.id })
  return { deleted: true }
}
```

Event subscribers (in any capsule) receive this asynchronously.

#### `context.call(action, payload)`

Invoke another action by full name (`capsuleName.actionName`):

```ts
export default async function createOrder(payload, ctx) {
  // Call action from another capsule
  const user = await ctx.call('user-capsule.get', { id: payload.userId })
  const payment = await ctx.call('payment-capsule.charge', {
    amount: payload.total,
    method: payload.paymentMethod
  })
  
  return { order: 'created', user, payment }
}
```

#### `context.use(capsuleName)`

Get a **capsule client**—a typed proxy for calling all actions in that capsule:

```ts
export default async function bulkCreateUsers(payload, ctx) {
  const user = ctx.use('user-capsule')
  
  // TypeScript knows all actions in user-capsule
  const results = await Promise.all(
    payload.users.map(u => user.create(u))
  )
  
  return { created: results.length }
}
```

Capsule clients are more convenient than `call()` and provide better type inference.

## Return Values

Action return values are serialized to JSON and sent to the adapter (HTTP response, WS message, etc.).

```ts
export default async function getUser(payload, ctx) {
  const user = await ctx.deps.database.users.findById(payload.id)
  
  if (!user) {
    throw new NotFoundError('User not found')
  }
  
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString()
  }
}
```

The HTTP adapter would respond:
```json
{
  "id": "123",
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2026-03-24T10:30:00Z"
}
```

### Error Handling

Throw errors to abort execution. The kernel catches and routes them through error mapping:

```ts
import { ValidationError, NotFoundError, AuthorizationError } from '@mobtakronio/capskit'

export default async function updateUser(payload, ctx) {
  if (payload.age < 18) {
    throw new ValidationError('User must be at least 18 years old')
  }
  
  const user = await ctx.deps.database.users.findById(payload.id)
  if (!user) {
    throw new NotFoundError(`User ${payload.id} not found`)
  }
  
  if (!ctx.deps.auth.canEdit(ctx.deps.currentUser, user)) {
    throw new AuthorizationError('Cannot edit this user')
  }
  
  await ctx.deps.database.users.update(payload.id, payload)
  return { updated: true }
}
```

See [Error Handling](./errors.md) for complete error type reference and customization.

## Pre and Post Hooks

Attach hooks directly in the manifest for runtime modification:

```ts
actions: {
  delete: {
    handler: './actions/delete',
    pre: [
      // Log before execution
      async (input, ctx) => {
        ctx.deps.logger.info('Deleting user', { id: input.body.id })
      },
      // Validate
      async (input, ctx) => {
        if (input.body.id === ctx.deps.currentUser.id) {
          throw new Error('Cannot delete yourself')
        }
      }
    ],
    post: [
      // Transform result
      async (input, result, ctx) => {
        return { success: true, deletedId: input.body.id }
      },
      // Side effect (fire-and-forget)
      async (input, result, ctx) => {
        ctx.emit('user.deleted', { id: input.body.id })
      }
    ]
  }
}
```

**Hook semantics:**
- **Pre hooks** run before the handler. They receive `input` (body + params/query) and `ctx`. Modifying `input.body` changes what the handler receives.
- **Post hooks** run after the handler. They receive `input`, the `result` from the previous hook or handler, and `ctx`. They can transform `result` by returning a new value.
- Hooks run sequentially. If a hook throws, the pipeline aborts.

## Handler Best Practices

### 1. Keep Handlers Focused

One action = one responsibility. If you find yourself writing:

```ts
// Bad: mixing concerns
export default async function handle(
  payload, 
  ctx
) {
  // Validation (use schema instead)
  if (!payload.email) throw new Error(...)
  
  // Business logic
  const user = await db.create(payload)
  
  // Side effects (use emit instead)
  await sendEmail(user)
  await slackNotify(user)
  
  // Transformation (use post hooks instead)
  return { ...user, password: undefined }
}
```

Refactor into:
- JSON Schema for validation
- Core logic in handler
- Side effects via `emit()` (event-driven)
- Post hooks for result transformation

### 2. Use Types

Define explicit payload and return types:

```ts
// types.ts
export interface CreateUserPayload {
  name: string
  email: string
  age?: number
}

export interface CreateUserResult {
  user: User
  token: string
}

// actions/create.ts
import type { CreateUserPayload, CreateUserResult } from '../types'

export default async function create(
  payload: CreateUserPayload,
  ctx: ActionContext
): Promise<CreateUserResult> {
  const user = await ctx.deps.database.users.create(payload)
  const token = await ctx.deps.auth.generateToken(user.id)
  
  return { user, token }
}
```

### 3. Avoid Direct Adapter References

Handlers should not import Elysia, Express, or any transport framework. Keep them pure.

```ts
// Bad: HTTP-specific
import { Request } from 'elysia'
export default async function handler(payload, ctx) {
  const userAgent = ctx.request.headers['user-agent'] // ❌
}

// Good: use context
export default async function handler(payload, ctx) {
  const ip = ctx.params.ip // ✅ (provided by adapter)
}
```

### 4. Error Types Matter

Use the built-in error classes or extend them:

```ts
class InsufficientFundsError extends Error {
  constructor(public balance: number, public required: number) {
    super(`Insufficient funds: ${balance} < ${required}`)
  }
}
```

The kernel passes errors to adapter-specific error handlers (which can map to appropriate HTTP status codes, WS close codes, etc.).

## Testing Actions

Because actions are pure functions, testing is straightforward:

```ts
import { test, expect } from 'bun:test'
import createUser from '../capsules/user/actions/create'

test('create user validates email', async () => {
  const mockDb = { users: { create: async (u) => ({ ...u, id: '1' }) } }
  const deps = { database: mockDb }
  
  const ctx = {
    deps,
    emit: () => {},
    call: async () => ({ }),
    use: async () => ({ })
  }
  
  const result = await createUser(
    { name: 'Alice', email: 'alice@example.com' },
    ctx
  )
  
  expect(result.user.email).toBe('alice@example.com')
})
```

No HTTP mocking required. Just call the function with a mock context.

## Next Steps

- **Dependencies**: Learn to inject and use dependencies effectively
- **Hooks**: Add cross-cutting concerns with pre/post hooks
- **Schemas**: Define robust JSON Schema for validation
- **Events**: Build decoupled systems with pub/sub
- **Interceptors**: Implement global cross-cutting concerns
