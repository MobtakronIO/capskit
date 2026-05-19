# Quick Start

Initialize a CapsKit application in under a minute.

---

## Installation

```bash
npm install @mobtakronio/capskit elysia
```

---

## 1. Create Your Capsule Directory

```bash
mkdir -p capsules/orders/caps
mkdir -p capsules/orders/types
mkdir -p capsules/orders/helpers
```

---

## 2. Write the capsule.ts

```ts
// capsules/orders/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: [],
} satisfies CapsuleDefinition;
```

---

## 3. Create Your First Cap

```ts
// capsules/orders/caps/sum.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'sum',
  kind: 'action',
  routes: [{ method: 'POST', path: '/sum', cap: 'sum' }],
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' },
    },
    required: ['a', 'b'],
  },
};

export default async function sum(input: CapInput, _ctx: CapContext) {
  const { a, b } = input.body;
  return { result: a + b };
}
```

Every `.cap.ts` file exports two things:
- `meta` — the CapMeta (name, kind, routes, schemas)
- `default` — the async handler function

The kernel auto-discovers `.cap.ts` files from the `caps/` directory. No manual registration needed.

---

## 4. Run the App

```ts
// index.ts
import { createCapsKit } from '@mobtakronio/capskit';
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';

async function bootstrap() {
  const { capskit } = await createCapsKit({
    capsuleDirs: ['./capsules'],
    dependencies: {
      logger: console,
    },
  });

  const { app, sockets } = await createElysiaAdapter(capskit, {
    http: true,
    websocket: true,
  });

  app.ws(sockets).listen(3000);
  console.log('Server running at http://localhost:3000');
}

bootstrap();
```

That's it. `POST /sum` is live, and WebSocket is available at `/ws/capskit`.

---

## 5. Invoke Capabilities Internally

```ts
const { capskit } = await createCapsKit({ capsuleDirs: ['./capsules'] });

const orders = capskit.use('orders');
const { result } = await orders.sum({ body: { a: 15, b: 30 } });
console.log('Result:', result); // 45
```

---

## API Reference

### `createCapsKit(options)` — High-level (recommended)

Returns `{ capskit, router }` — a full CapsKit instance with a built-in HTTP router.

```ts
interface CreateCapsKitOptions {
  capsuleDirs?: string[];          // Directories to scan for capsule.ts
  dependencies?: Record<string, unknown>;
  warnOnDirectCall?: boolean;      // Warn when capskit.call() is used directly
}
```

### `createCapsKitPlatform()` — Low-level

Returns raw handlers: `{ state, boot, call, use, register, shutdown, describe, rpc }`. Use when you need fine-grained control over the boot lifecycle or are building a custom adapter.

```ts
const platform = await createCapsKitPlatform();
await platform.boot({ body: { capsuleDirs: ['./capsules'] } }, ctx);
```

---

## Client-Side Quick Start

Once your server is running, connect to it from the frontend using the typed client SDK.

### Install the Client Package

```bash
npm install @mobtakronio/capskit-client
```

### Create a Typed Client

```ts
import { createCapsKitClient } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto', // HTTP for calls, WebSocket for subscriptions
});
```

### Call a Cap

```ts
const result = await client.call<{ result: number }>('orders.sum', { a: 15, b: 30 });
console.log(result.result); // 45
```

Or use the typed capsule proxy:

```ts
const orders = client.use('orders');
const result = await orders.sum({ a: 15, b: 30 });
```

### Subscribe to Events

```ts
const unsub = client.subscribe('order.*', (data, event) => {
  console.log(`Event ${event}:`, data);
});

// Later:
unsub();
```

### Generate Types from the Server

```bash
npx capskit generate --url http://localhost:3000 --output src/capskit-types.ts
```

This generates typed `call()` and `use()` overloads from your server's manifest. See [Type Generator](./type-generator.md) for details.

### React Integration

```tsx
import { CapsKitProvider, useAction, useSubscription } from '@mobtakronio/capskit-react';

function App() {
  return (
    <CapsKitProvider client={client}>
      <OrderList />
    </CapsKitProvider>
  );
}

function OrderList() {
  const { data, loading, error } = useAction('orders.list');
  const { latest } = useSubscription('order.created');

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <div>{JSON.stringify(data)}</div>;
}
```

### Vue Integration

```ts
// In your <script setup> block:
import { provideCapsKit, useAction, useSubscription } from '@mobtakronio/capskit-vue';

provideCapsKit(client);

const { data, loading, error } = useAction('orders.list', undefined, { immediate: true });
const { latest } = useSubscription('order.created');
```

---

## Next Steps

- [Capsules](./capsules.md) — Full capsule structure and file conventions
- [Dependencies](./dependencies.md) — CapsuleDefinition and auto-discovery
- [Built-in Capsules](./built-in-capsules.md) — All 5 built-in capsules documented
- [Hooks](./hooks.md) — Cross-cutting concerns as caps
- [Client SDK](./client.md) — Full client package documentation
- [React](./react.md) — React hooks and provider
- [Vue](./vue.md) — Vue composables
