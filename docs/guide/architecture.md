# Architecture Overview

CapsKit is a lightweight, strictly-opinionated runtime kernel designed to enforce the **Capability Architecture** pattern. It completely separates "what the system can do" from "how the system is told to do it."

## Core Philosophy

Traditional architectures tightly couple business logic to the transport layer. Your logic ends up expecting HTTP Request/Response objects, making it impossible to reuse the same capabilities in a CLI tool, message queue, or another service.

CapsKit inverts this. Your business logic lives in **pure actions**—functions that take simple payloads and return raw results. The kernel orchestrates everything else: discovery, dependency injection, event routing, and transport binding.

## The Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Transport Adapters                      │
│  (HTTP/Elysia, WebSocket, CLI, Event Consumers, etc.)     │
└─────────────────────────────────────────────────────────────┘
                              ↕ translates
┌─────────────────────────────────────────────────────────────┐
│                   CapsKit Kernel                            │
│  • Manifest discovery & validation                          │
│  • Dependency injection container                          │
│  • Interceptor pipelines                                   │
│  • Event bus routing                                       │
│  • Trait → middleware translation                          │
└─────────────────────────────────────────────────────────────┘
                              ↕ calls
┌─────────────────────────────────────────────────────────────┐
│                     Capsules                                │
│  • manifest.ts (declarative metadata)                      │
│  • actions/ (pure business logic)                          │
│  • schemas/ (JSON Schema validation)                       │
└─────────────────────────────────────────────────────────────┘
```

### 1. Capsules

A **Capsule** is a self-contained module of business capabilities. It's just a folder with:

```
my-capsule/
├── manifest.ts          # Declarative metadata
├── actions/
│   ├── createUser.ts
│   ├── deleteUser.ts
│   └── ...
└── schemas/ (optional)
    ├── createUser.schema.ts
    └── ...
```

The `manifest.ts` exports a `CapsuleManifest` that declares:
- **name**: Unique capsule identifier
- **requires**: Dependencies on other capsules
- **actions**: Map of action names → definitions
- **events**: Published events and subscriptions
- **adapter-specific config**: routes, sockets, traits, etc.

### 2. Actions

An **action** is a pure function implementing a single capability:

```ts
// my-capsule/actions/createUser.ts
export default async function createUser(
  payload: { name: string; email: string },
  context: ActionContext
) {
  const { database } = context.deps
  const user = await database.users.create(payload)
  return { user }
}
```

Action characteristics:
- **Input**: Simple payload object (validated against schema)
- **Context**: Injected dependencies, emit/call helpers, params/query for HTTP
- **Output**: Raw result (serialized to JSON)
- **No side effects** beyond explicit dependencies

### 3. The Kernel

The **Kernel** (`CapsKit` class) is the orchestration engine:

1. **Discovery**: Loads capsules from directories, manifests, or npm packages
2. **Validation**: Validates manifest structure and dependencies
3. **Registration**: Registers actions, events, and adapter metadata
4. **Execution**: Provides `call(action, payload)` and `use(capsule)` APIs
5. **Pipeline**: Wraps every action with interceptors and hooks

```ts
import { createCapsKit } from '@mobtakronio/capskit'

const capskit = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' },
    { type: 'package', name: '@myorg/auth-capsule' }
  ],
  dependencies: {
    database: new Database(),
    redis: new Redis()
  }
})

await capskit.start()
```

## Execution Flow

When you call an action, it flows through multiple layers:

```
External Request (HTTP/WS/Event)
         ↓
    Adapter translates → context.body, context.params, etc.
         ↓
    Kernel Interceptors (global, all actions)
         ↓
    Action Hooks (per-action, pre)
         ↓
    Action Handler (your business logic)
         ↓
    Action Hooks (per-action, post)
         ↓
    Kernel Interceptors (global, all actions)
         ↓
    Adapter translates → HTTP response, WS message, etc.
         ↓
External Response
```

### Interceptors vs Hooks

- **Kernel Interceptors**: Global, wrap *every* action. Used for logging, metrics, transactions, error handling.
- **Action Hooks**: Per-action, fine-grained control. Useful for validation, mutation, caching.

Both can:
- Modify input before the handler
- Modify/transform output after the handler
- Short-circuit the pipeline (skip handler)
- Throw errors to abort execution

## Data Flow

```
Capsule Discovery
   ↓
Manifest Parsing
   ↓
Dependency Resolution
   ↓
Action Registration
   ↓
Adapter Binding (based on manifest routes/traits)
   ↓
Ready for Execution
```

## Type Safety

CapsKit is TypeScript-first:

- **Action payloads** validated via JSON Schema (runtime) and inferred types (dev)
- **Dependencies** typed via `CapsKitConfig.dependencies` generic
- **Capsule clients** (`use()`) have typed action methods based on manifest
- **Manifest structure** validated at boot time

Example:

```ts
interface MyDeps {
  database: Database
  logger: Logger
}

const capskit = await createCapsKit<MyDeps>({
  dependencies: { database, logger }
})

const math = capskit.use('math-capsule')
// math.sum is typed as (payload: { a: number; b: number }) => Promise<{ result: number }>
```

## Transport Agnosticism

Because actions are pure functions, the same capsule can be triggered by:

- **HTTP**: Elysia/Express adapter binds routes to actions
- **WebSocket**: WebSocket adapter binds socket events to actions
- **Event Bus**: Subscribe to events and dispatch to actions
- **CLI**: Direct `call()` from a command script
- **Cron Jobs**: Schedule `call()` invocations
- **Other Capsules**: Direct `context.call()` or `capsule.action()`

No code changes needed. Just configure the appropriate adapter and routes/subscriptions in the manifest.

## Next Steps

- **Philosophy**: Understand the design principles behind CapsKit
- **Capsules**: Learn to create and structure capsules
- **Actions**: Dive deep into action definitions and schemas
- **Adapters**: Configure HTTP, WebSocket, and other transports
- **Interceptors**: Implement cross-cutting concerns
- **Traits**: Fine-tune route behavior with metadata
