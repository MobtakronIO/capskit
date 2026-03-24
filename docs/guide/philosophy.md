# Philosophy

CapsKit embodies a set of design principles that distinguish it from traditional frameworks. This document explains the "why" behind the architecture.

## Capability Pattern

The world is made of **capabilities**—things you can do. Send an email. Process a payment. Update a user record. Each capability is a cohesive unit of work.

CapsKit treats capabilities as first-class citizens. They're:
- **Named** (identifiable)
- **Discoverable** (listed in manifests)
- **Invokable** (`call(action, payload)`)
- **Independent** (no transport coupling)

Contrast with "controllers" in MVC frameworks, which mix routing, validation, business logic, and response formatting into one tangled mess.

## Transport Agnosticism

**Principle**: Business logic must not know about HTTP, WebSockets, or any transport.

Why? Because requirements change. Today you need an API endpoint. Tomorrow you need:
- A CLI command
- A background worker processing a queue
- A scheduled job
- Another service calling you directly

If your logic is polluted with `req`, `res`, `ctx`, `next`, you're stuck rewriting everything.

CapsKit enforces this by making actions pure functions:
```ts
(payload: object, context: { deps, emit, call, use }) => result
```

No `Request`. No `Response`. The transport adapter (HTTP, WS) is responsible for translating to/from this pure form.

## Declarative Configuration

**Principle**: Declare *what* the system can do, not *how* to wire it together.

Traditional frameworks: You write middleware, routes, controllers, services, manually connect them. Every new capability requires touching multiple files and understanding the complex wiring.

CapsKit: You declare actions in a manifest. The kernel reads the manifest and generates the wiring automatically.

```ts
// Declarative
export const service = {
  name: 'user',
  actions: { create: {...}, delete: {...} },
  routes: [{ method: 'POST', path: '/users', action: 'create' }]
}
```

The kernel handles:
- HTTP → action mapping
- Schema validation
- Dependency injection
- Event subscriptions
- Interceptor chains

**Benefits**: Easier to reason about, automatic documentation, simplifies testing.

## Universal Pipelines

**Principle**: All actions—regardless of how they're invoked—flow through the same middleware pipeline.

Whether an action is called via:
- HTTP request
- WebSocket message
- `capskit.call()` from another action
- Event subscription
- CLI command

It experiences identical pre-processing (validation, auth, logging) and post-processing (transformations, metrics).

This is achieved via **Kernel Interceptors** (global) and **Action Hooks** (per-action). They're composable, reusable, and attach consistently.

## Zero Framework Lock-in

**Principle**: Your capsules should never import framework-specific packages.

No `express`, no `elysia`, no `socket.io`, no `bull`, no `bullmq`. Your business logic stays in pure TypeScript/JavaScript.

This achieves **framework agnosticism**. You can drop your capsule into any CapsKit host, and it just works. Swap out Elysia for Express? No capsule changes. Add a CLI? Reuse same actions.

## Type Safety First

**Principle**: Types and schemas are not optional—they're core to the contract.

CapsKit uses:
- **TypeScript** for compile-time type checking
- **JSON Schema** for runtime validation
- **Manifest types** for structure enforcement

The manifest itself is typed:
```ts
interface CapsuleManifest {
  name: string;
  actions: Record<string, ActionDefinition>;
  // ...
}
```

And actions can have typed payloads:
```ts
interface CreateUserPayload {
  name: string
  email: string
}
export default async function create(payload: CreateUserPayload, ctx) { ... }
```

This catches errors early—in development, before code runs.

## Composable Abstractions

**Principle**: Small, orthogonal concepts that combine elegantly.

CapsKit has a minimal set of primitives:
- **Capsules** (containers)
- **Actions** (units of work)
- **Events** (pub/sub)
- **Interceptors** (pipeline)
- **Traits** (route metadata)

You can build complex patterns by combining them:
- Feature flags → trait + event
- Audit logging → interceptor
- Rate limiting → trait + redis
- Transactional consistency → interceptor + database transaction

