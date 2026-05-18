# CapsKit Developer Contract

> **This is the only document you need to build capsules. Follow every rule.**
> When in doubt, see §When In Doubt at the bottom.

---

## ⛔ HARD RULES — Violating Any of These Breaks the Project

| # | Rule | Why |
|---|---|---|
| 1 | **Caps NEVER import from other `.cap.ts` files** | Use `ctx.invoke()`, `ctx.emit()`, or `ctx.tell()` |
| 2 | **No pyramid violations** — foundation layers never import from layers above | Types/errors/constants import nothing above. Repos import only types/errors/constants. |
| 3 | **No `utils.ts`, `shared.ts`, `common.ts`, `helpers/utils/` directories** | Use the suffix convention: `.helper.ts`, `.rule.ts`, `.repository.ts` |
| 4 | **`.cap.ts` files must not exceed 200 lines** | Caps orchestrate, not implement. Extract when exceeding. |
| 5 | **Errors extend built-in classes** | Never throw raw `Error`. Extend `ValidationError`, `NotFoundError`, `AuthorizationError`, `DependencyError`, or `InternalError`. |
| 6 | **Event names are past-tense** | `order.created` ✅ — `createOrder` ❌ |
| 7 | **All I/O in `.repository.ts` only** | No DB calls, HTTP requests, or file reads in caps, rules, helpers, or types. |
| 8 | **`.helper.ts` is pure** — no side effects, no `ctx`, no I/O | Input → output. That's it. |
| 9 | **`.rule.ts` returns boolean or throws** — no I/O, no `ctx` | Constraint check. Not a service. |
| 10 | **`capsule.ts` declares name, deps, boot only** | No cap references (auto-discovered). No business logic. No handlers. |

---

## 1. What is a Capsule?

