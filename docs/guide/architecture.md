# Architecture Overview

CapsKit is a lightweight, strictly-opinionated runtime kernel designed to enforce the **Capability Architecture** pattern. It completely separates "what the system can do" from "how the system is told to do it."

## Core Philosophy

Traditional architectures tightly couple business logic to the transport layer. Your logic ends up expecting HTTP Request/Response objects, making it impossible to reuse the same capabilities in a CLI tool, message queue, or another service.

CapsKit inverts this. Your business logic lives in **pure Caps**—classes whose methods take simple payloads and return raw results. The kernel orchestrates everything else: discovery, dependency injection, event routing, and transport binding.

## The Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Transport Adapters                      │
│  (HTTP/Elysia, WebSocket, CLI, Event Consumers, etc.)     │
└─────────────────────────────────────────────────────────────┘
                              ↕ translates
┌─────────────────────────────────────────────────────────────┐
│                   CapsKit Kernel                            │
│  • CapsuleRegistry → Manifest conversion                    │
│  • Cap discovery & instantiation                            │
│  • Dependency injection container                          │
│  • Interceptor pipelines                                   │
│  • Event bus routing                                       │
│  • Trait → middleware translation                          │
└─────────────────────────────────────────────────────────────┘
                              ↕ calls
┌─────────────────────────────────────────────────────────────┐
│                     Capsules                                │
│  • caps.ts (CapsuleRegistry — composes caps)               │
│  • .cap/<name>/cap.ts (CapClass — business logic)         │
│  • .cap/<name>/cap.meta.ts (CapMeta — routes, events)     │
└─────────────────────────────────────────────────────────────┘
```

### 1. Capsules

A **Capsule** is a self-contained module of business capabilities. Under the new Cap model, it's a directory that composes one or more **Caps**—each cap being an independent unit of business logic paired with a declarative metadata contract:

```
my-capsule/
├── caps.ts                  # CapsuleRegistry — composes caps into a capsule
├── index.ts                 # Public re-exports (registry + legacy compatibility)
├── .cap/
│   ├── users/
│   │   ├── cap.ts           # CapClass — class with action methods
│   │   └── cap.meta.ts      # CapMeta — routes, events, dependencies, boot
│   └── notifications/
│       ├── cap.ts
│       └── cap.meta.ts
└── src/actions/ (optional)  # Legacy action files — co-exist during migration
```

The **`caps.ts`** registry composes caps into a deployable capsule:

```ts
// my-capsule/caps.ts
import { CapsuleRegistry } from '@mobtakronio/capskit';
import UsersCap from './.cap/users/cap';
import { meta as usersMeta } from './.cap/users/cap.meta';
import NotificationsCap from './.cap/notifications/cap';
import { meta as notifMeta } from './.cap/notifications/cap.meta';

const myCapsule: CapsuleRegistry = {
  name: 'my-capsule',
  caps: [
    { class: UsersCap, meta: usersMeta },
    { class: NotificationsCap, meta: notifMeta },
  ],
};

export default myCapsule;
```

Each `.cap/` directory contains exactly two files:

| File | Purpose | Exports |
| :--- | :--- | :--- |
| `cap.ts` | Business logic class (CapClass) | `default` export — instantiable class whose public methods are action handlers |
| `cap.meta.ts` | Declarative metadata contract (CapMeta) | Named `meta` export — object describing name, routes, events, dependencies, boot |

The `CapMeta` declares:
- **name**: Unique cap identifier within the capsule
- **routes**: HTTP method + path → action mappings
- **events**: Published events and subscriptions
- **dependencies**: Dependencies on other capsules or caps
- **actions**: Per-action metadata (descriptions, schemas, caching, resiliency)
- **boot**: Lifecycle initialization configuration

### 2. Caps (the CapClass)

A **Cap** is the atomic unit of business logic. It's a class whose public methods are action handlers. Each method receives `(input: ActionInput, ctx: CapContext)` and returns a `Promise`:

```ts
// .cap/users/cap.ts
import { ActionInput, CapContext } from '@mobtakronio/capskit';

export default class UsersCap {
  // Index signature required for dynamic dispatch compatibility
  [action: string]: any;

  async createUser(input: ActionInput, ctx: CapContext): Promise<{ user: any }> {
    const { name, email } = input.body;
    const user = await ctx.deps.database.users.create({ name, email });
    return { user };
  }

  async deleteUser(input: ActionInput, ctx: CapContext): Promise<{ deleted: boolean }> {
    const { id } = input.params;
    await ctx.deps.database.users.delete(id);
    return { deleted: true };
  }
}
```

Cap characteristics:
- **Input**: `ActionInput` — payload with `body`, optional `params`/`query` (validated against schema)
- **Context**: `CapContext` — injected dependencies (`ctx.deps`), invocation helpers (`ctx.invoke`, `ctx.tell`), event emission (`ctx.emit`), and capsule access (`ctx.use`)
- **Output**: Raw result (serialized to JSON)
- **Transport agnostic**: No HTTP/WS concepts leak into the cap

The corresponding metadata contract:

```ts
// .cap/users/cap.meta.ts
import { CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'users',
  routes: [
    { method: 'POST', path: '/users', action: 'createUser' },
    { method: 'DELETE', path: '/users/:id', action: 'deleteUser' },
  ],
  events: {
    publishes: ['user.created'],
  },
  dependencies: ['database'],
  actions: {
    createUser: {
      description: 'Creates a new user account',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      },
    },
  },
  boot: {
    init: async ({ deps }) => {
      await deps.database.ensureUsersTable();
    },
  },
};
```

### 3. The Kernel

The **Kernel** (`CapsKit` class) is the orchestration engine:

1. **Discovery**: Loads capsules from directories, CapsuleRegistries, or npm packages
2. **Conversion**: Converts `CapsuleRegistry` entries into internal `CapsuleManifest` representations via `convertRegistryToManifest()`
3. **Cap Instantiation**: Instantiates each `CapClass` and registers its public methods as action handlers
4. **Validation**: Validates metadata structure and dependencies
5. **Registration**: Registers actions, events, and adapter metadata
6. **Execution**: Provides `call(action, payload)` and `use(capsule)` APIs
7. **Pipeline**: Wraps every action with interceptors and hooks

```ts
import { createCapsKit } from '@mobtakronio/capskit'

