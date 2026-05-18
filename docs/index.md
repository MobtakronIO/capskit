---
layout: home
---

<div class="hero-row">

<div class="hero-content">

# CapsKit

**The Universal Capability Kernel.** Package your business logic into pure, swappable capsules that run identically via HTTP, WebSocket, CLI, or internal routines.

<div class="hero-actions">
  <a href="/guide/quick-start" class="VPButton brand">Get Started</a>
  <a href="https://github.com/MobtakronIO/capskit" class="VPButton alt">GitHub</a>
</div>

</div>

<div class="hero-visual">
<div class="hero-panel">
  <div class="hero-panel-glow"></div>
  <div class="hero-panel-grid"></div>
  <div class="hero-badge">Capsule Runtime</div>
  <div class="hero-stage">
    <div class="hero-side hero-side-left">
      <div class="hero-side-label">Inputs</div>
      <div class="hero-node hero-node-input">HTTP</div>
      <div class="hero-node hero-node-input">WebSocket</div>
      <div class="hero-node hero-node-input">Internal</div>
    </div>
    <div class="hero-core-area">
      <div class="hero-orbit hero-orbit-one"></div>
      <div class="hero-orbit hero-orbit-two"></div>
      <div class="hero-core">
        <div class="hero-core-shell">
          <div class="hero-core-inner">
            <span class="hero-core-title">Capsule</span>
            <span class="hero-core-subtitle">Capability Kernel</span>
          </div>
        </div>
      </div>
      <div class="hero-link hero-link-left"></div>
      <div class="hero-link hero-link-right"></div>
    </div>
    <div class="hero-side hero-side-right">
      <div class="hero-side-label">Outputs</div>
      <div class="hero-node hero-node-output">CLI</div>
      <div class="hero-node hero-node-output">Events</div>
      <div class="hero-node hero-node-output">Adapters</div>
    </div>
  </div>
  <div class="hero-flow">
    <span>Hook Caps</span>
    <span>Cap</span>
    <span>Result</span>
  </div>
  <div class="hero-meta">
    <div class="hero-meta-card">
      <strong>Write once</strong>
      <span>Pure capability logic</span>
    </div>
    <div class="hero-meta-card">
      <strong>Run anywhere</strong>
      <span>One kernel, many transports</span>
    </div>
  </div>
</div>
</div>

</div>

## Why CapsKit?

<div class="why-grid">
  <div class="why-card">
    <div class="why-icon">🧭</div>
    <h3>Transport Agnostic</h3>
    <p>Write pure business logic once. Run it anywhere—HTTP endpoints, WebSocket handlers, message queue consumers, or CLI commands—without rewriting a single line.</p>
  </div>
  <div class="why-card">
    <div class="why-icon">🧩</div>
    <h3>Declarative by Design</h3>
    <p>Define capabilities as `.cap.ts` files with `meta` + default export, group them into capsules, and let the kernel auto-discover everything. No more scattering routing logic across controllers, middleware, and config files.</p>
  </div>
  <div class="why-card">
    <div class="why-icon">🔒</div>
    <h3>Type-Safe Contracts</h3>
    <p>TypeScript-first from the ground up. Cap schemas, dependency injection, and capsule validation catch errors at build time, not runtime.</p>
  </div>
  <div class="why-card">
    <div class="why-icon">🧬</div>
    <h3>Universal Pipelines</h3>
    <p>Hook caps wrap every action with cross-cutting concerns: logging, metrics, transactions, auth. Same pipeline for HTTP, WebSocket, or internal calls.</p>
  </div>
  <div class="why-card">
    <div class="why-icon">🧱</div>
    <h3>True Plug & Play</h3>
    <p>Capsules are self-contained modules. Drop a capsule directory into your project and the kernel automatically discovers, validates, and wires it into the system.</p>
  </div>
</div>

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
  <p>Generate complete routers or wire events automatically from cap metadata. Adapters translate declarative cap definitions into real framework middleware.</p>
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
<h3>Hook Chains</h3>
<p>Global or per-action hook caps for cross-cutting concerns. Composable, async-aware, and fully controllable.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">📦</div>
  <h3>Modular Discovery</h3>
  <p>Load capsules from directories with automatic dependency resolution and cycle detection. One format, zero ambiguity.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">🔗</div>
  <h3>Typed Client SDK</h3>
  <p>Auto-generated TypeScript types from server manifest. Typed <code>call()</code> and <code>use()</code> with full IDE autocomplete.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">⚛️</div>
  <h3>React &amp; Vue Integration</h3>
  <p>First-party hooks: <code>useAction</code>, <code>useSubscription</code>, <code>useCapsule</code>. Drop-in providers for both frameworks.</p>
</div>