A **capsule** is a self-contained directory with one **capsule.ts** and a **caps/** directory of executable capabilities. The kernel auto-discovers everything — you just declare structure.

```
5-step capsule creation:
1. mkdir -p capsules/orders/caps capsules/orders/types
2. Write capsules/orders/capsule.ts           → name + deps
3. Write capsules/orders/caps/create.cap.ts  → meta + handler
4. Wire into platform                        → capsuleDirs: ['./capsules']
5. Start                                     → POST /orders is live
```

---

## 2. Directory Structure

```
capsules/orders/
├── capsule.ts                          # REQUIRED — name, deps, boot
├── types/
│   └── order.type.ts                   # Interfaces, enums, type aliases
├── errors.ts                           # Error classes, error constants
├── constants.ts                        # Runtime-invariant values (as const)
├── repository/
│   └── order.repository.ts             # DB queries, external API calls
├── rules/
│   └── can-cancel.rule.ts              # Boolean constraint or throws
├── helpers/
│   └── calculate-total.helper.ts       # Pure computation: input → output
└── caps/                               # REQUIRED — auto-discovered
    ├── create-order.cap.ts
    ├── cancel-order.cap.ts
    └── list-orders.cap.ts
```

**Only `capsule.ts` and `caps/` are required.** Create `types/`, `errors.ts`, `rules/`, etc. only when you need them.

---

## 3. Suffix Reference & Import Pyramid

```
        .cap.ts              ← orchestrates everything, imports ALL below
       ┌──┼──────────┐
.rule  .helper  .repository  ← shared logic, import types/errors/constants only
       └──┼──────────┘
  .type.ts  .error.ts  .constant.ts   ← foundation: import each other ONLY
```

| Suffix | What goes here | Imports |
|---|---|---|
| `.type.ts` | Interfaces, enums, type aliases | `.type`, `.error`, `.constant` only |
| `errors.ts` | Error classes, error message constants | `.type`, `.error`, `.constant` only |
| `constants.ts` | `as const` values | `.type`, `.error`, `.constant` only |
| `.repository.ts` | DB queries, API calls, cache access | `.type`, `.error`, `.constant` only |
| `.rule.ts` | Constraint: returns boolean or throws | `.type`, `.error`, `.constant`, `.helper` |
| `.helper.ts` | Pure computation: input → output | `.type`, `.error`, `.constant` only |
| `.cap.ts` | Meta + handler (entry point) | ALL layers below + `@mobtakronio/capskit` |

### ❌ WRONG vs ✅ RIGHT

```
❌  .helper.ts imports from .repository.ts     → I/O in a pure function
✅  .helper.ts imports from .type.ts only      → pure function uses types

❌  .type.ts imports from .helper.ts           → foundation imports logic
✅  .helper.ts imports from .type.ts           → logic uses types

❌  cap-a.cap.ts imports from cap-b.cap.ts     → cap-to-cap coupling
✅  cap-a.cap.ts uses ctx.invoke('capsule.cap-b', ...) → kernel-mediated call

❌  helpers/utils.ts                            → banned file name
✅  helpers/calculate-total.helper.ts           → follows suffix convention
```

---

## 4. capsule.ts — Declaration

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
  hooks: {
    pre: [
      { name: 'require-auth' },                                    // ALL caps in capsule
      { name: 'validate-input', caps: ['create-order', 'update-order'] },  // specific caps
    ],
    post: [
      { name: 'audit-log' },
    ],
  },
} satisfies CapsuleDefinition;
```

| Field | Type | Required | What goes here |
|---|---|---|---|
| `name` | `string` | **Yes** | Unique capsule identifier |
| `dependencies` | `string[]` | No | Other capsule names this capsule needs |
| `boot.init` | `(ctx) => Promise<void>` | No | Lifecycle hook run at boot |
| `hooks.pre` | `HookRef[]` | No | Hooks that run before caps |
| `hooks.post` | `HookRef[]` | No | Hooks that run after caps |

```
❌  capsule.ts contains cap handlers or business logic
✅  capsule.ts contains name, deps, boot hooks, and capsule-level hooks only
```

---

## 5. .cap.ts — The Cap File

Every `.cap.ts` exports **two things**: `meta` and `default` handler.

```ts
// capsules/orders/caps/create-order.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';
import { OrderInput } from '../types/order.type';
import { ORDER_STATUS } from '../constants';
import { ORDER_ERRORS } from '../errors';
import { orderRepository } from '../repository/order.repository';
import { calculateTotal } from '../helpers/calculate-total.helper';
import { canCreate } from '../rules/can-create.rule';

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
  const { items } = input.body;
  const total = calculateTotal(items, input.body.discount);
  const order = await orderRepository.create(ctx.deps.database, {
    items, total, status: ORDER_STATUS.PENDING,
  });
  ctx.emit('order.created', { orderId: order.id });
  return { order };
}
```

### CapMeta Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | **Yes** | Unique within capsule |
| `kind` | `'action' \| 'hook'` | **Yes** | Action or hook |
| `routes` | `CapRoute[]` | No | `{ method, path, cap }` |
| `events.publishes` | `string[]` | No | Events emitted |
| `events.subscribes` | `CapEventSubscription[]` | No | `{ event, cap }` |
| `hooks` | `{ pre?: string[], post?: string[] }` | No | Hook names to run before/after |
| `inputSchema` | JSON Schema | No | Input validation |
| `outputSchema` | JSON Schema | No | Output validation |

### CapInput & CapContext

```ts
interface CapInput {
  body: any;                        // Validated payload
  params?: Record<string, string>;  // Route parameters (:id etc.)
  query?: Record<string, string>;   // Query string
  headers?: Record<string, string>; // Request headers
}

interface CapContext {
  deps: Record<string, any>;                          // Injected dependencies
  emit: (event: string, data: any) => void;           // Publish event
  invoke: (capPath: string, payload: any) => Promise<any>;  // RPC (wait)
  tell: (capPath: string, payload: any) => void;      // Fire-and-forget
  use: <T = any>(capsuleName: string) => T;            // Capsule proxy
  user?: any;                                         // Set by auth hooks
}
```

---

## 6. Cross-Cap Communication

```
❌  import { chargePayment } from '../../payments/caps/charge.cap';
✅  const result = await ctx.invoke('payments.charge', { body: { amount } });
```

Three mechanisms:

| Method | Use When | Waits? |
|---|---|---|
| `ctx.invoke('capsule.cap', payload)` | Need the result | Yes |
| `ctx.tell('capsule.cap', payload)` | Fire-and-forget | No |
| `ctx.emit('event.name', data)` | Broadcast to subscribers | No |

Cap path format: `capsule-name.cap-name` (e.g., `orders.create-order`).

---

## 7. Hooks — Cross-Cutting Logic

```ts
// Hook cap (kind: 'hook')
// capsules/security/caps/require-auth.cap.ts
import { CapInput, CapContext, CapMeta, AuthorizationError } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'require-auth',
  kind: 'hook',
};

export default async function requireAuth(input: CapInput, ctx: CapContext) {
  const token = input.headers?.authorization?.replace('Bearer ', '');
  if (!token) throw new AuthorizationError('Authentication required');
  ctx.user = decodeJWT(token);
}
```

Apply hooks in two places:

```ts
// Per-cap (in .cap.ts meta):
hooks: { pre: ['require-auth', 'require-admin-role'], post: ['audit-log'] }

// Capsule-level (in capsule.ts — applies to ALL caps unless filtered):
hooks: {
  pre: [{ name: 'require-auth' }],
  post: [{ name: 'audit-log', caps: ['create-order'] }],
}
```

Merge order: **capsule hooks first, then cap-level hooks.**

```
❌  Copy-pasting auth logic into every cap handler
✅  Write a hook cap once, declare it in capsule.ts or meta.hooks
```

---

## 8. Events — Pub/Sub

```ts
// Publish (in any cap):
ctx.emit('order.created', { orderId: order.id });

// Subscribe (in CapMeta):
events: { subscribes: [{ event: 'order.created', cap: 'send-confirmation' }] }

// Wildcard:
events: { subscribes: [{ event: 'order.*', cap: 'log-order-event' }] }
```

```
❌  ctx.emit('createOrder', data)           → not past-tense
✅  ctx.emit('order.created', data)         → past-tense event name
```

---

## 9. Errors & Constants

```ts
// capsules/orders/errors.ts
import { NotFoundError, ValidationError } from '@mobtakronio/capskit';

export const ORDER_ERRORS = {
  EMPTY_ITEMS: 'Order must contain at least one item',
  ALREADY_CANCELLED: 'Order is already cancelled',
} as const;

export class OrderNotFoundError extends NotFoundError {
  constructor(orderId: string) { super(`Order ${orderId} not found`); }
}
```

| Built-in Error | HTTP | Use When |
|---|---|---|
| `ValidationError` | 400 | Input failed schema or business rule |
| `NotFoundError` | 404 | Resource doesn't exist |
| `AuthorizationError` | 403 | Caller lacks permissions |
| `DependencyError` | 500/503 | Required dependency missing |
| `InternalError` | 500 | Unexpected internal failure |

```ts
// capsules/orders/constants.ts
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  SHIPPED: 'shipped',
} as const;
```

```
❌  throw new Error('Something went wrong')
✅  throw new InternalError('Database connection failed')

❌  export const STATUS = { PENDING: 'pending' }    → missing as const
✅  export const ORDER_STATUS = { PENDING: 'pending' } as const
```

---

## 10. Repository — I/O Boundary

```ts
// capsules/orders/repository/order.repository.ts
import { Order, OrderInput } from '../types/order.type';

export const orderRepository = {
  async create(db: any, input: OrderInput): Promise<Order> {
    return db.orders.create({ data: input });
  },
  async findById(db: any, id: string): Promise<Order | null> {
    return db.orders.findUnique({ where: { id } });
  },
};
```

```
❌  Writing DB queries directly inside a .cap.ts handler
✅  Extracting to .repository.ts and calling ctx.deps for the DB client

❌  .repository.ts imports from .rule.ts or .helper.ts
✅  .repository.ts imports from .type.ts, .error.ts, .constant.ts only
```

---

## 11. Rules & Helpers

```ts
// capsules/orders/rules/can-cancel.rule.ts
import { Order } from '../types/order.type';

export function canCancel(order: Order): boolean {
  return order.status !== 'shipped' && order.status !== 'cancelled';
}
```

```ts
// capsules/orders/helpers/calculate-total.helper.ts
import { OrderItem } from '../types/order-item.type';

export function calculateTotal(items: OrderItem[], discount?: number): number {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return discount ? Math.max(0, subtotal - discount) : subtotal;
}
```

```
❌  .rule.ts makes DB call or accesses ctx.deps
✅  .rule.ts is a pure boolean check — no I/O, no ctx

❌  .helper.ts has side effects or accesses ctx.deps
✅  .helper.ts is pure: input → output, nothing else
```

---

## 12. Platform Bootstrap

```ts
// index.ts
import { createCapsKitPlatform } from '@mobtakronio/capskit';

async function bootstrap() {
  const platform = await createCapsKitPlatform({
    capsuleDirs: ['./capsules'],
    dependencies: {
      database: createDatabaseConnection(),  // → ctx.deps.database
      'jwt-secret': process.env.JWT_SECRET,  // → ctx.deps['jwt-secret']
    },
    disableBuiltins: [],  // skip specific built-ins (not kernel or system)
  });

  const http = platform.use('http');
  const { routes } = await http.buildRouter();

  const { createServer } = await import('@mobtakronio/capskit-http-elysia');
  await createServer(routes, { port: 3000 });
}

bootstrap();
```

| Config | What |
|---|---|
| `capsuleDirs` | Directories to scan for `capsule.ts` files |
| `dependencies` | Values injected into `ctx.deps` |
| `disableBuiltins` | Built-in capsules to skip (kernel & system cannot be disabled) |

**Built-in capsules** (auto-loaded, zero runtime deps):

| Capsule | Mission | Key Caps |
|---|---|---|
| **kernel** | Engine | `boot`, `call`, `register`, `use`, `shutdown` |
| **events** | Pub/sub | `emit`, `subscribe`, `unsubscribe`, `list-subscriptions` |
| **http** | Routes | `build-router` |
| **websocket** | WS | `build-websocket` |
| **system** | Introspection | `health`, `inspect` |

---

## 13. The Graduation Rule

```
❌  Creating types/, rules/, helpers/, repository/ for your first cap
✅  Writing logic inline in .cap.ts until a SECOND cap needs it
```

1. **First cap** — write logic inline. No premature extraction.
2. **Second cap** needs the same logic → graduate it:
   - Boolean check / constraint → `.rule.ts`
   - Pure computation → `.helper.ts`
   - DB query / I/O → `.repository.ts`
3. **Never pre-extract.** Wait until the need is proven.

---

## 14. Testing

```ts
// Mock context helper
export function createMockContext(overrides: Partial<CapContext> = {}): CapContext {
  return {
    deps: { database: {} },
    emit: () => {},
    invoke: async () => ({}),
    tell: () => {},
    use: () => ({}) as any,
    ...overrides,
  };
}

// Cap test
test('creates order and emits event', async () => {
  const emitted: any[] = [];
  const ctx = createMockContext({ emit: (e, d) => emitted.push({ e, d }) });
  const result = await createOrder({ body: { items: [{ price: 10, quantity: 2 }] } }, ctx);
  expect(result.order).toBeDefined();
  expect(emitted[0]).toEqual({ e: 'order.created', d: { orderId: '1' } });
});

// Helper test (pure, no mocking)
test('calculates total with discount', () => {
  expect(calculateTotal([{ price: 100, quantity: 1 }], 20)).toBe(80);
});

// Rule test (pure, no mocking)
test('cannot cancel shipped order', () => {
  expect(canCancel({ status: 'shipped' } as any)).toBe(false);
});
```

---

## 🧭 When In Doubt

| If you're thinking... | Do this instead... |
|---|---|
| "Should I extract this helper/rule now?" | No. Write it inline in `.cap.ts`. Graduate only when a second cap needs it. |
| "Can this cap call that cap directly?" | No. Use `ctx.invoke()`, `ctx.emit()`, or `ctx.tell()`. Never import another `.cap.ts`. |
| "Where does this DB query go?" | `.repository.ts`. Nowhere else. |
| "Can I add a `utils.ts` for shared code?" | No. Use the suffix convention: `.helper.ts`, `.rule.ts`, `.type.ts`. |
| "What if my `.cap.ts` exceeds 200 lines?" | Extract to `.repository.ts` (I/O), `.rule.ts` (constraint), or `.helper.ts` (pure logic). |
| "Can `.type.ts` import from `.helper.ts`?" | No. Foundation layers import nothing from above. |
| "Can `.repository.ts` import from `.rule.ts`?" | No. Repository imports from `.type`, `.error`, `.constant` only. |
| "Should I use a class for this cap?" | No. Caps are functions, not classes. |
| "How do I share state between caps?" | Use `ctx.emit()` → subscribe in the other cap. Or use `ctx.deps` for shared services. |
| "What if I need auth on all caps in a capsule?" | Add capsule-level hooks in `capsule.ts` → `hooks: { pre: [{ name: 'require-auth' }] }`. |
| "What error class should I throw?" | Extend `ValidationError` (400), `NotFoundError` (404), `AuthorizationError` (403), or `InternalError` (500). Never raw `Error`. |
| "Can I put business logic in `capsule.ts`?" | No. `capsule.ts` is name + deps + boot hooks only. Logic goes in `.cap.ts` and graduates to rules/helpers/repositories. |
| "My cap needs data from another capsule" | Use `ctx.invoke('other-capsule.cap-name', payload)` — never import the other capsule's files. |

---

## ⛔ HARD RULES — Read These Again Before Writing Any Code

1. **Caps NEVER import from other `.cap.ts` files.** Use `ctx.invoke` / `ctx.emit` / `ctx.tell`.
2. **No pyramid violations.** `.type`/`.error`/`.constant` import each other only.
3. **No `utils.ts`, `shared.ts`, `common.ts`.** Use `.helper.ts`, `.rule.ts`, `.repository.ts`.
4. **`.cap.ts` max 200 lines.** Extract when exceeding.
5. **Errors extend built-in classes.** Never throw raw `Error`.
6. **Event names are past-tense.** `order.created` not `createOrder`.
7. **All I/O in `.repository.ts` only.** Never in caps, rules, helpers, or types.
8. **`.helper.ts` is pure.** No side effects, no `ctx`, no I/O.
9. **`.rule.ts` returns boolean or throws.** No I/O, no `ctx`.
10. **`capsule.ts` declares name, deps, boot only.** No cap references. No business logic.

---

## ✅ Pre-Ship Checklist

- [ ] `capsule.ts` exists with `name` and `satisfies CapsuleDefinition`
- [ ] Every `.cap.ts` exports `meta` (with `name` and `kind`) AND `default` handler
- [ ] No `.cap.ts` imports from another `.cap.ts`
- [ ] No `.cap.ts` exceeds 200 lines
- [ ] No pyramid violations (foundation layers don't import from above)
- [ ] No `utils.ts`, `shared.ts`, or `common.ts` files
- [ ] I/O only in `.repository.ts` files
- [ ] Pure logic in `.helper.ts`, constraints in `.rule.ts`
- [ ] Errors extend built-in classes (`NotFoundError`, `ValidationError`, etc.)
- [ ] Constants use `as const`
- [ ] Event names are past-tense (`order.created`)
- [ ] Cross-cap calls use `ctx.invoke` / `ctx.emit` / `ctx.tell`
- [ ] `inputSchema` declared on caps that accept input
- [ ] Capsule-level hooks defined in `capsule.ts` instead of repeated per cap
- [ ] Dependencies declared, no circular deps