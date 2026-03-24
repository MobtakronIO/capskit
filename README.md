# CapsKit 💊

**The Universal Capability Kernel** — Break free from controllers. Package your business logic into pure, swappable capsules that run identically via HTTP, Event Bus, CLI, or internal routines.

[![npm version](https://img.shields.io/npm/v/@mobtakronio/capskit.svg)](https://www.npmjs.com/package/@mobtakronio/capskit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Monorepo](https://img.shields.io/badge/monorepo-npm%20workspaces-blue.svg)](#-repository-structure)

## 🚀 Why CapsKit?

Traditional architectures tightly couple business logic to the transport layer (Controllers/Request objects). This makes it hard to reuse logic in CRON jobs, background workers, or CLIs.

CapsKit implements the **Capability Architecture** pattern:
- **Zero Boundary Logic**: Capsules don't know about HTTP or Frameworks.
- **Declarative Manifests**: Routing, Traits, and Events are defined in simple metadata.
- **Universal Pipelines**: Global Interceptors and Action-level Hooks for tracing, auth, and more.
- **Framework Agnostic**: Plug in any framework (Elysia, Express, etc.) through transport adapters.

## 📦 Repository Structure

This is a monorepo containing the core kernel and official adapters:

- [**@mobtakronio/capskit**](./packages/capskit) — The Core Kernel and System Capsules.
- [**@mobtakronio/capskit-http-elysia**](./packages/capskit-http-elysia) — Elysia HTTP Transport Adapter.
- [**@mobtakronio/capskit-websocket-elysia**](./packages/capskit-websocket-elysia) — Elysia WebSocket Transport Adapter.

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

### 2. Boot the Kernel with an Adapter

To use an adapter, install it alongside the core:

```bash
npm install @mobtakronio/capskit @mobtakronio/capskit-http-elysia elysia
```

```typescript
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';

const { capskit } = await createCapsKit({
  boot: {
    action: 'http.buildRouter',
    payload: { 
       adapter: '@mobtakronio/capskit-http-elysia' 
    }
  }
});

const { router } = await capskit.call('http.buildRouter');

new Elysia().use(router).listen(3000);
```

## 🏗️ Monorepo Commands

1. **Install everything**: `npm install`
2. **Build everything**: `npm run build`
3. **Run tests**: `npm run test`

## 📖 Documentation

Visit [capskit.io](https://capskit.io) (Coming Soon!) or check the `/docs` folder for the full guide.

## 📄 License

MIT © 2026 CapsKit Team / MobtakronIO