<div class="feature-card">
  <div class="feature-icon">📴</div>
  <h3>Offline-First Support</h3>
  <p>IndexedDB-backed operation queue. Auto-flush on reconnect. Works in browser and Node.js with memory fallback.</p>
</div>

</div>

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

  .hero-panel {
    padding: 1.5rem;
  }

  .hero-stage {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .hero-flow {
    justify-content: center;
  }

  .hero-meta {
    grid-template-columns: 1fr;
  }

  .hero-link {
    display: none;
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

.hero-panel {
  position: relative;
  width: min(100%, 500px);
  padding: 1.8rem;
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    radial-gradient(circle at top left, rgba(93, 211, 158, 0.22), transparent 28%),
    radial-gradient(circle at bottom right, rgba(60, 115, 245, 0.18), transparent 34%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.95), rgba(27, 35, 53, 0.9));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
}

.hero-panel-glow {
  position: absolute;
  inset: auto -10% -25% auto;
  width: 220px;
  height: 220px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(93, 211, 158, 0.18), transparent 65%);
  pointer-events: none;
}

.hero-panel-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 26px 26px;
  mask-image: radial-gradient(circle at center, black 45%, transparent 88%);
  pointer-events: none;
}

.hero-badge {
  position: relative;
  display: inline-flex;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #d7f6e5;
  background: rgba(93, 211, 158, 0.14);
  border: 1px solid rgba(93, 211, 158, 0.25);
  margin-bottom: 1.4rem;
}

.hero-stage {
  position: relative;
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  gap: 1rem;
  align-items: center;
}

.hero-side {
  display: grid;
  gap: 0.65rem;
}

.hero-side-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9fb1c8;
  text-align: center;
}

.hero-node {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  border-radius: 18px;
  font-weight: 700;
  font-size: 0.92rem;
  color: #eef5ff;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.05);
  position: relative;
  z-index: 1;
}

.hero-node-input {
  box-shadow: inset 0 0 0 1px rgba(60, 115, 245, 0.15);
}

.hero-node-output {
  box-shadow: inset 0 0 0 1px rgba(93, 211, 158, 0.16);
}

.hero-core-area {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 250px;
}

.hero-orbit {
  position: absolute;
  border-radius: 999px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
}

.hero-orbit-one {
  width: 230px;
  height: 230px;
}

.hero-orbit-two {
  width: 280px;
  height: 280px;
  border-color: rgba(93, 211, 158, 0.18);
}

.hero-core {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  z-index: 2;
}

.hero-core-shell {
  width: 100%;
  max-width: 230px;
  padding: 1rem;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--vp-c-brand-1), #6be0b1);
  box-shadow: 0 16px 38px rgba(93, 211, 158, 0.28);
}

.hero-core-inner {
  display: grid;
  gap: 0.2rem;
  padding: 1.5rem 1rem;
  text-align: center;
  color: #0f172a;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
}

.hero-core-title {
  font-size: 1.45rem;
  font-weight: 800;
}

.hero-core-subtitle {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.72);
}

.hero-link {
  position: absolute;
  top: 50%;
  width: 82px;
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.08), rgba(93, 211, 158, 0.45));
}

.hero-link-left {
  left: 8px;
}

.hero-link-right {
  right: 8px;
  transform: scaleX(-1);
}

.hero-flow {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.2rem;
}

.hero-flow span {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #dbe7f5;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.hero-meta {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
  margin-top: 1.2rem;
}

.hero-meta-card {
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.hero-meta-card strong {
  display: block;
  color: #f8fbff;
  font-size: 0.95rem;
}

.hero-meta-card span {
  display: block;
  margin-top: 0.25rem;
  color: #b8c4d6;
  font-size: 0.86rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin: 2rem 0;
}

.feature-card {
  position: relative;
  padding: 24px;
  border: 1px solid rgba(93, 211, 158, 0.16);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(93, 211, 158, 0.08), rgba(93, 211, 158, 0.02)),
    var(--vp-c-bg-soft);
  box-shadow: 0 14px 30px rgba(16, 24, 40, 0.08);
}

.feature-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  font-size: 1.4rem;
  margin-bottom: 14px;
  background: rgba(93, 211, 158, 0.12);
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

.why-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  margin: 2rem 0 3rem 0;
}

.why-card {
  position: relative;
  padding: 22px;
  border-radius: 20px;
  border: 1px solid rgba(60, 115, 245, 0.14);
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(60, 115, 245, 0.12), transparent 55%),
    linear-gradient(180deg, rgba(60, 115, 245, 0.05), transparent 85%),
    var(--vp-c-bg-elv);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.why-icon {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(60, 115, 245, 0.12);
  color: var(--vp-c-brand-1);
  margin-bottom: 12px;
  font-size: 1.1rem;
}

.why-card h3 {
  margin: 0 0 8px 0;
  font-size: 1.15rem;
}

.why-card p {
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
