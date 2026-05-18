# CapsKit Refactor Plan — Function-Oriented Capsule Architecture

## Overview

This is a **ground-up reimplementation** of CapsKit's core and capsule model. No legacy support. No backward compatibility. The new design is function-oriented, enforces clean separation of concerns through file suffixes, and every built-in capsule follows the same structure it enforces on users.

**One language. Every capsule. Every time.**

**Core principle: one capsule = one wrapper for one mission.** The kernel is NOT a god capsule. It is one capsule among five built-in capsules, each with its own mission.

---

## 1. Capsule Structure — The Standard

Every capsule follows this exact structure. No exceptions. Built-in capsules are no different from user capsules.

```
capsules/orders/
├── capsule.ts                          # Character declaration (REQUIRED)
├── types/
│   ├── order.type.ts                   # What IS an order
│   ├── order-item.type.ts              # What IS an order item
│   └── order-filter.type.ts            # What IS a filter
├── errors.ts                           # What can GO WRONG (OrderNotFoundError, ORDER_ERRORS)
├── constants.ts                        # What NEVER CHANGES (ORDER_STATUS, MAX_ITEMS)
├── repository/
│   ├── order.repository.ts             # How to ACCESS orders (DB queries/mutations)
│   └── payment.repository.ts           # How to ACCESS payments (external API calls)
├── rules/                              # business decision
│   ├── can-cancel.rule.ts              # Constraint: can this order be cancelled?
│   └── has-permission.rule.ts          # Constraint: is this user allowed?
├── helpers/                            # Deterministic computation
│   ├── calculate-total.helper.ts       # Computation: items + discount → total
│   └── determine-status.helper.ts      # Computation: current status + event → new status
└── caps/
    ├── create-order.cap.ts             # POST /orders → create order
    ├── cancel-order.cap.ts             # POST /orders/:id/cancel
    ├── list-orders.cap.ts              # GET /orders
    └── ship-orders.cap.ts              # POST /orders/:id/ship
```

### Capsule Root Files

| File | Suffix | What goes here | What does NOT go here | Required? |
|---|---|---|---|---|
| `capsule.ts` | — | Capsule name, dependencies, boot lifecycle | Logic, queries, validation | **YES** |
| `types/` | `.type.ts` | TypeScript interfaces, type aliases, enums | Functions, runtime logic, I/O | If custom types exist |
| `errors.ts` | `.error.ts` | Error classes, error message constants | Functions that do I/O | If custom errors exist |
| `constants.ts` | `.constant.ts` | Runtime-invariant values (status codes, limits) | Functions, computed values | If constants exist |
| `repository/` | `.repository.ts` | DB queries, external API calls, cache access | Business rules, validation | If I/O is performed |
| `rules/` | `.rule.ts` | Constraints — returns boolean or throws | I/O, computations, data transformation | If shared constraints exist |
| `helpers/` | `.helper.ts` | Pure computations — takes input, returns value | I/O, constraints (boolean/throw) | If shared computations exist |

### capsule.ts — The ONLY Entry Point

The kernel auto-discovers `.cap.ts` files from `caps/`. No manual cap listing.

```ts
// capsules/orders/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: ['database', 'payment-gateway'],
  boot: {
    init: async ({ deps }) => {
      await deps.database.migrate();
    },
  },
} satisfies CapsuleDefinition;
```

**What goes here:** capsule name, dependency declarations, boot lifecycle.
**What does NOT go here:** cap references (auto-discovered), business logic, handlers.

### Types — `.type.ts`

```ts
// capsules/orders/types/order.type.ts
export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: Date;
}

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'shipped';
```

**Rule:** A `.type.ts` file exports ONLY TypeScript types, interfaces, and enums. Zero runtime logic. Zero function exports. Zero imports from `.rule.ts`, `.helper.ts`, `.repository.ts`, `.cap.ts`.

### Errors

```ts
// capsules/orders/errors.ts
import { NotFoundError, ValidationError } from '@mobtakronio/capskit';

export const ORDER_ERRORS = {
  EMPTY_ITEMS: 'Order must contain at least one item',
  ALREADY_CANCELLED: 'Order is already cancelled',
} as const;

export class OrderNotFoundError extends NotFoundError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
  }
}
```

**Rule:** Error classes and error message constants only. Zero imports from `.rule.ts`, `.helper.ts`, `.repository.ts`, `.cap.ts`.

### Constants

```ts
// capsules/orders/constants.ts
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  SHIPPED: 'shipped',
} as const;

export const MAX_ITEMS_PER_ORDER = 100;
export const DEFAULT_PAGE_SIZE = 20;
```

**Rule:** Runtime-invariant values only. `as const` for literal types. Zero imports from `.rule.ts`, `.helper.ts`, `.repository.ts`, `.cap.ts`.

### Repository — `.repository.ts`