const capskit = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' },
    { type: 'caps-registry', path: './src/capsules/my-capsule' },
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
    Cap Method (your business logic in the CapClass)
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
Cap Discovery
   ↓
Registry → Manifest Conversion (convertRegistryToManifest)
   ↓
CapClass Instantiation
   ↓
Dependency Resolution
   ↓
Action Registration
   ↓
Adapter Binding (based on per-cap routes/traits)
   ↓
Ready for Execution
```

## Type Safety

CapsKit is TypeScript-first:

- **Action payloads** validated via JSON Schema (runtime) and inferred types (dev)
- **Dependencies** typed via `CapsKitConfig.dependencies` generic
- **Capsule clients** (`use()`) have typed action methods based on registered manifests
- **Cap structure** validated at boot time (missing files, malformed metadata)

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

Because cap methods are pure functions, the same capsule can be triggered by:

- **HTTP**: Elysia/Express adapter binds routes to cap actions
- **WebSocket**: WebSocket adapter binds socket events to cap actions
- **Event Bus**: Subscribe to events and dispatch to cap actions
- **CLI**: Direct `call()` from a command script
- **Cron Jobs**: Schedule `call()` invocations
- **Other Capsules**: Direct `context.call()` or `capsule.action()`

No code changes needed. Just configure the appropriate adapter and routes/subscriptions in the cap's `cap.meta.ts`.

## Caps vs Capsules — the Composition Model

The Cap model introduces a two-level hierarchy:

- **Cap**: Atomic unit — a single class (`cap.ts`) + metadata (`cap.meta.ts`). Equivalent to a small, focused set of related actions.
- **Capsule**: Composition unit — groups one or more caps under a single name via `caps.ts` (`CapsuleRegistry`). This is the deployable, dependency-resolvable unit.

This composition model enables:
- **Finer granularity**: Split a large capsule into focused caps (e.g., `users`, `notifications`) within the same capsule
- **Independent metadata**: Each cap declares its own routes, events, and dependencies
- **Inter-cap dependencies**: Caps within the same capsule can depend on each other via `CapMeta.dependencies`
- **Gradual migration**: Legacy `manifest.ts` co-exists alongside `caps.ts` during migration

## API Boundaries

CapsKit provides two APIs with different intended use cases:

### Public API: `use().action()`

**The recommended approach for application code.**

```ts
const users = capskit.use('users');
const user = await users.create({ email: 'test@example.com' });
```

Benefits:
- Type-safe with full IDE autocompletion
- Natural, object-like syntax
- Refactoring-friendly (rename works)
- Self-documenting code

### Internal API: `call()`

**For kernel, adapters, and advanced use cases.**

```ts
// Adapters and kernel internals
await capskit.call('system.getHealth', {});

// Dynamic action resolution (when action name is a variable)
await capskit.call(dynamicActionName, payload);
```

Use `call()` when:
- Building adapters (HTTP, WebSocket, etc.)
- Implementing kernel functionality
- Dynamic action invocation where the name is determined at runtime

### Context API

Inside cap methods, both `context.call()` and `context.use()` are available:

```ts
// context.use() - preferred for known capsules
const users = context.use('users');
await users.create({ email: 'test@example.com' });

// context.call() - for dynamic resolution
const result = await context.call(dynamicAction, payload);
```

### Lint Rule

Use the `@capskit/no-direct-call` ESLint rule to enforce the `use().action()` pattern:

```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

```js
// eslint.config.js
import { capsKitLintRules } from '@mobtakronio/capskit/lint';

export default [
  {
    files: ['**/*.ts'],
    rules: {
      ...capsKitLintRules,
    },
  },
];
```

### Runtime Warning

Enable `warnOnDirectCall` in development to catch accidental `call()` usage:

```ts
const { capskit } = await createCapsKit({
  capsules: [...],
  warnOnDirectCall: process.env.NODE_ENV !== 'production',
});
```

See the [Migration Guide](./migration/call-to-use.md) for detailed upgrade instructions.

## Next Steps

- **Philosophy**: Understand the design principles behind CapsKit
- **Capsules**: Learn to create and structure capsules with the Cap model
- **Caps**: Dive deep into CapClass design and CapMeta declarations
- **Adapters**: Configure HTTP, WebSocket, and other transports
- **Interceptors**: Implement cross-cutting concerns
- **Traits**: Fine-tune route behavior with metadata
