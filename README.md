# CapsKit 💊

**The Universal Capability Kernel** — Break free from controllers. Package your business logic into pure, swappable capsules that run identically via HTTP, Event Bus, CLI, or internal routines.

[![npm version](https://img.shields.io/npm/v/@capskit/core.svg)](https://www.npmjs.com/package/@capskit/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Why CapsKit?

Traditional architectures tightly couple business logic to the transport layer (Controllers/Request objects). This makes it hard to reuse logic in CRON jobs, background workers, or CLIs.

CapsKit implements the **Capability Architecture** pattern:
- **Zero Boundary Logic**: Capsules don't know about HTTP or Frameworks.
- **Declarative Manifests**: Routing, Traits, and Events are defined in simple metadata.
- **Universal Pipelines**: Global Interceptors and Action-level Hooks for tracing, auth, and more.

## 📦 Installation

```bash
npm install @capskit/core elysia
# or
bun add @capskit/core elysia
```

## 🛠️ Quick Start

### 1. Define a Capsule

```typescript
// capsules/calculator/manifest.ts
import { CapsuleManifest } from '@capskit/core';

export const service: CapsuleManifest = {
  name: 'calculator',
  actions: {
    sum: {
      handler: async (payload) => ({ result: payload.a + payload.b }),
      description: 'Adds two numbers'
    }
  },
  routes: [
    { method: 'POST', path: '/sum', action: 'sum' }
  ]
};
```

### 2. Boot the Kernel

```typescript
import { createCapsKit } from '@capskit/core';
import { Elysia } from 'elysia';
import * as path from 'path';

const capskit = await createCapsKit({
  capsuleDirs: [path.resolve('./capsules')],
  dependencies: { db: myDatabase }
});

await capskit.start();

// Mount to Elysia automatically!
const { router } = await capskit.call('http.buildRouter', { adapter: 'elysia' });

new Elysia()
  .use(router)
  .listen(3000);
```

### 3. Native Invocation (Proxy Client)

```typescript
const calculator = capskit.use('calculator');
const { result } = await calculator.sum({ a: 10, b: 20 });
```

## 📖 Documentation

Visit [capskit.io](https://capskit.io) (Coming Soon!) or check the `/docs` folder for the full guide.

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
