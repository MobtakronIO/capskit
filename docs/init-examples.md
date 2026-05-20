# CapsKit Initialization

## The Simplest Possible App

```ts
// index.ts
import { createCapsKitPlatform } from '@mobtakronio/capskit';

const platform = await createCapsKitPlatform({
  capsuleDirs: ['./caps'],
});

// Call any cap directly
const result = await platform.call('orders.create-order', {
  body: { items: [{ productId: 'p1', quantity: 2 }] },
});
```

That's it. One config line. The kernel:
1. Scans `./caps` for `.cap.ts` files
2. Validates metadata, resolves dependencies, wires hook caps
3. Returns a ready-to-use platform instance

---

## createCapsKitPlatform Config Reference

```ts
interface CapsKitPlatformConfig {
  /** Directories containing capsule folders. Each subdirectory with capsule.ts is loaded. */
  capsuleDirs?: string[];

  /** Dependency injection — available in every cap via ctx.deps */
  dependencies?: Record<string, unknown>;
}
```

### capsuleDirs

```ts
// Scan a directory — every subfolder with capsule.ts is loaded
await createCapsKitPlatform({
  capsuleDirs: ['./caps'],
});
```

---

## Full Example — Orders App with Auth and HTTP

### Project Structure

```
src/
├── index.ts
├── caps/
│   ├── orders/
│   │   ├── capsule.ts
│   │   ├── types/
│   │   │   └── order.type.ts
│   │   ├── errors.ts
│   │   ├── constants.ts
│   │   ├── repository/
│   │   │   └── order.repository.ts
│   │   ├── rules/
│   │   │   └── can-cancel.rule.ts
│   │   ├── helpers/
│   │   │   └── calculate-total.helper.ts
│   │   └── caps/
│   │       ├── create-order.cap.ts
│   │       ├── cancel-order.cap.ts
│   │       ├── list-orders.cap.ts
│   │       └── get-order.cap.ts
│   ├── users/
│   │   ├── capsule.ts
│   │   ├── types/
│   │   │   └── user.type.ts
│   │   ├── repository/
│   │   │   └── user.repository.ts
│   │   ├── rules/
│   │   │   ├── is-valid-email.rule.ts
│   │   │   └── is-strong-password.rule.ts
│   │   ├── helpers/
│   │   │   └── hash-password.helper.ts
│   │   └── caps/
│   │       ├── create-user.cap.ts
│   │       ├── authenticate.cap.ts
│   │       └── get-profile.cap.ts
│   └── security/
│       ├── capsule.ts
│       ├── helpers/
│       │   └── decode-jwt.helper.ts
│       ├── rules/
│       │   ├── is-token-expired.rule.ts
│       │   └── has-role.rule.ts
│       └── caps/
│           ├── require-auth.cap.ts
│           └── require-admin.cap.ts
└── adapters/
    └── http.ts              # HTTP adapter setup (separate from kernel)
```

### Capsule Definitions

```ts
// caps/orders/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: ['database'],
  boot: {
    init: async ({ deps }) => {
      await deps.database.orders.ensureIndex('userId');
    },
  },
} satisfies CapsuleDefinition;
```

```ts
// caps/users/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'users',
  dependencies: ['database'],
} satisfies CapsuleDefinition;
```

```ts
// caps/security/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'security',
  dependencies: ['jwt-secret'],
} satisfies CapsuleDefinition;
```

### Cap Examples

```ts
// caps/orders/caps/create-order.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';
import { Order, OrderInput } from '../types/order.type';
import { ORDER_STATUS } from '../constants';
import { orderRepository } from '../repository/order.repository';
import { calculateTotal } from '../helpers/calculate-total.helper';

export const meta: CapMeta = {
  name: 'create-order',
  routes: [
    { method: 'POST', path: '/orders', cap: 'create-order' },
  ],
  hooks: { pre: ['require-auth'] },
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
};

export default async function createOrder(input: CapInput, ctx: CapContext) {
  const items = input.body.items;
  const total = calculateTotal(items, input.body.discount);
  const order = await orderRepository.create(ctx.deps.database, {
    items,
    total,
    status: ORDER_STATUS.PENDING,
    userId: ctx.user.id,
  });
  ctx.emit('order.created', { orderId: order.id });
  return { order };
}
```

```ts
// caps/security/caps/require-auth.cap.ts
import { CapInput, CapContext, CapMeta, AuthorizationError } from '@mobtakronio/capskit';
import { decodeJWT } from '../helpers/decode-jwt.helper';
import { isTokenExpired } from '../rules/is-token-expired.rule';

export const meta: CapMeta = {
  name: 'require-auth',
};

export default async function requireAuth(input: CapInput, ctx: CapContext) {
  const token = input.headers?.authorization?.replace('Bearer ', '');
  if (!token) throw new AuthorizationError('Authentication required');
  const payload = decodeJWT(token, ctx.deps['jwt-secret']);
  if (isTokenExpired(payload)) throw new AuthorizationError('Token expired');
  ctx.user = payload;
}
```