```ts
// capsules/orders/repository/order.repository.ts
import { Order, OrderInput, OrderFilter } from '../types/order.type';

export const orderRepository = {
  async create(db: any, input: OrderInput): Promise<Order> {
    return db.orders.create({ data: input });
  },

  async findById(db: any, id: string): Promise<Order | null> {
    return db.orders.findUnique({ where: { id } });
  },

  async updateStatus(db: any, id: string, status: string): Promise<Order> {
    return db.orders.update({ where: { id }, data: { status } });
  },

  async findWithFilters(db: any, filter: OrderFilter): Promise<Order[]> {
    return db.orders.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
      },
    });
  },
};
```

**Rule:** All I/O goes through repository files. Each file groups queries/mutations for one entity or external service. Repository files can import from `.type.ts` and `.error.ts` only. **NEVER** import from `.rule.ts`, `.helper.ts`, `.cap.ts`.

### Rules — `.rule.ts`

```ts
// capsules/orders/rules/can-cancel.rule.ts
import { Order } from '../types/order.type';

export function canCancel(order: Order): boolean {
  return order.status !== 'shipped' && order.status !== 'cancelled';
}
```

**Rule:** Rules return `boolean` or `throw`. They NEVER perform I/O. They can import from `.type.ts`, `.error.ts`, `.constant.ts`, and `.helper.ts`. **NEVER** import from `.repository.ts` or `.cap.ts`.

### Helpers — `.helper.ts`

```ts
// capsules/orders/helpers/calculate-total.helper.ts
import { OrderItem } from '../types/order-item.type';

export function calculateTotal(items: OrderItem[], discount?: number): number {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (discount && discount > 0) {
    return Math.max(0, subtotal - discount);
  }
  return subtotal;
}
```

**Rule:** Helpers are pure functions that take input and return a computed value. No I/O. No `ctx.deps`. They can import from `.type.ts`, `.error.ts`, `.constant.ts`. **NEVER** import from `.repository.ts`, `.rule.ts`, `.cap.ts`.

### Caps — `.cap.ts`

Each `.cap.ts` file exports **two things**: the `meta` (CapMeta) and the `default` handler function.

```ts
// capsules/orders/caps/create-order.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';
import { OrderInput } from '../types/order.type';
import { ORDER_STATUS } from '../constants';
import { orderRepository } from '../repository/order.repository';
import { canCancel } from '../rules/can-cancel.rule';
import { calculateTotal } from '../helpers/calculate-total.helper';

export const meta: CapMeta = {
  name: 'create-order',
  kind: 'action',
  routes: [{ method: 'POST', path: '/orders', cap: 'create-order' }],
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array' },
      discount: { type: 'number' },
    },
    required: ['items'],
  },
  events: {
    publishes: ['order.created'],
  },
  hooks: { pre: [], post: [] },
};

export default async function createOrder(input: CapInput, ctx: CapContext) {
  const items = input.body.items;
  const total = calculateTotal(items, input.body.discount);
  const order = await orderRepository.create(ctx.deps.database, {
    items, total, status: ORDER_STATUS.PENDING,
  });
  ctx.emit('order.created', { orderId: order.id });
  return { order };
}
```

**HARD LIMIT: 200 LINES MAXIMUM.** If a `.cap.ts` file exceeds 200 lines, you MUST extract logic into `.rule.ts`, `.helper.ts`, or `.repository.ts` files.

**Rule:** Caps orchestrate — they call rules, helpers, and repositories. They emit events and return results. They do NOT contain business logic, DB queries, or pure computations inline. They can import from ALL other layers. **NEVER import from another `.cap.ts` file.**

### Hook Caps

Hook caps replace traits. They follow the same `.cap.ts` format but with `kind: 'hook'`:

```ts
// capsules/security/caps/require-auth.cap.ts
import { CapInput, CapContext, CapMeta, AuthorizationError } from '@mobtakronio/capskit';
import { decodeJWT } from '../helpers/decode-jwt.helper';
import { isTokenExpired } from '../rules/is-token-expired.rule';

export const meta: CapMeta = {
  name: 'require-auth',
  kind: 'hook',
};

export default async function requireAuth(input: CapInput, ctx: CapContext) {
  const token = input.headers?.authorization?.replace('Bearer ', '');
  if (!token) throw new AuthorizationError('Authentication required');
  const payload = decodeJWT(token);
  if (isTokenExpired(payload)) throw new AuthorizationError('Token expired');
  ctx.user = payload;
}
```

Caps reference hooks in their meta:

```ts
export const meta: CapMeta = {
  name: 'delete-order',
  kind: 'action',
  hooks: { pre: ['require-auth', 'require-admin-role'] },
  routes: [{ method: 'DELETE', path: '/orders/:id', cap: 'delete-order' }],
};
```

The kernel resolves hook names at boot, chains them before the action handler. **Transport-agnostic** — works for HTTP, WebSocket, events, and `ctx.invoke()`.

---

## 2. Dependency Rules — ENFORCED

```
DEPENDENCY PYRAMID (imports flow DOWN only):

     .cap.ts          ← Entry: orchestrates everything
       │
  ┌────┼──────────────────┐
  │    │                  │
.rule.ts  .helper.ts  .repository.ts  ← Shared logic
  │    │                  │
  └────┼──────────────────┘
       │
  .type.ts  .error.ts  .constant.ts   ← Foundation: no imports from above
```

