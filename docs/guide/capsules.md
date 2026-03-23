# Capsules & Manifests

A **Capsule** is the fundamental building block of CapsKit applications. It's a self-contained module that encapsulates a cohesive set of business capabilities.

## What is a Capsule?

A capsule is simply a folder with a `manifest.ts` file and action implementations. It's intentionally minimal—no framework dependencies, no transport concerns.

```
user-capsule/
├── manifest.ts          # Capsule metadata and action definitions
├── actions/
│   ├── create.ts
│   ├── update.ts
│   └── delete.ts
└── schemas/ (optional)
    ├── create.schema.ts
    └── ...
```

## The Manifest

The `manifest.ts` exports a `CapsuleManifest` object that declares everything the kernel needs to know about your capsule:

```ts
import { CapsuleManifest } from '@mobtakronio/capskit'

export const service: CapsuleManifest = {
  name: 'user-capsule',
  requires: ['auth-capsule'], // optional dependencies
  actions: {
    create: {
      handler: './actions/create',
      description: 'Create a new user',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        },
        required: ['name', 'email']
      }
    },
    update: {
      handler: async (payload, ctx) => {
        // Inline handler (rare, use separate file for complex logic)
        return { updated: true }
      }
    }
  },
  events: {
    publishes: ['user.created', 'user.updated'],
    subscribes: [
      { event: 'auth.validated', action: 'onAuthValidated' }
    ]
  },
  // Adapter-specific configuration
  routes: [
    { method: 'POST', path: '/users', action: 'create', traits: ['auth:admin'] },
    { method: 'PUT', path: '/users/:id', action: 'update' }
  ]
}
```

### Manifest Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | ✓ | Unique capsule identifier |
| `requires` | `string[]` | ✗ | Names of capsules this depends on |
| `actions` | `Record<string, ActionDefinition>` | ✓ | Map of action names → definitions |
| `events.publishes` | `string[]` | ✗ | Events this capsule emits |
| `events.subscribes` | `EventSubscription[]` | ✗ | Event → action mappings |
| `routes` | `Route[]` | ✗ | HTTP routes (for HTTP adapter) |
| `sockets` | `Socket[]` | ✗ | WebSocket events (for WS adapter) |
| `[key: string]` | `any` | ✗ | Extensible for adapter-specific config |

### Action Definition

```ts
interface ActionDefinition {
  handler: string | ActionHandler
  description?: string
  pre?: ActionPreHook[]   // Runs before handler
  post?: ActionPostHook[] // Runs after handler
  schema?: ActionSchema   // JSON Schema for payload validation
}
```

### Handler Reference

The `handler` field can be:

1. **Inline function** (for trivial logic):
   ```ts
   handler: async (payload, ctx) => ({ result: payload.value * 2 })
   ```

2. **File path** (recommended, resolves relative to manifest):
   ```ts
   handler: './actions/create'
   ```

   The file should export a default function or named export matching the action:
   ```ts
   // actions/create.ts
   export default async function create(payload: CreatePayload, context: ActionContext) {
     return { user: await db.users.create(payload) }
   }
   
   // OR named export (matches action name)
   export async function create(payload, context) { ... }
   ```

## Action Hooks

Attach **pre** and **post** hooks directly in the manifest:

```ts
actions: {
  delete: {
    handler: './actions/delete',
    pre: [
      async (input, ctx) => {
        // Validate user owns resource
        if (!ctx.deps.auth.canDelete(ctx.params.id)) {
          throw new Error('Unauthorized')
        }
      }
    ],
    post: [
      async (input, result, ctx) => {
        ctx.deps.logger.info('User deleted', { id: ctx.params.id })
      }
    ]
  }
}
```

Hooks run in order. Pre-hooks can modify `input.body` before the handler. Post-hooks can transform `result`.

## Events & Subscriptions

Capsules communicate via events. A capsule can **publish** events and **subscribe** to events from others.

```ts
events: {
  publishes: ['user.created', 'user.deleted'],
  subscribes: [
    { event: 'user.created', action: 'sendWelcomeEmail' },
    { event: 'user.created', action: 'notifySlack' }
  ]
}
```

When `ctx.emit('user.created', data)` is called inside any action, the kernel routes the event to every subscribed action (in any capsule, including itself).

## Routes (HTTP Adapter)

The `routes` array defines HTTP endpoints for the Elysia/Express adapter:

```ts
routes: [
  {
    method: 'POST',
    path: '/users',
    action: 'create',
    traits: ['auth:required', 'rate-limit:10/min']
  },
  {
    method: 'GET',
    path: '/users/:id',
    action: 'get',
    traits: ['auth:optional']
  }
]
```

### Route Traits

`traits` attach metadata that adapters translate into middleware:

```ts
// In manifest
routes: [{ method: 'GET', path: '/admin', action: 'adminPanel', traits: ['auth:role:admin'] }]

// Trait handler registration (boot time)
const capskit = await createCapsKit({
  traitHandlers: {
    auth: (role, ctx) => {
      if (!ctx.deps.auth.userHasRole(role)) {
        throw new AuthorizationError('Insufficient permissions')
      }
    }
  }
})
```

## Schemas & Validation

Attach JSON Schema to actions for runtime validation:

```ts
actions: {
  create: {
    handler: './actions/create',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 100 },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 18 }
      },
      required: ['name', 'email']
    }
  }
}
```

The kernel validates `payload` against the schema before invoking the handler. Validation errors throw `ValidationError` with details.

## Dependencies (`requires`)

Declare capsule dependencies to ensure load order and enable `ctx.call()`:

```ts
// order-capsule manifest
export const service = {
  name: 'order-capsule',
  requires: ['user-capsule', 'payment-capsule'],
  actions: {
    create: {
      handler: './actions/create',
      // Can safely call actions from user and payment capsules
    }
  }
}
```

Inside `create`:
```ts
export default async function create(payload, ctx) {
  const user = await ctx.call('user-capsule.get', { id: payload.userId })
  const payment = await ctx.call('payment-capsule.charge', { amount: payload.total })
  return { order: 'created' }
}
```

## Best Practices

### 1. Single Responsibility

One capsule = one domain concept. Don't mix user management with order processing.

### 2. Explicit Schemas

Always provide schemas. They enable validation, documentation, and type safety.

### 3. Thin Manifest, Thick Actions

Keep manifest declarative. Put complex logic in separate action files.

### 4. Version Your Schemas

If your payload shape changes, version your action or schema:

```ts
actions: {
  'create.v1': { handler: './actions/v1/create', schema: CREATE_V1 },
  'create.v2': { handler: './actions/v2/create', schema: CREATE_V2 }
}
```

## Next Steps

- **Actions**: Learn about action handlers, context, and return values
- **Dependencies**: Understand dependency injection and `ctx.deps`
- **Adapters**: Configure HTTP routes and WebSocket sockets
- **Interceptors**: Add global cross-cutting concerns
- **Traits**: Implement custom route behavior (auth, rate limiting, etc.)
