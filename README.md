# CapsKit

**The Universal Capability Kernel.** Package your business logic into pure, swappable caps that run identically via HTTP, WebSocket, CLI, or internal routines.

[![npm version](https://img.shields.io/npm/v/@mobtakronio/capskit.svg)](https://www.npmjs.com/package/@mobtakronio/capskit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why CapsKit?

Traditional architectures tightly couple business logic to the transport layer. CapsKit implements the **Capability Architecture** pattern:

- **Transport Agnostic** — Write pure logic once, run it via HTTP, WebSocket, CLI, or internal calls.
- **Declarative Metadata** — Routes, events, and schemas defined in `meta`, separate from logic.
- **Auto-Discovery** — Drop `.cap.ts` files into a capsule directory; the kernel finds them.
- **Framework Agnostic** — Plug in any framework through transport adapters.

## Quick Start

```bash
npm install @mobtakronio/capskit @mobtakronio/capskit-elysia
```

### 1. Create a Capsule

```ts
// capsules/orders/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: [],
} satisfies CapsuleDefinition;
```

### 2. Write a Cap

```ts
// capsules/orders/caps/sum.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'sum',
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

### 3. Boot the Kernel

```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { createElysiaAdapter } from '@mobtakronio/capskit-elysia';

const { capskit } = await createCapsKit({
  capsuleDirs: ['./capsules'],
});

const { app, sockets, shutdown } = await createElysiaAdapter(capskit, {
  http: true,
  websocket: true,
});

app.ws(sockets).listen(3000);
// POST /sum is live. WebSocket at /ws/capskit.
```

### 4. Invoke Internally

```ts
const orders = capskit.use('orders');
const { result } = await orders.sum({ a: 15, b: 30 });
```

## Packages

| Package | Description |
|---|---|
| [`@mobtakronio/capskit`](./packages/capskit) | Core kernel and built-in capsules |
| [`@mobtakronio/capskit-elysia`](./packages/elysia) | Elysia HTTP + WebSocket adapter |
| [`@mobtakronio/capskit-drizzle`](./packages/drizzle) | Drizzle ORM database capsule |
| [`@mobtakronio/capskit-client`](./packages/client) | Typed client SDK with offline support |
| [`@mobtakronio/capskit-react`](./packages/react) | React hooks (`useAction`, `useSubscription`) |
| [`@mobtakronio/capskit-vue`](./packages/vue) | Vue 3 composables |
| [`@mobtakronio/capskit-cache`](./packages/cache) | Caching capsule |
| [`@mobtakronio/capskit-testing`](./packages/testing) | Testing utilities |

## Documentation

Full guide, API reference, and examples: **[capskit.dev](https://capskit.dev)**

## Monorepo Commands

```bash
npm install          # Install all packages
npm run build        # Build everything
npm run test         # Run all tests
npm run docs:dev     # Start docs dev server
```

## License

MIT © 2026 CapsKit Team / MobtakronIO
