---
layout: home
---

<script setup>
import { ref } from 'vue'
</script>

# CapsKit

## The Universal Capability Kernel

**Break free from framework controllers.** Package your business logic into pure, swappable capsules that run identically via HTTP, WebSocket, CLI, or internal routines.

<div class="hero-actions">
  <a href="/guide/introduction" class="VPButton brand">Get Started</a>
  <a href="https://github.com/MobtakronIO/capskit" class="VPButton alt">GitHub</a>
</div>

```ts
// src/capsules/math/manifest.ts
export const service = {
  name: 'math',
  actions: {
    sum: {
      handler: async (payload) => ({
        result: payload.a + payload.b
      }),
      schema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' }
        }
      }
    }
  }
}
```

<br>

```ts
// bootstrap.ts
import { createCapsKit } from '@mobtakronio/capskit'
import { Elysia } from 'elysia'

const capskit = await createCapsKit({
  capsuleDirs: ['./src/capsules']
})

// Auto-generate HTTP router from manifests
const { router } = await capskit.call('http.buildRouter', {
  adapter: 'elysia'
})

new Elysia().use(router).listen(3000)
```

## Why CapsKit?

### Transport Agnostic
Write pure business logic once. Run it anywhere—HTTP endpoints, WebSocket handlers, message queue consumers, or CLI commands—without rewriting a single line.

### Declarative by Design
Define capabilities, dependencies, and transport metadata in a single `manifest.ts`. No more scattering routing logic across controllers, middleware, and config files.

### Type-Safe Contracts
TypeScript-first from the ground up. Action schemas, dependency injection, and manifest validation catch errors at build time, not runtime.

### Universal Pipelines
Kernel Interceptors wrap every action with cross-cutting concerns: logging, metrics, transactions, auth. Same pipeline for HTTP, WebSocket, or internal calls.

### True Plug & Play
Capsules are self-contained modules. Drop a capsule into your project and the kernel automatically discovers, validates, and wires it into the system.

## Feature Grid

<div class="feature-grid">

<div class="feature-card">
  <div class="feature-icon">⚡</div>
  <h3>Zero Framework Lock-in</h3>
  <p>Capsules contain no transport logic. Your business rules stay pure and testable, independent of HTTP, WebSocket, or any other framework.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">🔌</div>
  <h3>Dynamic Adapters</h3>
  <p>Generate complete routers or wire events automatically from manifest metadata. Adapters translate your declarative config into real middleware.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">🛡️</div>
  <h3>Built-in Contracts</h3>
  <p>JSON Schema validation, dependency contracts, and type safety enforced at kernel boundary. Fail fast, debug easily.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">🎯</div>
  <h3>Event-Driven Core</h3>
  <p>Publish and subscribe to events across capsules with zero boilerplate. The kernel handles routing, lifecycle, and error propagation.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">🔧</div>
  <h3>Interceptor Chains</h3>
  <p>Global or per-action interceptors for cross-cutting concerns. Composable, async-aware, and fully controllable.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">📦</div>
  <h3>Modular Discovery</h3>
  <p>Load capsules from directories, inline manifests, or npm packages. precedence order is explicit and configurable.</p>
</div>

</div>

## Quick Comparison

| Traditional Framework | CapsKit |
| :--- | :--- |
| Logic tied to HTTP controllers | Pure actions, transport-agnostic |
| Scattered middleware config | Declarative manifest + traits |
| Manual dependency wiring | Automatic DI with validation |
| Framework-specific testing | Test actions directly, no mocks |
| Monolithic deployments | Composable capsules, pluggable |

## Ready to break free?

<div class="cta-section">
  <a href="/guide/quick-start" class="VPButton brand large">Start Building →</a>
  <span class="cta-divider">or</span>
  <a href="/guide/architecture" class="VPButton alt large">Explore Architecture</a>
</div>

<style>
.hero-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 2rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin: 2rem 0;
}

.feature-card {
  padding: 24px;
  border: 1px solid var(--vp-c-bg-mute);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.feature-icon {
  font-size: 2rem;
  margin-bottom: 12px;
}

.feature-card h3 {
  margin: 0 0 8px 0;
  font-size: 1.2rem;
}

.feature-card p {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.cta-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 2rem 0;
}

.cta-divider {
  color: var(--vp-c-text-2);
}

.large {
  padding: 12px 24px;
  font-size: 1.1rem;
}
</style>