### Initialization

```ts
// index.ts
import { createCapsKitPlatform } from '@mobtakronio/capskit';

async function bootstrap() {
  const platform = await createCapsKitPlatform({
    capsuleDirs: ['./caps'],
    dependencies: {
      database: createDatabaseConnection(process.env.DATABASE_URL),
      'jwt-secret': process.env.JWT_SECRET,
    },
  });

  return platform;
}

const platform = await bootstrap();
```

### Using the Platform Instance

```ts
// Direct call — works regardless of transport
const order = await platform.call('orders.create-order', {
  body: { items: [{ productId: 'p1', quantity: 2 }] },
  headers: { authorization: 'Bearer eyJ...' },
});

// Proxy call — typed, feels like a local module
const orders = platform.use('orders');
const result = await orders.createOrder({
  body: { items: [{ productId: 'p1', quantity: 2 }] },
  headers: { authorization: 'Bearer eyJ...' },
});

// Emit events
platform.emit('user.registered', { userId: 'u123' });

// Inspect the runtime
const info = await platform.call('kernel.inspect', { body: {} });
// → { capsules: ['orders', 'users', 'security'], actions: [...], hooks: [...] }

// Health check
const health = await platform.call('kernel.health', { body: {} });
// → { status: 'healthy', uptime: 12345, capsules: 3 }
```

### Adding HTTP (Separate Package)

HTTP is NOT part of the kernel. It's an external adapter:

```ts
// adapters/http.ts
import { createHttpAdapter } from '@mobtakronio/capskit-http';

export async function startHttpServer(platform: any, port: number = 3000) {
  const adapter = await createHttpAdapter('elysia');
  const server = await adapter(platform, { port });
  console.log(`HTTP server running on port ${port}`);
  return server;
}
```

```ts
// index.ts (with HTTP)
import { createCapsKitPlatform } from '@mobtakronio/capskit';
import { startHttpServer } from './adapters/http';

async function bootstrap() {
  const platform = await createCapsKitPlatform({
    capsuleDirs: ['./caps'],
    dependencies: {
      database: createDatabaseConnection(process.env.DATABASE_URL),
      'jwt-secret': process.env.JWT_SECRET,
    },
  });

  // HTTP is opt-in, not baked into the kernel
  if (process.env.ENABLE_HTTP !== 'false') {
    await startHttpServer(platform, 3000);
  }

  return platform;
}

bootstrap();
```

---

## Minimal Example — No HTTP, Just Logic

CapsKit works without any transport. Call caps directly:

```ts
import { createCapsKitPlatform } from '@mobtakronio/capskit';

const platform = await createCapsKitPlatform({
  capsuleDirs: ['./caps'],
  dependencies: { database: memoryDb },
});

// In a CRON job:
const expiredOrders = await platform.call('orders.list-expired', { body: {} });
for (const order of expiredOrders.orders) {
  await platform.call('orders.cancel-order', { body: { orderId: order.id } });
}
```

No HTTP server. No WebSocket. Just business logic, executed programmatically.

---

## Testing Example

```ts
// caps/orders/caps/cancel-order.cap.ts → tested directly
import { canCancel } from '../rules/can-cancel.rule';
import { ORDER_STATUS } from '../constants';
import { orderRepository } from '../repository/order.repository';

// Test the rule (pure, no mocking needed)
test('canCancel returns false for shipped orders', () => {
  expect(canCancel({ status: ORDER_STATUS.SHIPPED })).toBe(false);
});

// Test the cap (only mock ctx.deps and ctx.emit)
test('cancel-order cancels a pending order', async () => {
  const emit = mock.fn();
  const db = { orders: { findById: mock.fn(() => ({ id: '1', status: 'pending' })) } };

  const result = await cancelOrder(
    { body: { orderId: '1' }, params: {}, query: {}, headers: {} },
    { deps: { database: db }, emit, user: { id: 'u1' } },
  );

  expect(emit).toHaveBeenCalledWith('order.cancelled', { orderId: '1' });
});

// Test the helper (pure, no mocking at all)
test('calculateTotal applies discount', () => {
  expect(calculateTotal([{ price: 100, quantity: 2 }], 50)).toBe(150);
});
```

---

## What the Developer Experience Feels Like

1. **Create a folder** → `mkdir -p caps/orders/caps`
2. **Add capsule.ts** → 5 lines (name + deps)
3. **Add a cap** → one `.cap.ts` file with meta + handler
4. **Run** → `createCapsKitPlatform({ capsuleDirs: ['./caps'] })`
5. **Call** → `platform.call('orders.create-order', { body: {...} })`

No registration. No class instantiation. No format detection. No adapter config for auth. The capsule IS the directory. The cap IS the file. The meta IS in the file. The kernel discovers everything.
