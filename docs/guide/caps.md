# Caps

Caps are the executable units of CapsKit. Each cap is a `.cap.ts` file with a `meta` export and a `default` handler function.

---

## Cap Handler Signature

Every cap exports an async function with this signature:

```ts
async function handler(input: CapInput, ctx: CapContext): Promise<any>
```

### CapInput

```ts
interface CapInput {
  body: any;                        // Validated payload
  params?: Record<string, string>;  // Route parameters (HTTP)
  query?: Record<string, string>;   // Query string (HTTP)
  headers?: Record<string, string>; // Request headers
}
```

- `body`: The main payload, already validated against `inputSchema`.
- `params`: Route parameters populated by the HTTP adapter.
- `query`: Query string parameters.
- `headers`: Request headers (useful for auth hooks).

### CapContext

```ts
interface CapContext {
  deps: Record<string, any>;                    // Injected dependencies
  emit: (event: string, data: any) => void;     // Publish event (delegates to events capsule)
  invoke: (capPath: string, payload: any) => Promise<any>;  // RPC
  tell: (capPath: string, payload: any) => void;            // Fire-and-forget
  use: <T = any>(capsuleName: string) => T;     // Typed capsule proxy
  user?: any;                                   // Set by auth hooks
}
```

---

## The .cap.ts File Format

Every `.cap.ts` file exports two things:

```ts
// capsules/orders/caps/create-order.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';
import { OrderInput } from '../types/order.type';
import { ORDER_STATUS } from '../constants';
import { orderRepository } from '../repository/order.repository';
import { calculateTotal } from '../helpers/calculate-total.helper';

// 1. Meta export — declarative metadata
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

// 2. Default export — the handler function
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

---

## CapMeta Format

```ts
interface CapMeta {
  name: string;                        // Unique cap name within the capsule
  kind: 'action' | 'hook';                // Cap type
  routes?: CapRoute[];                 // HTTP routes
  events?: {
    publishes?: string[];              // Events this cap emits
    subscribes?: CapEventSubscription[]; // Events this cap subscribes to
  };
  hooks?: { pre?: string[]; post?: string[] } | string[]; // Hooks to run before/after this cap
  inputSchema?: Record<string, any>;   // JSON Schema for input validation
  outputSchema?: Record<string, any>;  // JSON Schema for output validation
  description?: string;                // Human-readable description
}
```

### CapRoute

```ts
interface CapRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;     // e.g., '/orders/:id'
  cap: string;      // Cap name (matches meta.name)
}
```

### CapEventSubscription

```ts
interface CapEventSubscription {
  event: string;   // Event name (e.g., 'order.created')
  cap: string;     // Cap name to invoke when event fires
}
```

---

## Input and Output Schemas

Schemas are JSON Schema objects used for runtime validation:

```ts
export const meta: CapMeta = {
  name: 'create-order',
  kind: 'action',
  inputSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            quantity: { type: 'integer' },
          },
          required: ['price', 'quantity'],
        },
      },
      discount: { type: 'number', minimum: 0 },
    },
    required: ['items'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      order: { type: 'object' },
    },
    required: ['order'],
  },
};
```

Invalid input throws `ValidationError` before the handler runs.

---

## Best Practices

1. **Keep caps under 200 lines** — extract to `.rule.ts`, `.helper.ts`, `.repository.ts`.
2. **Never import from another `.cap.ts`** — use `ctx.invoke()` or `ctx.emit()`.
3. **Declare schemas** — they power validation, documentation, and IDE support.
4. **One cap = one capability** — if a cap does too much, split it.
5. **Use hooks for cross-cutting concerns** — auth, logging, rate limiting.

---

## Next Steps

- [Capsules](./capsules.md) — Full capsule structure
- [Hooks](./hooks.md) — Cross-cutting concerns as caps
- [Events](./events.md) — Event-driven communication
