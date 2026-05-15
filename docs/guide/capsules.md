# Capsules & Caps

A **Capsule** is the fundamental building block of CapsKit applications. It's a self-contained module that encapsulates a cohesive set of business capabilities. CapsKit supports two definition styles: the **new Cap-based composition model** (recommended) and the legacy flat manifest format (still supported).

---

## Directory Structure (New Cap Model)

```
calculator-capsule/
├── caps.ts                 # CapsuleRegistry — composes caps into a capsule
├── caps.d.ts (optional)    # Type declarations for registry export
├── manifest.ts (optional)  # Legacy manifest — co-exists during migration
├── .cap/
│   ├── calculator/
│   │   ├── cap.ts          # CapClass — business logic (class with action methods)
│   │   └── cap.meta.ts     # CapMeta — declarative metadata (routes, events, deps)
│   └── audit/
│       ├── cap.ts
│       └── cap.meta.ts
└── src/
    └── actions/ (optional) # Legacy action files — co-exist during migration
```

Each `.cap/` subdirectory is an independent **Cap** — a unit of business logic paired with its metadata contract. Caps are composed into a Capsule via the `caps.ts` registry.

### Per-Cap Directory (`{name}.cap/`)

Every `.cap/` directory must contain **exactly two files**:

| File | Purpose | Exports |
| :--- | :--- | :--- |
| `cap.ts` | Business logic class (CapClass) | `default` export — an instantiable class whose public methods are action handlers |
| `cap.meta.ts` | Declarative metadata contract (CapMeta) | `default` or named `meta` export — an object describing the cap's identity, routes, events, and dependencies |

Missing either file causes a runtime error during kernel boot.

---

## The CapClass (`cap.ts`)

A CapClass is a plain class whose public methods are action handlers. Each method receives `(input: ActionInput, ctx: CapContext)` and returns a `Promise`.

```ts
// .cap/calculator/cap.ts
import { ActionInput, CapContext } from '@mobtakronio/capskit';

export default class CalculatorCap {
  // Index signature required for dynamic dispatch compatibility
  [action: string]: any;

  async sum(input: ActionInput, ctx: CapContext): Promise<{ result: number }> {
    const { a, b } = input.body;
    return { result: a + b };
  }

  async multiply(input: ActionInput, ctx: CapContext): Promise<{ result: number }> {
    const { a, b } = input.body;
    return { result: a * b };
  }
}
```

### CapClass Requirements

1. **Default export** — must be exported as `export default class { ... }`.
2. **Index signature** — must declare `[action: string]: any` so the kernel can dynamically access handler methods.
3. **At least one public method** — a CapClass with no action methods fails validation.
4. **Instantiable with `new`** — the kernel constructs an instance at boot time (constructor can accept `deps`).

### Constructor with Dependencies

The kernel passes injected dependencies to the constructor:

```ts
export default class OrderCap {
  [action: string]: any;
  private db: any;

  constructor(deps?: Record<string, any>) {
    this.db = deps?.database;
  }

  async create(input: ActionInput, ctx: CapContext) {
    return this.db.orders.create(input.body);
  }
}
```

---

## The CapMeta (`cap.meta.ts`)

The CapMeta is the **Cap-level equivalent of a CapsuleManifest**. It declares everything the kernel needs to wire up routes, events, dependencies, and per-action behavior.

```ts
// .cap/calculator/cap.meta.ts
import { CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'calculator',

  routes: [
    { method: 'POST', path: '/sum',      action: 'sum' },
    { method: 'POST', path: '/multiply', action: 'multiply' },
  ],

  events: {
    publishes: ['calculator.sum.completed'],
    subscribes: [
      { event: 'numbers.received', action: 'sum' }
    ],
  },

  dependencies: ['math-utils'],

  // Per-action metadata (validation, caching, resiliency, documentation)
  actions: {
    sum: {
      description: 'Adds two numbers together',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
    },
  },

  // Boot lifecycle for this cap
  boot: {
    init: async ({ deps }) => {
      await deps.database.connect();
    },
  },
};
```

