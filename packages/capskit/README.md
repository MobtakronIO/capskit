# CapsKit 💊

**The Universal Capability Kernel** — Break free from controllers. Package your business logic into pure, swappable capsules that run identically via HTTP, Event Bus, CLI, or internal routines.

[![npm version](https://img.shields.io/npm/v/@mobtakronio/capskit.svg)](https://www.npmjs.com/package/@mobtakronio/capskit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Why CapsKit?

Traditional architectures tightly couple business logic to the transport layer (Controllers/Request objects). This makes it hard to reuse logic in CRON jobs, background workers, or CLIs.

CapsKit implements the **Capability Architecture** pattern:
- **Zero Boundary Logic**: Capsules don't know about HTTP or Frameworks.
- **Declarative Manifests**: Routing, Traits, and Events are defined in simple metadata.
- **Universal Pipelines**: Global Interceptors and Action-level Hooks for tracing, auth, and more.
- **Plugin Architecture**: Any capsule is a plugin — just populate `caps` and register.

## 📦 Installation

```bash
npm install @mobtakronio/capskit elysia
# or
bun add @mobtakronio/capskit elysia
```

## 🛠️ Quick Start

### 1. Define a Capsule

```typescript
// src/capsules/orders/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: ['database'],
  boot: {
    init: async ({ deps }) => {
      // deps.database is available from platform dependencies
    },
  },
} satisfies CapsuleDefinition;
```

```typescript
// src/capsules/orders/caps/list-orders.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'list-orders',
  routes: [{ method: 'GET', path: '/orders', action: 'list-orders' }],
};

export default async function listOrders(_input: CapInput, ctx: CapContext) {
  const repo = ctx.deps.orderRepo;
  const orders = await repo.findWithFilters({ status: 'pending' });
  return { orders };
}
```

### 2. Boot the Kernel

```typescript
import { createCapsKitPlatform } from '@mobtakronio/capskit';
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';
import { Elysia } from 'elysia';

// Create the platform (takes no configuration arguments directly)
const platform = await createCapsKitPlatform();

// Register factory capsules (e.g., database)
platform.registerCapsule(createDrizzleCapsule({
  dialect: 'sqlite',
  connection: './db.sqlite',
}));

// Boot with user capsule directories passed via options
await platform.boot({ body: { capsuleDirs: ['./src/capsules'] } });

// Create the Elysia adapter
const { app } = await createElysiaAdapter(platform, { http: true });

// Start the server
app.listen(3000);
```

### 3. Invoke Capsules

```typescript
// Via Proxy calling chain (recommended)
const { orders: list } = await platform.call.orders['list-orders']({});

// Via ctx.use proxy interface
const orders = platform.use('orders');
const { orders: list2 } = await orders['list-orders']({});

// Via legacy string-based call
const result = await platform.call('orders.list-orders', {});
```

## 🧱 Capsule Patterns

### Filesystem Capsules

Place `capsule.ts` at the root with `.cap.ts` files in `caps/`. The kernel auto-discovers all caps.

### Factory Capsules

For programmatic capsules (databases, cache, etc.), include caps inline:

```ts
const myCaps: CapsuleCap[] = [
  {
    meta: { name: 'query' },
    handler: async (input, ctx) => ctx.deps.myRepo.query(input.body),
  },
];

export function createMyCapsule(config: MyConfig): CapsuleDefinition {
  return {
    name: 'my-capsule',
    caps: myCaps,
    boot: {
      init: async ({ deps }) => {
        deps.myRepo = createMyRepository(await connect(config));
      },
    },
  };
}
```

## 📖 Documentation

Visit [capskit.io](https://capskit.io) (Coming Soon!) or check the `/docs` folder for the full guide.

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
