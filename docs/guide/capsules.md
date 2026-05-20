# Capsules

A **Capsule** is the fundamental building block of a CapsKit application. It is a self-contained directory that encapsulates a cohesive set of business capabilities. Every capsule follows the same structure — built-in capsules and user capsules are no different.

---

## Capsule Directory Structure

```
capsules/orders/
├── capsule.ts                          # Capsule declaration (REQUIRED)
├── types/
│   ├── order.type.ts                   # What IS an order
│   ├── order-item.type.ts              # What IS an order item
│   └── order-filter.type.ts            # What IS a filter
├── errors.ts                           # What can GO WRONG
├── constants.ts                        # What NEVER CHANGES
├── repository/
│   ├── order.repository.ts             # How to ACCESS orders (DB queries)
│   └── payment.repository.ts           # How to ACCESS payments (external API)
├── rules/
│   ├── can-cancel.rule.ts              # Constraint: can this order be cancelled?
│   └── has-permission.rule.ts          # Constraint: is this user allowed?
├── helpers/
│   ├── calculate-total.helper.ts       # Computation: items + discount → total
│   └── determine-status.helper.ts      # Computation: current status + event → new status
└── caps/
    ├── create-order.cap.ts             # POST /orders → create order
    ├── cancel-order.cap.ts             # POST /orders/:id/cancel
    ├── list-orders.cap.ts              # GET /orders
    └── ship-orders.cap.ts              # POST /orders/:id/ship
```

### File Suffix Conventions

| Directory | File Suffix | Purpose |
|---|---|---|
| Root | `capsule.ts` | Capsule name, dependencies, boot lifecycle |
| `types/` | `.type.ts` | TypeScript interfaces, type aliases, enums |
| Root | `errors.ts` | Error classes, error message constants |
| Root | `constants.ts` | Runtime-invariant values (status codes, limits) |
| `repository/` | `.repository.ts` | DB queries, external API calls, cache access |
| `rules/` | `.rule.ts` | Constraints — returns boolean or throws |
| `helpers/` | `.helper.ts` | Pure computations — takes input, returns value |
| `caps/` | `.cap.ts` | Cap caps and hook caps |

### The Dependency Pyramid

Imports flow **down only**. No layer may import from a layer above it.

```
     .cap.ts          ← Entry: orchestrates everything
       │
  ┌────┼──────────────────┐
  │    │                  │
.rule.ts  .helper.ts  .repository.ts  ← Shared logic
  │    │                  │
  └────┼──────────────────┘
       │
  .type.ts  .error.ts  .constant.ts   ← Foundation
```

| Layer | Can import from | CANNOT import from |
|---|---|---|
| `.cap.ts` | ALL layers below | Other `.cap.ts` files |
| `.rule.ts` | `.type.ts`, `.error.ts`, `.constant.ts`, `.helper.ts` | `.repository.ts`, `.cap.ts` |
| `.helper.ts` | `.type.ts`, `.error.ts`, `.constant.ts` | `.repository.ts`, `.rule.ts`, `.cap.ts` |
| `.repository.ts` | `.type.ts`, `.error.ts`, `.constant.ts` | `.rule.ts`, `.helper.ts`, `.cap.ts` |
| `.type.ts` / `.error.ts` / `.constant.ts` | Each other only | ALL layers above |

---

## capsule.ts — The Entry Point

The `capsule.ts` file declares the capsule's name, its dependencies, and an optional boot lifecycle.

### Filesystem Capsules (auto-discovered caps)

For capsules that live on disk, the kernel auto-discovers `.cap.ts` files from the `caps/` directory — no manual cap listing needed.

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

### Factory Capsules (inline caps)

For capsules created programmatically (e.g., `@mobtakronio/capskit-drizzle`), include caps inline via the `caps` field. No filesystem directory needed.

```ts
import { CapsuleDefinition, CapsuleCap } from '@mobtakronio/capskit';

const drizzleCaps: CapsuleCap[] = [
  {
    meta: { name: 'query', kind: 'action' },
    handler: async (input, ctx) => {
      const repo = ctx.deps.dependencies.drizzleRepo;
      return repo.query(input.body);
    },
  },
  {
    meta: { name: 'health', kind: 'action' },
    handler: async (_input, ctx) => {
      const repo = ctx.deps.dependencies.drizzleRepo;
      return repo.health();
    },
  },
];

export function createCapsule(config: DrizzleConfig): CapsuleDefinition {
  return {
    name: 'drizzle',
    caps: drizzleCaps,
    boot: {
      init: async ({ deps }) => {
        const db = await createDatabase(config);
        deps.dependencies.drizzle = db;
        deps.dependencies.drizzleRepo = createDrizzleRepository(db);
      },
    },
  };
}
```