| Layer | Can import from | CANNOT import from |
|---|---|---|
| `.cap.ts` | ALL layers below | Other `.cap.ts` files |
| `.rule.ts` | `.type.ts`, `.error.ts`, `.constant.ts`, `.helper.ts` | `.repository.ts`, `.cap.ts` |
| `.helper.ts` | `.type.ts`, `.error.ts`, `.constant.ts` | `.repository.ts`, `.rule.ts`, `.cap.ts` |
| `.repository.ts` | `.type.ts`, `.error.ts`, `.constant.ts` | `.rule.ts`, `.helper.ts`, `.cap.ts` |
| `.type.ts` / `.error.ts` / `.constant.ts` | Each other only | ALL layers above |

**Cross-cap communication:** `ctx.invoke()` (RPC) or `ctx.emit()` (events). NEVER direct imports.

**Graduation rule:** Code starts inline in `.cap.ts`. When a second cap needs the same logic, it graduates to the capsule-level (rules/, helpers/, repository/). Never pre-extract.

---

## 3. Built-in Capsules — Five Missions

The kernel PACKAGE ships with five built-in capsules. Each is a separate capsule with its own mission, its own directory, and its own structure. **One capsule = one mission.** The kernel capsule is NOT a god capsule — it is ONE of five.

| Capsule | Mission | Caps | Has runtime deps? | Loaded |
|---|---|---|---|---|
| **kernel** | The engine — execute, lifecycle | boot, call, register, use, shutdown | No | 1st |
| **events** | Pub/sub messaging | emit, subscribe, unsubscribe, list-subscriptions | No | 2nd |
| **http** | Route compilation | build-router | No | 3rd |
| **websocket** | WS compilation | build-websocket | No | 4th |
| **system** | Introspection | health, inspect | No | 5th |

All five are built-in: they ship with `@mobtakronio/capskit`, have zero runtime dependencies, and are loaded automatically before user capsules. The user can disable individual built-ins if they don't need them.

### Built-in vs External

| | Built-in (ship with `@mobtakronio/capskit`) | External (install separately) |
|---|---|---|
| **What** | kernel, events, http, websocket, system | drizzle, cache, calculator, security |
| **Why built-in** | Every app needs these | Optional domain concerns |
| **Has runtime deps?** | No | Yes — drizzle-orm, ioredis, etc. |
| **Loaded at boot** | Automatically, before user capsules | User adds via `capsuleDirs` or `capsules` |
| **Follows capsule structure?** | Yes — same as user capsules | Yes — same as user capsules |

**The test: does every CapsKit app need this, and can it be built with zero runtime dependencies?**

- kernel → YES, YES → built-in
- events → YES, YES → built-in
- http (buildRouter) → YES, YES → built-in
- websocket → YES, YES → built-in
- system → YES, YES → built-in
- drizzle → NO, NO → external
- cache → NO, NO → external
- calculator → NO, NO → external

---

## 4. Kernel Capsule — The Engine

Mission: **boot the system, execute actions, manage lifecycle.** Nothing else. Routing is http's job. Events are events' job. Introspection is system's job.

```
capsules/kernel/
├── capsule.ts                              # name: 'kernel', dependencies: []
├── types/
│   ├── cap.type.ts                       # CapInput, CapContext, CapHandler
│   ├── cap-meta.type.ts                     # CapMeta, CapRoute, CapEventSubscription
│   ├── capsule-definition.type.ts           # CapsuleDefinition
│   ├── hook.type.ts                       # HookCap, HooksPipeline
│   └── result.type.ts                       # Result<T>, Ok(), Err()
├── errors.ts                                # NotFoundError, InternalError, ValidationError
├── constants.ts                             # KERNEL_VERSION, DEFAULT_BOOT_TIMEOUT
├── repository/
│   └── filesystem.repository.ts            # discoverCapsules, discoverCaps, scanDir
├── rules/
│   ├── validate-cap-meta.rule.ts            # validateCapMeta(meta) → boolean
│   ├── validate-deps-graph.rule.ts          # validateDepGraph(capsules) → boolean
│   └── detect-cycle.rule.ts                # detectCycle(capsules) → CycleError | null
├── helpers/
│   ├── discover-caps.helper.ts              # discoverCaps(capsDir) → CapFile[]
│   ├── build-hooks-pipeline.helper.ts       # chain hooks before handler
│   └── parse-cap-path.helper.ts          # "capsule.cap" → { capsule, cap }
├── caps/
│   ├── boot.cap.ts                          # Load, validate, wire, start
│   ├── call.cap.ts                          # Execute action through hooks pipeline
│   ├── register.cap.ts                      # Register capsule at runtime
│   ├── use.cap.ts                           # Proxy-based capsule access
│   └── shutdown.cap.ts                       # Graceful shutdown
└── (index re-exports from package)
```

### Kernel capsule.ts