Each concept is simple, documented, and reusable.

## Predictable Lifecycle

**Principle**: Every action goes through a deterministic, observable lifecycle.

```
[Adapter] → [Interceptors] → [Pre Hooks] → [Handler] → [Post Hooks] → [Interceptors] → [Adapter]
```

You can plug in at any layer:
- Adapter: Custom request parsing, response formatting
- Interceptor: Global logging, error handling, metrics
- Pre Hook: Input validation, enrichment
- Handler: Business logic (pure)
- Post Hook: Transformation, side effects

This predictability makes debugging, monitoring, and testing feasible.

## Explicit Dependencies

**Principle**: Dependencies are declared and injected, never imported directly.

No `import { db } from '../database'`. Instead:
```ts
const ctx = createCapsKit({
  dependencies: { database: dbInstance }
})
```

Inside action: `ctx.deps.database`

Benefits:
- Testability (mock deps)
- Swappable implementations (swap Redis for Memcached)
- Clear contracts (what does this capsule need?)
- No circular dependency surprises

## Manifest as Single Source of Truth

**Principle**: The manifest declares everything the kernel needs to know.

- What actions exist
- What events are published/subscribed
- What routes are exposed
- What dependencies are required

This enables:
- **Automatic documentation generation**
- **Validation at boot time**
- **Introspection** (`capskit.describe('capsule-name')`)
- **IDE support** (manifest is typed)

## Minimalism

**Principle**: Do one thing well. Avoid feature creep.

CapsKit is not:
- An ORM
- A database
- A task queue
- A full framework

It's a **kernel**—the smallest possible piece that enforces the capability pattern and orchestrates capsules. Everything else (validation, auth, DBs, caches) are dependencies you inject.

This keeps the core lean, testable, and understandable.

## Design by Contract

**Principle**: Actions have implicit contracts via schemas and types.

When you declare an action:
```ts
{
  handler: createUser,
  schema: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' }
    },
    required: ['email']
  }
}
```

The contract is:
- **Precondition**: Input must match schema (validated by kernel)
- **Postcondition**: Handler returns a result (or throws)
- **Side effects**: Documented via `events.publishes` and deps usage

The kernel enforces the precondition. You ensure the postcondition.

## Error as Data

**Principle**: Errors are structured, typed, and carry meaning.

Not just `throw new Error('Something broke')`. Use specific error types:

```ts
if (!user) throw new NotFoundError('User not found')
if (!canEdit) throw new AuthorizationError('Not allowed')
if (invalid) throw new ValidationError(details)
```

Adapters map these to appropriate protocol responses (HTTP 404, WS close code, etc.).

## Eventual Consistency via Events

**Principle**: Decouple capsules with events, not direct calls.

Instead of:
```ts
// User capsule calls Order capsule directly
await ctx.call('order-capsule.create', ...)
```

Use events:
```ts
// User capsule emits event
ctx.emit('user.created', { userId })

// Order capsule subscribes to 'user.created'
```

Benefits: Loose coupling, easier to add/remove listeners, async processing, audit trail.

## Testing Friendliness

**Principle**: If it's hard to test, the design is wrong.

Because actions are pure functions, testing is trivial:
```ts
const result = await createUser({ name: 'Alice', email: 'alice@test.com' }, mockCtx)
expect(result.user.email).toBe('alice@test.com')
```

No HTTP mocking, no DB containers, no complex fixtures. Just call a function with a mocked context.

## Conclusion

CapsKit's philosophy centers on **separation of concerns**, **type safety**, and **developer experience**. It's a small kernel that enforces good architecture, leaving the rest to your domain logic.

These principles guide every design decision. If a feature request conflicts with them, the answer is usually "No."

## Further Reading

- **Architecture**: System-level view
- **Capsules**: Manifest structure and organization
- **Adapters**: Transport layer implementations
- **Interceptors & Traits**: Cross-cutting concerns