**What goes here:** capsule name, dependency declarations, boot lifecycle, inline caps (for factory capsules).
**What does NOT go here:** business logic, handlers (except inline caps for factory capsules).

---

## Types — `.type.ts`

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

**Rule:** A `.type.ts` file exports ONLY TypeScript types, interfaces, and enums. Zero runtime logic. Zero function exports.

---

## Errors

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

**Rule:** Error classes and error message constants only.

---

## Constants

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

**Rule:** Runtime-invariant values only. Use `as const` for literal types.

---

## Repository — `.repository.ts`

```ts
// capsules/orders/repository/order.repository.ts
import { Order, OrderInput, OrderFilter } from '../types/order.type';

export function createOrderRepository(db: any) {
  return {
    async create(input: OrderInput): Promise<Order> {
      return db.orders.create({ data: input });
    },

    async findById(id: string): Promise<Order | null> {
      return db.orders.findUnique({ where: { id } });
    },

    async updateStatus(id: string, status: string): Promise<Order> {
      return db.orders.update({ where: { id }, data: { status } });
    },

    async findWithFilters(filter: OrderFilter): Promise<Order[]> {
      return db.orders.findMany({
        where: {
          ...(filter.status && { status: filter.status }),
        },
      });
    },
  };
}

// Backward-compatible static export
export const orderRepository = {
  create: (db: any, input: OrderInput) => createOrderRepository(db).create(input),
  findById: (db: any, id: string) => createOrderRepository(db).findById(id),
  updateStatus: (db: any, id: string, status: string) => createOrderRepository(db).updateStatus(id, status),
  findWithFilters: (db: any, filter: OrderFilter) => createOrderRepository(db).findWithFilters(filter),
};
```

**Rule:** All I/O goes through repository files. Use the **factory pattern** — `createXxxRepository(db)` returns a bound instance so callers don't pass `db` on every call. Keep a backward-compatible static export for existing code. Repository files can import from `.type.ts` and `.error.ts` only.

---

## Rules — `.rule.ts`

```ts
// capsules/orders/rules/can-cancel.rule.ts
import { Order } from '../types/order.type';

export function canCancel(order: Order): boolean {
  return order.status !== 'shipped' && order.status !== 'cancelled';
}
```

**Rule:** Rules return `boolean` or `throw`. They NEVER perform I/O. They can import from `.type.ts`, `.error.ts`, `.constant.ts`, and `.helper.ts`.

---

## Helpers — `.helper.ts`

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

**Rule:** Helpers are pure functions that take input and return a computed value. No I/O. No `ctx.deps`. They can import from `.type.ts`, `.error.ts`, `.constant.ts`.

---

## Caps — `.cap.ts`

Each `.cap.ts` file exports **two things**: the `meta` (CapMeta) and the `default` handler function.

```ts
// capsules/orders/caps/create-order.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';
import { OrderInput } from '../types/order.type';
import { ORDER_STATUS } from '../constants';
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
  const repo = ctx.deps.dependencies.orderRepo;
  const order = await repo.create({
    items, total, status: ORDER_STATUS.PENDING,
  });
  ctx.emit('order.created', { orderId: order.id });
  return { order };
}
```

**HARD LIMIT: 200 LINES MAXIMUM.** If a `.cap.ts` file exceeds 200 lines, you MUST extract logic into `.rule.ts`, `.helper.ts`, or `.repository.ts` files.

**Rule:** Caps orchestrate — they call rules, helpers, and repositories. They emit events and return results. They do NOT contain business logic, DB queries, or pure computations inline. They can import from ALL other layers. **NEVER import from another `.cap.ts` file.**

---

## The Graduation Rule

Code starts inline in `.cap.ts`. When a second cap needs the same logic, it graduates to the capsule-level:

1. **First cap** uses the logic inline — no extraction needed.
2. **Second cap** needs the same logic — extract to `.rule.ts`, `.helper.ts`, or `.repository.ts`.
3. **Never pre-extract.** Wait until the need is proven.

---

## Banned File Names

These file names are banned across all capsules:

- `utils.ts`
- `shared.ts`
- `common.ts`

Use specific suffixes instead: `.helper.ts`, `.rule.ts`, `.repository.ts`.

---

## Cross-Cap Communication

Caps within the same capsule or across different capsules communicate via:

- **`ctx.invoke(capPath, payload)`** — RPC (request/response)
- **`ctx.emit(event, data)`** — Event-driven (fire-and-forget)

NEVER import from another `.cap.ts` file directly.

---

## Next Steps

- [Hooks](./hooks.md) — Cross-cutting concerns as caps
- [Dependencies](./dependencies.md) — CapsuleDefinition and auto-discovery
- [Conventions](./conventions.md) — File suffix reference and dependency rules