```ts
// capsules/kernel/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'kernel',
  dependencies: [],
  boot: {
    init: async ({ deps }) => {
      // Load built-in capsules (events, http, websocket, system)
      // Then scan user capsuleDirs
      // Then validate, resolve, wire
    },
  },
} satisfies CapsuleDefinition;
```

### What the kernel does NOT own

| NOT in kernel capsule | Why | Where it lives |
|---|---|---|
| Route compilation | Different mission | http capsule |
| Event dispatch / subscriptions | Different mission | events capsule |
| Health check / introspection | Different mission | system capsule |
| WS endpoint compilation | Different mission | websocket capsule |
| Cache implementations | External dep | @mobtakronio/capskit-cache |
| Drizzle queries | External dep | @mobtakronio/capskit-drizzle |

### ctx.emit — Delegated to Events Capsule

The kernel provides `ctx.emit` on CapContext as a convenience method, but delegates to the events capsule:

```ts
// In the kernel's CapContext construction:
const context: CapContext = {
  deps: { ...state.dependencies },
  emit: (event: string, data: any) => {
    // Delegate to events capsule — no event logic in the kernel
    capskit.call('events.emit', { body: { event, data } });
  },
  invoke: (capPath, payload) => {
    return capskit.call(capPath, payload, { fromUse: true });
  },
  tell: (capPath, payload) => {
    capskit.call(capPath, payload, { fromUse: true }).catch(() => {});
  },
  use: (name) => capskit.use(name),
};
```

---

## 5. Events Capsule — Pub/Sub Messaging

Mission: **publish events, manage subscriptions, dispatch to subscribers.**

```
capsules/events/
├── capsule.ts
├── types/
│   ├── event.type.ts                    # EventPayload, EventName
│   └── subscription.type.ts             # SubscriptionEntry, SubscriptionMap
├── errors.ts                             # EventDeliveryError, DeadLetterError
├── constants.ts                          # MAX_SUBSCRIBER_RETRY, WILDCARD_PATTERN
├── rules/
│   └── is-valid-event.rule.ts            # Is this event well-formed?
├── helpers/
│   ├── match-event-pattern.helper.ts    # "orders.*" matches "orders.created"?
│   └── build-subscription-map.helper.ts # CapMeta subscribes → subscription map
└── caps/
    ├── emit.cap.ts                       # Publish event → dispatch to subscribers
    ├── subscribe.cap.ts                  # Runtime subscription (add listener)
    ├── unsubscribe.cap.ts                # Runtime unsubscription (remove listener)
    └── list-subscriptions.cap.ts         # Inspect current subscriptions
```

### Events capsule.ts

```ts
// capsules/events/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'events',
  dependencies: [],
  boot: {
    init: async ({ deps }) => {
      // Scan all loaded capsule metadata for events.subscribes declarations
      // Build the initial subscription map from metadata
    },
  },
} satisfies CapsuleDefinition;
```

### emit.cap.ts example

```ts
// capsules/events/caps/emit.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';
import { matchEventPattern } from '../helpers/match-event-pattern.helper';

export const meta: CapMeta = {
  name: 'emit',
  kind: 'action',
};

export default async function emit(input: CapInput, ctx: CapContext) {
  const { event, data } = input.body;
  const exactSubs = ctx.deps.eventsState.subscriptions.get(event) || [];
  const wildcardSubs = ctx.deps.eventsState.wildcardSubscribers
    .filter(sub => matchEventPattern(sub.pattern, event));
  const allSubs = [...exactSubs, ...wildcardSubs];

  for (const sub of allSubs) {
    ctx.invoke(sub.capPath, { body: data }).catch(err => {
      // Dead letter handling
      ctx.invoke('events.handle-dead-letter', {
        body: { event, data, capPath: sub.capPath, error: err.message },
      });
    });
  }
}
```

---

## 6. HTTP Capsule — Route Compilation

Mission: **compile CapMeta routes into a unified format any adapter can consume.**

```
capsules/http/
├── capsule.ts
├── types/
│   ├── compiled-route.type.ts            # CompiledRoute, BuildRouterResult
│   └── http-adapter.type.ts              # HttpAdapter contract
├── helpers/
│   └── compile-routes.helper.ts          # CapMeta routes → CompiledRoute[]
└── caps/
    └── build-router.cap.ts               # Compile all caps → unified routes
```

### HTTP capsule.ts

```ts
// capsules/http/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'http',
  dependencies: [],
} satisfies CapsuleDefinition;
```

### What HTTP capsule owns vs what the adapter owns

| Kernel HTTP capsule owns | Adapter (external) owns |
|---|---|
| Read CapMeta routes from all capsules | Create framework-specific server (Elysia, Express, Hono) |
| Resolve hook chains per route | Register routes with framework API |
| Compile unified `CompiledRoute[]` format | Handle HTTP request/response lifecycle |
| Validate route metadata | Transport-level concerns (CORS, compression) |

The HTTP capsule has **zero runtime dependencies.** It compiles metadata. The adapter (Elysia, Express, Hono) is the pluggable transport.

