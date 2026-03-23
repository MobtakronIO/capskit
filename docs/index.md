---
layout: home
---

<div class="hero-row">

<div class="hero-content">

# CapsKit

## The Universal Capability Kernel

**Break free from framework controllers.** Package your business logic into pure, swappable capsules that run identically via HTTP, WebSocket, CLI, or internal routines.

<div class="hero-actions">
  <a href="/guide/introduction" class="VPButton brand">Get Started</a>
  <a href="https://github.com/MobtakronIO/capskit" class="VPButton alt">GitHub</a>
</div>

</div>

<div class="hero-visual">

<div class="capsule-diagram">
  <div class="capsule-outer">
    <div class="capsule-inner">
      <span class="capsule-icon">⚡</span>
    </div>
  </div>
  <div class="capsule-label">Capsule</div>
  
  <div class="connector connector-top"></div>
  <div class="connector connector-bottom"></div>
  
  <div class="capsule-ring ring-1">Interceptors</div>
  <div class="capsule-ring ring-2">Pre Hooks</div>
  <div class="capsule-ring ring-3">Action</div>
  <div class="capsule-ring ring-4">Post Hooks</div>
</div>

</div>

</div>

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
.hero-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  margin-bottom: 4rem;
}

@media (max-width: 768px) {
  .hero-row {
    grid-template-columns: 1fr;
    text-align: center;
  }
  
  .hero-actions {
    justify-content: center;
  }
}

.hero-content h1 {
  font-size: 3.5rem;
  font-weight: 800;
  margin: 0;
  background: linear-gradient(135deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.hero-content h2 {
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  margin: 0.5rem 0 1rem 0;
}

.hero-content p {
  font-size: 1.1rem;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin-bottom: 1.5rem;
}

.hero-actions {
  display: flex;
  gap: 12px;
}

.hero-visual {
  display: flex;
  justify-content: center;
  align-items: center;
}

.capsule-diagram {
  position: relative;
  width: 200px;
  height: 280px;
}

.capsule-outer {
  width: 120px;
  height: 60px;
  background: linear-gradient(135deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
  border-radius: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  position: relative;
  z-index: 10;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.capsule-inner {
  width: 100px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.capsule-icon {
  font-size: 1.5rem;
}

.capsule-label {
  text-align: center;
  margin-top: 12px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.connector {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 20px;
  background: var(--vp-c-brand-1);
  opacity: 0.5;
}

.connector-top { top: -20px; }
.connector-bottom { bottom: -20px; }

.capsule-ring {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  font-size: 0.75rem;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  white-space: nowrap;
}

.ring-1 { top: 20px; }
.ring-2 { top: 50px; }
.ring-3 { top: 80px; background: var(--vp-c-brand-3); border-color: var(--vp-c-brand-1); }
.ring-4 { top: 110px; }

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
