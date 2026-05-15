# CapsKit 💊

**The Universal Capability Kernel** — Break free from controllers. Package your business logic into pure, swappable caps that run identically via HTTP, Event Bus, CLI, or internal routines.

[![npm version](https://img.shields.io/npm/v/@mobtakronio/capskit.svg)](https://www.npmjs.com/package/@mobtakronio/capskit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Monorepo](https://img.shields.io/badge/monorepo-npm%20workspaces-blue.svg)](#-repository-structure)

## 🚀 Why CapsKit?

Traditional architectures tightly couple business logic to the transport layer (Controllers/Request objects). This makes it hard to reuse logic in CRON jobs, background workers, or CLIs.

CapsKit implements the **Capability Architecture** pattern:
- **Zero Boundary Logic**: Caps don't know about HTTP or Frameworks.
- **Declarative Metadata**: Routing, Events, and Traits are defined in `cap.meta.ts`—separate from business logic.
- **Universal Pipelines**: Global Interceptors and Action-level Hooks for tracing, auth, and more.
- **Framework Agnostic**: Plug in any framework (Elysia, Express, etc.) through transport adapters.

## 🧱 Caps & Capsules

CapsKit organizes logic into two levels:

- **Cap**: The atomic unit—a class (`cap.ts`) with action methods + a metadata contract (`cap.meta.ts`).
- **Capsule**: A deployable group of related Caps composed via a `CapsuleRegistry` (`caps.ts`).

```
my-capsule/
├── caps.ts              # CapsuleRegistry — composes caps
├── .cap/
│   └── calculator/
│       ├── cap.ts       # CapClass — business logic
│       └── cap.meta.ts  # CapMeta — routes, events, deps
```

## 📦 Repository Structure

This is a monorepo containing the core kernel and official adapters:

- [**@mobtakronio/capskit**](./packages/capskit) — The Core Kernel and System Capsules.
- [**@mobtakronio/capskit-http-elysia**](./packages/capskit-http-elysia) — Elysia HTTP Transport Adapter.
- [**@mobtakronio/capskit-websocket-elysia**](./packages/capskit-websocket-elysia) — Elysia WebSocket Transport Adapter.

## 🛠️ Quick Start

### 1. Create a Cap

```typescript
// src/capsules/math-capsule/.cap/calculator/cap.ts
import { ActionInput, CapContext } from '@mobtakronio/capskit';

export default class CalculatorCap {
  [action: string]: any;  // Required for dynamic dispatch

  async sum(input: ActionInput, _ctx: CapContext): Promise<{ result: number }> {
    const { a, b } = input.body;
    return { result: a + b };
  }
}
```

```typescript
// src/capsules/math-capsule/.cap/calculator/cap.meta.ts
import { CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'calculator',
  routes: [
    { method: 'POST', path: '/sum', action: 'sum' }
  ],
  actions: {
    sum: { description: 'Sums two integers' }
  }
};
```

### 2. Compose into a Capsule

```typescript
// src/capsules/math-capsule/caps.ts
import { CapsuleRegistry } from '@mobtakronio/capskit';
import CalculatorCap from './.cap/calculator/cap';
import { meta as calcMeta } from './.cap/calculator/cap.meta';

const mathCapsule: CapsuleRegistry = {
  name: 'math-capsule',
  caps: [
    { class: CalculatorCap, meta: calcMeta }
  ]
};

export default mathCapsule;
```

### 3. Boot the Kernel with an Adapter

To use an adapter, install it alongside the core:

```bash
npm install @mobtakronio/capskit @mobtakronio/capskit-http-elysia elysia
```

```typescript
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import mathCapsule from './src/capsules/math-capsule/caps';

const { capskit } = await createCapsKit({
  capsules: [
    { type: 'caps-registry', registry: mathCapsule }
  ]
});

// Generate an Elysia router automatically from cap metadata!
const { router } = await capskit.use('http').buildRouter({ adapter: 'elysia' });

new Elysia().use(router).listen(3000);
```

Done! `POST /sum` is now live, bound automatically from your cap's route metadata.

### 4. Invoke Capsules in Code

```typescript
const math = capskit.use('math-capsule');
const { result } = await math.sum({ a: 15, b: 30 });
console.log(result); // 45
```

## 🏗️ Monorepo Commands

1. **Install everything**: `npm install`
2. **Build everything**: `npm run build`
3. **Run tests**: `npm run test`

## 📖 Documentation

Visit [capskit.io](https://capskit.io) (Coming Soon!) or check the `/docs` folder for the full guide.

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