### Adapter contract

```ts
// capsules/http/types/http-adapter.type.ts
interface HttpAdapter {
  name: string;    // 'elysia' | 'express' | 'hono'
  version: string;
  createServer(routes: BuildRouterResult, options: ServerOptions): Promise<Server>;
}
```

### Usage

```ts
// User's index.ts
const http = capskit.use('http');
const { routes } = await http.buildRouter();

// Plug into any adapter
const { createServer } = await import('@mobtakronio/capskit-http-elysia');
await createServer(routes, { port: 3000 });
```

---

## 7. WebSocket Capsule — WS Endpoint Compilation

Mission: **compile CapMeta WebSocket events into a unified format any WS adapter can consume.**

```
capsules/websocket/
├── capsule.ts
├── types/
│   ├── compiled-endpoint.type.ts         # CompiledWSEndpoint, BuildWSResult
│   └── ws-adapter.type.ts               # WsAdapter contract
├── helpers/
│   └── compile-endpoints.helper.ts
└── caps/
    └── build-websocket.cap.ts            # Compile all caps → unified WS endpoints
```

Same pattern as HTTP: kernel compiles, adapter serves. Socket.io, ws, etc. are pluggable adapters.

---

## 8. System Capsule — Introspection

Mission: **runtime introspection and health monitoring.**

```
capsules/system/
├── capsule.ts
└── caps/
    ├── health.cap.ts                      # Health check: status, uptime, capsule count
    └── inspect.cap.ts                     # List actions, manifests, dependencies, hooks
```

Minimal capsule. No types, rules, or helpers needed — the data comes from querying kernel state via `ctx.deps.capskit`.

---

## 9. Full Package Structure

```
packages/capskit/src/
├── capsules/                                # All built-in capsules
│   ├── kernel/                             # Mission: the engine
│   │   ├── capsule.ts
│   │   ├── types/
│   │   │   ├── cap.type.ts
│   │   │   ├── cap-meta.type.ts
│   │   │   ├── capsule-definition.type.ts
│   │   │   ├── hook.type.ts
│   │   │   └── result.type.ts
│   │   ├── errors.ts
│   │   ├── constants.ts
│   │   ├── repository/
│   │   │   └── filesystem.repository.ts
│   │   ├── rules/
│   │   │   ├── validate-cap-meta.rule.ts
│   │   │   ├── validate-deps-graph.rule.ts
│   │   │   └── detect-cycle.rule.ts
│   │   ├── helpers/
│   │   │   ├── discover-caps.helper.ts
│   │   │   ├── build-hooks-pipeline.helper.ts
│   │   │   └── parse-cap-path.helper.ts
│   │   └── caps/
│   │       ├── boot.cap.ts
│   │       ├── call.cap.ts
│   │       ├── register.cap.ts
│   │       ├── use.cap.ts
│   │       └── shutdown.cap.ts
│   │
│   ├── events/                             # Mission: pub/sub messaging
│   │   ├── capsule.ts
│   │   ├── types/
│   │   │   ├── event.type.ts
│   │   │   └── subscription.type.ts
│   │   ├── errors.ts
│   │   ├── constants.ts
│   │   ├── rules/
│   │   │   └── is-valid-event.rule.ts
│   │   ├── helpers/
│   │   │   ├── match-event-pattern.helper.ts
│   │   │   └── build-subscription-map.helper.ts
│   │   └── caps/
│   │       ├── emit.cap.ts
│   │       ├── subscribe.cap.ts
│   │       ├── unsubscribe.cap.ts
│   │       └── list-subscriptions.cap.ts
│   │
│   ├── http/                               # Mission: route compilation
│   │   ├── capsule.ts
│   │   ├── types/
│   │   │   ├── compiled-route.type.ts
│   │   │   └── http-adapter.type.ts
│   │   ├── helpers/
│   │   │   └── compile-routes.helper.ts
│   │   └── caps/
│   │       └── build-router.cap.ts
│   │
│   ├── websocket/                          # Mission: WS compilation
│   │   ├── capsule.ts
│   │   ├── types/
│   │   │   ├── compiled-endpoint.type.ts
│   │   │   └── ws-adapter.type.ts
│   │   ├── helpers/
│   │   │   └── compile-endpoints.helper.ts
│   │   └── caps/
│   │       └── build-websocket.cap.ts
│   │
│   └── system/                             # Mission: introspection
│       ├── capsule.ts
│       └── caps/
│           ├── health.cap.ts
│           └── inspect.cap.ts
│
└── index.ts                                 # Public API barrel export
```

---

## 10. Types Reference

### CapsuleDefinition

```ts
interface CapsuleDefinition {
  name: string;
  dependencies?: string[];
  boot?: {
    init?: (context: { deps: Record<string, any> }) => Promise<void>;
  };
}
```

No `caps` field. Auto-discovered from `caps/` directory.

### CapMeta

