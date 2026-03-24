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

## 📦 Installation

```bash
npm install @mobtakronio/capskit elysia
# or
bun add @mobtakronio/capskit elysia
```

## 🛠️ Quick Start

### 1. Define a Capsule

```typescript
// src/capsules/math/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'math-capsule',
  actions: {
    sum: {
      handler: async (payload) => ({ result: payload.a + payload.b }),
      description: 'Sums two integers'
    }
  },
  routes: [
    { method: 'POST', path: '/sum', action: 'sum' }
  ]
};
```

### 2. Boot the Kernel

```typescript
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import * as path from 'path';

// Initialize the platform, auto-load built-ins and custom capsules
const { capskit } = await createCapsKit({
  capsules: [
    { type: 'directory', path: path.resolve('./src/capsules') }
  ],
  dependencies: { database: myDatabase }
});

// 1. Generate an Elysia router automatically from capsule metadata!
const { router } = await capskit.use('http').buildRouter({ adapter: 'elysia' });

// 2. Start the framework listener
new Elysia()
  .use(router)
  .listen(3000);
```

### 3. Native Invocation (Proxy Client)

```typescript
const math = capskit.use('math-capsule');
const { result } = await math.sum({ a: 10, b: 20 });
```

## 📖 Documentation

Visit [capskit.io](https://capskit.io) (Coming Soon!) or check the `/docs` folder for the full guide.

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