### CapMeta Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | ✓ | Unique cap identifier within the capsule |
| `routes` | `CapRoute[]` | ✗ | HTTP routes (method + path → action mapping) |
| `events.publishes` | `string[]` | ✗ | Events this cap emits |
| `events.subscribes` | `CapEventSubscription[]` | ✗ | Event → action mappings |
| `dependencies` | `string[]` | ✗ | External dependencies required by this cap |
| `actions` | `Record<string, CapActionMeta>` | ✗ | Per-action metadata (schema, cache, resiliency) |
| `boot` | `BootLifecycle` | ✗ | Boot lifecycle configuration |

### CapActionMeta (Per-Action Metadata)

Each entry in `CapMeta.actions` mirrors `ActionDefinition` (minus `handler`) and is merged into the final action during conversion:

```ts
interface CapActionMeta {
  description?: string;               // Human-readable description
  inputSchema?: ActionSchema;         // JSON Schema for input validation
  outputSchema?: OutputValidationOptions; // Output validation + strict mode
  cache?: CacheConfig;                // Action-level caching (memory/sqlite/redis)
  resiliency?: ResiliencyConfig;      // Fallback + circuit breaker
}
```

When a `description` is not provided, the kernel auto-generates: `Cap "calculator" action: sum`. Providing one overrides this default.

### CapRoute

Maps an HTTP method and URL path to a cap action method:

```ts
interface CapRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  path: string;              // e.g., '/users/:id'
  action: string;            // Name of the CapClass method to invoke
  traits?: string[] | Record<string, any>;  // Adapter middleware traits
}
```

### CapEventSubscription

Binds an event name to a cap action handler:

```ts
interface CapEventSubscription {
  event: string;   // Event name to subscribe to (e.g., 'user.created')
  action: string;  // CapClass method to invoke when the event fires
}
```

---

## The CapsuleRegistry (`caps.ts`)

The `caps.ts` file at the capsule root composes multiple Caps into a single Capsule. It imports each Cap's class and metadata, then groups them under a unique capsule name:

```ts
// calculator-capsule/caps.ts
import { CapsuleRegistry } from '@mobtakronio/capskit';
import CalculatorCap from './.cap/calculator/cap';
import { meta as calculatorMeta } from './.cap/calculator/cap.meta';
import AuditCap from './.cap/audit/cap';
import { meta as auditMeta } from './.cap/audit/cap.meta';

const calculatorCaps: CapsuleRegistry = {
  name: 'calculator',
  caps: [
    { class: CalculatorCap, meta: calculatorMeta },
    { class: AuditCap,      meta: auditMeta },
  ],
};

export default calculatorCaps;
```

### CapsuleRegistry Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | ✓ | Unique capsule name (used for dependency resolution and `capskit.use()`) |
| `caps` | `CapDefinition[]` | ✓ | Array of Cap definitions that compose this capsule (at least one required) |

### How the Kernel Converts It

When the kernel encounters a `caps.ts` registry, it uses `convertRegistryToManifest()` to produce the internal `CapsuleManifest` representation:

1. **Per cap**: Instantiates the CapClass, discovers its public methods, wraps each as an `ActionHandler` via `wrapCapHandler()`.
2. **Merge**: Routes, events, dependencies, and boot configs from all caps are merged into a single manifest.
3. **Action naming**: Each CapClass method becomes an action on the resulting manifest. Actions are registered under their method names (the capsule namespace provides uniqueness).

The resulting `CapsuleManifest` is structurally identical to what the legacy loader produces — the kernel doesn't know the difference after loading.

---

## CapContext — Execution Context for Cap Methods

Every CapClass method receives a `CapContext` as its second argument. This is the primary interface through which Cap business logic interacts with the CapsKit runtime:

```ts
interface CapContext {
  // ── Transport-agnostic input ──
  body: any;                     // The request body
  params?: any;                  // Route/path parameters (e.g., /users/:id)
  query?: Record<string, any>;   // Query string parameters (always an object)

  // ── Dependency injection ──
  deps: Record<string, any>;     // Injected services (database, redis, etc.)

  // ── Inter-cap communication ──
  invoke: (action: string, payload: CapInvokePayload) => Promise<any>;  // RPC (request/response)
  tell:   (action: string, payload: CapTellPayload) => void;            // Fire-and-forget

  // ── Event emission ──
  emit: (event: string, data: any) => void;

  // ── Typed capsule proxy ──
  use: <TCapsule = any>(capsuleName: string) => TCapsule;
}
```

### invoke — Request/Response (RPC)

Calls another action and waits for its response. This is the primary way to call across cap/capsule boundaries.

```ts
async placeOrder(input: ActionInput, ctx: CapContext) {
  // Validate stock via another capsule
  const stock = await ctx.invoke('inventory.check', {
    body: { sku: input.body.sku }
  });

  if (!stock.available) {
    throw new Error('Out of stock');
  }

  // Create the order
  const order = await ctx.deps.database.orders.create(input.body);
  return { orderId: order.id };
}
```

Under the hood, `invoke` constructs a `CapInvokeMessage` (kind: `'invoke'`), dispatches it through the kernel's interceptor pipeline, and returns the handler's result. A `correlationId` is automatically generated for request/response pairing.

### tell — Fire-and-Forget

Dispatches a message to another action **without waiting for a response**. The caller continues immediately. Ideal for notifications, logging, side-effects, and event-driven workflows.

```ts
async createUser(input: ActionInput, ctx: CapContext) {
  const user = await ctx.deps.database.users.create(input.body);

  // Fire-and-forget — don't block the response
  ctx.tell('analytics.track', {
    body: { event: 'user.created', userId: user.id }
  });
  ctx.tell('notifications.send', {
    body: { userId: user.id, type: 'welcome' }
  });

  return user;
}
```

Under the hood, `tell` constructs a `CapTellMessage` (kind: `'tell'`) and dispatches it without awaiting. Errors are caught and logged to avoid unhandled rejections.

### Payload Shapes

Both `invoke` and `tell` expect a payload with the same shape:

```ts
interface CapInvokePayload {
  body: any;
  params?: any;
  query?: Record<string, any>;
}

interface CapTellPayload {
  body: any;
  params?: any;
  query?: Record<string, any>;
}
```

---

## Format Detection

The kernel's `detectCapsuleFormat()` function automatically detects which format a directory uses. The priority order is:

| Priority | Kind | Signature |
| :--- | :--- | :--- |
| 1 (highest) | `caps-registry` | Contains `caps.ts` (or `.js`/`.mjs`/`.cjs`) |
| 2 | `cap-directories` | Contains `.cap/` subdirectories (no `caps.ts`) |
| 3 | `legacy-manifest` | Contains `manifest.ts` (no `caps.ts` or `.cap/`) |
| 4 | `unknown` | None of the above — skipped with a warning |

If a `caps.ts` file is present, it takes precedence — even if `.cap/` subdirectories or `manifest.ts` also exist.

---

## Comparison: Legacy Manifest vs. New Cap Model

| Aspect | Legacy (`manifest.ts`) | New Cap Model |
| :--- | :--- | :--- |
| **Entry point** | Single `manifest.ts` file | `caps.ts` registry composing `.cap/` directories |
| **Business logic** | Standalone functions in `actions/` | Class methods on a CapClass |
| **Metadata** | Flat `CapsuleManifest` object | Per-cap `CapMeta` objects (merged at boot) |
| **Handler format** | `handler: './actions/create'` (string path) or inline function | Class method (always direct reference) |
| **Per-action config** | Inline on `ActionDefinition` | In `CapMeta.actions` map keyed by method name |
| **Composition** | One manifest = one capsule (monolithic) | Multiple caps compose into one capsule via `CapsuleRegistry` |
| **Context API** | `ctx.call()` / `ctx.emit()` | `ctx.invoke()` / `ctx.tell()` / `ctx.emit()` |
| **Dependency injection** | Via `ctx.deps` | Via `ctx.deps` + optional constructor injection |
| **Boot lifecycle** | None on legacy | `CapMeta.boot` per cap (merged serially) |