```ts
interface CapMeta {
  name: string;
  kind: 'action' | 'hook';
  routes?: CapRoute[];
  events?: {
    publishes?: string[];
    subscribes?: CapEventSubscription[];
  };
  hooks?: { pre?: string[]; post?: string[] } | string[];
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  actions?: Record<string, CapActionMeta>;
  dependencies?: string[];
  description?: string;
}

interface CapRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  cap: string;
}
```

### CapContext

```ts
interface CapContext {
  deps: Record<string, any>;
  emit: (event: string, data: any) => void;      // Delegates to events.emit
  invoke: (capPath: string, payload: any) => Promise<any>;
  tell: (capPath: string, payload: any) => void;
  use: <T = any>(capsuleName: string) => T;
   user?: any;  // Set by auth hooks
}
```

---

## 11. Boot Sequence

```
1.  Load kernel capsule          → engine is ready (call, register, use, shutdown)
2.  Load events capsule          → pub/sub is ready (emit, subscribe)
3.  Load http capsule            → route compilation is ready (buildRouter)
4.  Load websocket capsule      → WS compilation is ready (buildWebSocket)
5.  Load system capsule          → introspection is ready (health, inspect)
6.  Scan user capsuleDirs        → discover user capsules
7.  Validate ALL capsules        → dependency graph, meta shapes, cycles
8.  Register user capsules       → orders, users, security, etc.
9.  Resolve hooks                → wire hook caps before action caps
10. Wire event subscriptions     → read CapMeta events.subscribes, register with events capsule
11. Run boot lifecycles          → per capsule, in topological dependency order
12. System is ready
```

Steps 1–5: built-in capsules (always available).
Steps 6–10: user capsules (auto-discovered).
Step 11: ALL capsules, built-in + user, run boot in dependency order.

---

## 12. Initialization

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit } = await createCapsKit({
  capsuleDirs: ['./capsules'],
  dependencies: {
    database: createDatabaseConnection(),
    'jwt-secret': process.env.JWT_SECRET,
  },
});

// Built-in capsules are already loaded. No config needed for kernel, events, http, ws, system.

// Use the HTTP capsule to compile routes
const http = capskit.use('http');
const { routes } = await http.buildRouter();

// Plug into any adapter
const { createServer } = await import('@mobtakronio/capskit-http-elysia');
await createServer(routes, { port: 3000 });
```

### createCapsKit Config

```ts
interface CapsKitConfig {
  capsuleDirs?: string[];          // Directories to scan for capsule.ts
  capsules?: string[];            // Explicit capsule paths
  dependencies?: Record<string, any>;
  cacheAdapter?: CacheAdapter;     // From @mobtakronio/capskit-cache
  disableBuiltins?: string[];     // e.g., ['websocket'] for CRON-only apps
  boot?: {
    cap: string;
    payload?: any;
  };
}
```

---

## 13. Zero External Dependencies

The `@mobtakronio/capskit` package has **NO runtime dependencies.**

```jsonc
// packages/capskit/package.json
{
  "name": "@mobtakronio/capskit",
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.x",
    "tsup": "^8.x",
    "vitest": "^1.x"
  }
}
```

| Concern | Location |
|---|---|
| HTTP adapter (Elysia) | `@mobtakronio/capskit-http-elysia` |
| HTTP adapter (Express) | `@mobtakronio/capskit-http-express` |
| HTTP adapter (Hono) | `@mobtakronio/capskit-http-hono` |
| WS adapter (Socket.io) | `@mobtakronio/capskit-ws-socketio` |
| Database (Drizzle) | `@mobtakronio/capskit-drizzle` |
| Caching (Redis, SQLite, Memory) | `@mobtakronio/capskit-cache` |

---

## 14. What Gets Deleted

| Delete | Reason |
|---|---|
| `src/.cap/` directories | Replaced by `caps/`, `rules/`, `helpers/`, `repository/` |
| `src/capsules/builtin.ts` | Replaced by auto-loading built-in capsule directories |
| `CapsuleRegistry` type | Replaced by `CapsuleDefinition` |
| `CapClass` type | No classes. Functions only. |
| `wrapCapHandler()` | No class methods to wrap |
| `convertRegistryToManifest()` class logic | No classes to instantiate |
| `validateCapClass()` | No classes to validate |
| `detectCapsuleFormat()` + priority chain | One format only. No legacy detection |
| `cache/` module | Moved to `@mobtakronio/capskit-cache` |
| `capsules/drizzle/` | Moved to `@mobtakronio/capskit-drizzle` |
| `capsules/calculator/` | Moved to `@mobtakronio/capskit-calculator` |
| All `manifest.ts` legacy format support | No legacy in phase 1 |
| `traitHandlers` config + adapter trait processing | Replaced by hook caps |
| `[cap: string]: any` patterns | Type safety restored |
| All `.cap/` hidden directories | Use `caps/` (visible, primary content) |
| Event subscriptions in KernelState | Moved to events capsule |
| `emit` method on CapsKit class | Delegated to events capsule via `capskit.call('events.emit')` |

---

## 15. Cap File Size Limit — ENFORCED

**Hard limit: 200 lines per `.cap.ts` file.**

Why 200: A cap is ONE capability — orchestration of rules, helpers, repos. If you're writing 200+ lines of orchestration, you're inlining business logic. Business logic belongs in `.rule.ts`, `.helper.ts`, or `.repository.ts`.

**Enforcement:**
- **Lint rule:** `max-cap-lines` — errors on `.cap.ts` files exceeding 200 lines
- **Kernel validation at boot:** warns on oversized cap files

**What to do when a cap exceeds 200 lines:**
1. Inline validation → extract to `.rule.ts`
2. Inline computation → extract to `.helper.ts`
3. Inline DB queries → extract to `.repository.ts`
4. If genuinely 200+ lines of orchestration → split into two caps

---

## 16. Implementation Phases

### Phase 1: Core Types + Capsule Loader

**Goal:** The kernel can discover, load, and validate capsules in the new format.

| Task | Description |
|---|---|
| Define new types | `CapsuleDefinition`, `CapMeta`, `CapFile`, `CapInput`, `CapContext`, `HookCap` |
| Implement `filesystem.repository.ts` | Directory scanning, file reading |
| Implement `discover-caps.helper.ts` | Scan `caps/` dir for `.cap.ts` files, import meta + handler |
| Implement `validate-cap-meta.rule.ts` | Validate CapMeta shape |
| Implement `validate-deps-graph.rule.ts` | Validate dependency graph |
| Implement `detect-cycle.rule.ts` | Detect circular dependencies |
| Delete `CapsuleRegistry`, `CapClass`, `detectCapsuleFormat` | Remove all legacy types and functions |

### Phase 2: Kernel Caps + Execution Engine

**Goal:** The kernel boots and executes actions through the hooks pipeline.

| Task | Description |
|---|---|
| Implement `boot.cap.ts` | Boot sequence: load built-ins, discover user capsules, validate, wire |
| Implement `call.cap.ts` | Cap execution with hooks pipeline |
| Implement `build-hooks-pipeline.helper.ts` | Chain hooks before action handler |
| Implement `use.cap.ts` | Proxy-based capsule access |
| Implement `shutdown.cap.ts` | Graceful shutdown |
| Implement `register.cap.ts` | Runtime capsule registration |
| Delete `wrapCapHandler`, `convertRegistryToManifest` class logic | Remove old loader code |
| Delete `.cap/` directories in kernel | Replace with proper capsule structure |

### Phase 3: Events Capsule

**Goal:** Event bus as its own capsule, replacing kernel-embedded event logic.

| Task | Description |
|---|---|
| Implement `events/capsule.ts` | Capsule definition with boot that builds subscription map |
| Implement `emit.cap.ts` | Publish event, match subscribers, dispatch |
| Implement `subscribe.cap.ts` | Runtime subscription |
| Implement `unsubscribe.cap.ts` | Runtime unsubscription |
| Implement `list-subscriptions.cap.ts` | Introspection |
| Implement `match-event-pattern.helper.ts` | Wildcard pattern matching |
| Implement `build-subscription-map.helper.ts` | CapMeta → subscription map |
| Move `ctx.emit` delegate | Kernel CapContext delegates to `events.emit` |
| Delete event logic from kernel | Remove eventSubscriptions map, direct emit from CapsKit class |

### Phase 4: HTTP + WebSocket Capsules

**Goal:** Route/WS compilation as separate capsules, adapters as external packages.

| Task | Description |
|---|---|
| Implement `http/capsule.ts` | HTTP capsule definition |
| Implement `build-router.cap.ts` | Compile all CapMeta routes → CompiledRoute[] |
| Implement `compile-routes.helper.ts` | Route compilation logic |
| Implement `websocket/capsule.ts` | WS capsule definition |
| Implement `build-websocket.cap.ts` | Compile CapMeta WS events → CompiledEndpoint[] |
| Create `@mobtakronio/capskit-http-elysia` | Elysia adapter (external package) |
| Create `@mobtakronio/capskit-http-express` | Express adapter (external package) |
| Create `@mobtakronio/capskit-ws-socketio` | Socket.io adapter (external package) |
| Delete HTTP capsule from kernel | Move to built-in capsule structure |
| Delete WebSocket capsule from kernel | Move to built-in capsule structure |
| Delete `traitHandlers` processing | Replaced by hook caps |

### Phase 5: System Capsule

**Goal:** Health and introspection as a separate capsule.

| Task | Description |
|---|---|
| Implement `system/capsule.ts` | System capsule definition |
| Implement `health.cap.ts` | Health check |
| Implement `inspect.cap.ts` | Runtime introspection |
| Delete health/inspect from kernel | These are NOT the engine's mission |

### Phase 6: External Packages

**Goal:** Zero runtime dependencies in the kernel package.

| Task | Description |
|---|---|
| Verify `@mobtakronio/capskit-drizzle` is published | Already extracted |
| Verify `@mobtakronio/capskit-cache` is published | Already extracted |
| Move calculator → `@mobtakronio/capskit-calculator` | Follow new capsule structure |
| Verify kernel `package.json` has `dependencies: {}` | Zero runtime deps |

### Phase 7: Lint Rules

**Goal:** Enforce the architecture at development time.

| Task | Description |
|---|---|
| `max-cap-lines` | Error on `.cap.ts` files exceeding 200 lines |
| `no-cap-imports-cap` | Error on `.cap.ts` importing from another `.cap.ts` |
| `no-import-violation` | Error on dependency pyramid violations |
| `require-cap-meta` | Error on `.cap.ts` files missing `meta` export |
| `require-cap-handler` | Error on `.cap.ts` files missing `default` export |
| `no-class-in-cap` | Error on class declarations in `.cap.ts` files |
| `no-index-signature` | Error on `[cap: string]: any` patterns |
| `banned-words` | Error on `utils.ts`, `shared.ts`, `common.ts` file names |

### Phase 8: Documentation

**Goal:** Complete rewrite of all docs.

| Task | Description |
|---|---|
| Rewrite `guide/capsules.md` | New structure, naming conventions, dependency rules |
| Rewrite `guide/traits.md` → `guide/hooks.md` | Hook caps replace traits |
| Rewrite `guide/philosophy.md` | Function-oriented design, one capsule one mission |
| Rewrite `guide/architecture.md` | 5 built-in capsules, zero-dep kernel |
| Rewrite `guide/quick-start.md` | New capsule creation walk-through |
| Rewrite `guide/dependencies.md` | CapsuleDefinition format, auto-discovery |
| Rewrite `guide/testing.md` | Test pure functions, mock context for caps |
| Create `guide/conventions.md` | File suffix reference, dependency pyramid, graduation rule |
| Create `guide/built-in-capsules.md` | Document all 5 built-in capsules |
| Delete `guide/migration/` | No legacy, no migration |
| Delete `guide/loader.md` | Auto-discovery, no format detection |
| Update `guide/caps.md` | Cap handler signature, cap file format |
| Update `guide/hooks.md` | Hook caps replace legacy hooks |
| Update `guide/events.md` | Events capsule, event subscriptions in cap meta |
| Update `guide/errors.md` | Error file conventions |

---

## 17. Acceptance Criteria

The refactor is complete when ALL of the following are true:

1. **No CapClass exists** — `grep -r "class.*Cap\\b" src/` returns zero results
2. **No `[cap: string]: any` exists** — `grep -r "\\[cap.*string\\]" src/` returns zero results
3. **No `.cap/` directories exist** — only `caps/` directories
4. **Every `.cap.ts` file exports `meta` and `default`** — kernel validates at boot
5. **No `.cap.ts` file exceeds 200 lines** — lint rule passes
6. **No `.cap.ts` imports from another `.cap.ts`** — lint rule passes
7. **No dependency pyramid violations** — `.rule.ts` never imports `.repository.ts`, etc.
8. **Kernel `package.json` has zero runtime dependencies** — `dependencies: {}`
9. **Every built-in capsule follows the same structure** — kernel, events, http, ws, system
10. **Kernel capsule has exactly 5 caps** — boot, call, register, use, shutdown (no emit, no health, no buildRouter)
11. **Events capsule owns all event logic** — kernel delegates ctx.emit to events.emit
12. **HTTP capsule owns route compilation** — buildRouter is a cap in the http capsule
13. **System capsule owns introspection** — health and inspect are in system capsule
14. **`detectCapsuleFormat()` does not exist** — one format, auto-discovery only
15. **`traitHandlers` config does not exist** — replaced by hook caps
16. **All tests pass** — no behavioral regression
17. **Documentation fully rewritten** — no references to legacy patterns
18. **No `manifest.ts` support** — `CapsuleDefinition` + `.cap.ts` is the only format
19. **No `utils.ts`, `shared.ts`, `common.ts`** — verified by lint
20. **`ctx.emit` delegates to events capsule** — not implemented in kernel

---

## 18. What the Developer Must NEVER Do

| ❌ Never | Why |
|---|---|
| Put business logic in `.cap.ts` inline (beyond trivial 2-3 lines) | Cap is orchestrator, not implementor |
| Import from another `.cap.ts` | Caps communicate via events/invoke |
| Put I/O in `.rule.ts` or `.helper.ts` | Rules/helpers are pure — no `ctx.deps` |
| Use `class` syntax in `.cap.ts` | Functions only, no classes |
| Add runtime dependencies to kernel package.json | Zero-dep kernel |
| Create `.cap/` hidden directories | Use `caps/` — visible, primary content |
| Create `utils.ts`, `shared.ts`, `common.ts` | Banned vague names — use specific suffixes |
| Support legacy `manifest.ts` format | No legacy in phase 1 |
| Process traits in HTTP adapter | Hook caps handle this transport-agnostically |
| Make the kernel a god capsule | One capsule = one mission. Engine only. |
| Put event dispatch in the kernel | Events capsule owns pub/sub |
| Put health/inspect in the kernel | System capsule owns introspection |
| Put route compilation in the kernel | HTTP capsule owns route compilation |
| Mix capsule missions | Each capsule has ONE job |