---

## Migration Guide: Manifest → Cap Model

Follow these steps to migrate an existing capsule from the legacy `manifest.ts` format to the new Cap-based structure.

### Step 1: Identify Caps Within Your Capsule

Examine your existing `manifest.ts` and group related actions into logical Caps. A good rule of thumb: **one Cap = one cohesive set of actions that could reasonably be extracted into its own module**.

For example, a `user-capsule` with actions `create`, `update`, `delete`, `sendWelcomeEmail`, and `notifySlack` might split into:

- **`users` cap** — CRUD operations (`create`, `update`, `delete`)
- **`notifications` cap** — Notification side-effects (`sendWelcomeEmail`, `notifySlack`)

### Step 2: Create `.cap/` Directories

For each Cap, create a `.cap/{name}/` subdirectory:

```
user-capsule/
├── manifest.ts                  # Keep for now (backward compatibility)
├── caps.ts                      # NEW: CapsuleRegistry
├── src/actions/                 # Keep for now
└── .cap/
    ├── users/
    │   ├── cap.ts               # NEW
    │   └── cap.meta.ts          # NEW
    └── notifications/
        ├── cap.ts               # NEW
        └── cap.meta.ts          # NEW
```

### Step 3: Move Handler Logic into CapClass Methods

**Before** (legacy — `src/actions/create.ts`):

```ts
export default async function create(payload: any, context: ActionContext) {
  return { user: await context.deps.database.users.create(payload) };
}
```

**After** (new — `.cap/users/cap.ts`):

```ts
import { ActionInput, CapContext } from '@mobtakronio/capskit';

export default class UsersCap {
  [action: string]: any;

  async create(input: ActionInput, ctx: CapContext) {
    return { user: await ctx.deps.database.users.create(input.body) };
  }

  async update(input: ActionInput, ctx: CapContext) {
    return { user: await ctx.deps.database.users.update(input.params.id, input.body) };
  }

  async delete(input: ActionInput, ctx: CapContext) {
    await ctx.deps.database.users.delete(input.params.id);
    return { deleted: true };
  }
}
```

### Step 4: Create CapMeta for Each Cap

**Before** (legacy — flat in `manifest.ts`):

```ts
actions: {
  create: {
    handler: './actions/create',
    description: 'Create a new user',
    schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
  }
}
```

**After** (new — `.cap/users/cap.meta.ts`):

```ts
import { CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'users',
  routes: [
    { method: 'POST',   path: '/users',     action: 'create' },
    { method: 'PUT',    path: '/users/:id',  action: 'update' },
    { method: 'DELETE', path: '/users/:id',  action: 'delete' },
  ],
  actions: {
    create: {
      description: 'Create a new user',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
};
```

### Step 5: Wire Up the CapsuleRegistry

Create `caps.ts` at the capsule root to compose all caps:

```ts
import { CapsuleRegistry } from '@mobtakronio/capskit';
import UsersCap from './.cap/users/cap';
import { meta as usersMeta } from './.cap/users/cap.meta';
import NotificationsCap from './.cap/notifications/cap';
import { meta as notificationsMeta } from './.cap/notifications/cap.meta';

const userCaps: CapsuleRegistry = {
  name: 'user-capsule',
  caps: [
    { class: UsersCap,         meta: usersMeta },
    { class: NotificationsCap, meta: notificationsMeta },
  ],
};

export default userCaps;
```

### Step 6: Update `ctx.call()` → `ctx.invoke()` / `ctx.tell()`

Replace legacy `ctx.call()` calls with the new messaging API:

```ts
// Before (legacy)
const user = await ctx.call('user-capsule.get', { id: payload.userId });

// After (new Cap model)
const user = await ctx.invoke('user-capsule.get', { body: { id: payload.userId } });
```

For fire-and-forget:

```ts
// Before (legacy)
ctx.call('analytics.track', { event: 'page.viewed' }); // fire-and-forget pattern was implicit

// After (new Cap model)
ctx.tell('analytics.track', { body: { event: 'page.viewed' } });
```

### Step 7: Verify and Co-Exist

During migration, keep the legacy `manifest.ts` and `src/actions/` alongside the new files. The kernel's `detectCapsuleFormat()` gives priority to `caps.ts`, so the new path is used automatically. Legacy files can be removed once all consumers and tests are migrated.

Run your test suite to verify everything works. All built-in capsules (system, http, websocket, drizzle) have been migrated using this exact process.

---

## Built-in Capsule Examples

### System Capsule

The system capsule composes four caps:

```
system/
├── caps.ts
├── manifest.ts (legacy co-exists)
├── .cap/
│   ├── health/
│   │   ├── cap.ts          # HealthCap.getHealth()
│   │   └── cap.meta.ts     # name: 'health', routes: GET /health
│   ├── lister/
│   │   ├── cap.ts          # ListerCap.listCapsules()
│   │   └── cap.meta.ts     # name: 'lister', routes: GET /capsules
│   ├── metrics/
│   │   ├── cap.ts          # MetricsCap.metrics()
│   │   └── cap.meta.ts     # name: 'metrics', routes: GET /metrics
│   └── audit/
│       ├── cap.ts          # AuditCap.audit()
│       └── cap.meta.ts     # name: 'audit', events.subscribes: capskit-calculator.sum
└── src/actions/ (legacy)
```

### HTTP Capsule (Adapter Delegation)

The HTTP capsule is a thin dispatch shell with a single cap that dynamically generates routes at runtime:

```ts
// http/caps.ts
const httpCaps: CapsuleRegistry = {
  name: 'http',
  caps: [{ class: BuildRouterCap, meta: buildRouterMeta }],
};
```

The `BuildRouterCap` dynamically imports an external adapter package (e.g., `@mobtakronio/capskit-http-elysia`), validates adapter compatibility via `adapter-validation.ts` (semver-based checks), and calls `adapterFn(capskit, options)` to generate routes. No routes are hardcoded in the capsule — all mapping is produced by the external adapter introspecting the platform's capsule registry.

---

## Best Practices

### 1. One Cap = One Responsibility

Each Cap should encapsulate a single cohesive concern. If you find a CapClass growing beyond 5–7 action methods, consider splitting it into multiple caps within the same capsule.

### 2. Declare Metadata Explicitly

Always provide `CapActionMeta.description`, `inputSchema`, and `outputSchema`. They power documentation generation, runtime validation, and IDE autocompletion.

### 3. Prefer `invoke` for RPC, `tell` for Side-Effects

Use `ctx.invoke()` when you need a response. Use `ctx.tell()` for notifications, logging, and async side-effects where the caller doesn't depend on the result.

### 4. Keep Legacy Files During Migration

Don't delete `manifest.ts` or `src/actions/` until all tests pass and all consumers have been updated. The kernel automatically prefers `caps.ts` when present — co-existence is safe.

### 5. Use Constructor Injection for Required Dependencies

If a Cap always needs a specific dependency (e.g., a database connection), inject it via the constructor. Use `ctx.deps` for dependencies that vary per invocation.

---

## Next Steps

- **Loader & Discovery**: Learn how capsules are discovered and loaded by the kernel
- **Core / Manifests**: Understand the internal CapsuleManifest representation
- **Actions**: Deep dive into action handlers, hooks, and return values
- **HTTP / WebSocket Adapters**: Configure routes and websocket endpoints
- **Events**: Implement pub/sub patterns across capsules
- **Testing**: Write tests for caps and capsules
