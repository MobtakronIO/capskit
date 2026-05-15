# Introduction

**CapsKit** is a lightweight, strictly-opinionated runtime kernel designed to enforce the "Capability Architecture" pattern for modern TypeScript applications. It is not merely a framework—it's an explicitly decoupled execution engine for your business logic.

## The Problem

Traditional architectures tightly couple your business constraints to the transport layer. When a system builds its logic inside HTTP Controllers relying heavily on Request/Response objects and HTTP Status Codes, the logic becomes trapped. Over time, making those same capabilities available to an internal CRON job, a CLI tool, a Kafka message queue, or even just another internal module becomes incredibly convoluted because the logic inherently expects an HTTP environment.

## The CapsKit Solution

CapsKit completely separates "what the system can do" from "how the system is told to do it." It ditches the controller entirely in favor of **Caps**—pure, transport-agnostic classes whose public methods are your business logic.

### Caps & Capsules — the Composition Model

CapsKit organizes business logic into a two-level hierarchy:

- **Cap**: The atomic unit. A single class (`cap.ts`) containing action methods, paired with a declarative metadata contract (`cap.meta.ts`) that declares routes, events, dependencies, and per-action configuration. A Cap is blissfully ignorant of HTTP, WebSockets, or background workers.

- **Capsule**: The composition unit. Groups one or more Caps under a single deployable name via a `CapsuleRegistry` (`caps.ts`). This is what you register with the kernel—a cohesive collection of related capabilities.

```
my-capsule/
├── caps.ts                 # CapsuleRegistry — composes caps into a capsule
├── .cap/
│   ├── calculator/
│   │   ├── cap.ts          # CapClass — business logic (class with action methods)
│   │   └── cap.meta.ts     # CapMeta — routes, events, dependencies, boot
│   └── audit/
│       ├── cap.ts
│       └── cap.meta.ts
└── manifest.ts (optional)  # Legacy manifest — co-exists during migration
```

Each `.cap/` directory contains exactly two files:

| File | Purpose |
| :--- | :--- |
| `cap.ts` | A class whose public methods are action handlers—takes a payload, uses injected dependencies, returns a raw result |
| `cap.meta.ts` | Declarative metadata describing the cap's identity, HTTP routes, published/subscribed events, dependencies, and boot lifecycle |

The **Platform Kernel** (CapsKit core) loads capsules (either as CapsuleRegistries, directory scans, or npm packages), converts them into internal representations, and orchestrates the entire application universe:

1. **Dynamic Adapters**: Transport adapters automatically generate HTTP routers, WebSocket handlers, and other transport bindings based purely on each Cap's declarative route and event metadata—no manual wiring needed.

2. **Event Routing**: The kernel acts as a loosely-coupled Event Bus, dynamically wiring Publishers directly to asynchronous Subscribers based on `cap.meta.ts` event declarations.

3. **Execution Pipeline**: Every capability invocation flows through a universal Onion-ring execution pipeline (Interceptors), ensuring platform constraints like tracing, transactions, or latency logging apply globally—whether the action was triggered via HTTP, WebSocket, event, or internal call.

### Key Design Principles

- **Zero Boundary Logic**: Caps do not expose network ports or import web frameworks. They are pure TypeScript classes.
- **Traits as Metadata**: Transport configurations (like Authorization or Rate Limiting) are defined as pure metadata `traits` inside `cap.meta.ts`. The transport adapters translate these into real middleware seamlessly.
- **Universal Uniformity**: Whether an action is called by a public API user, a fellow Cap, or an automatic CRON job, the execution path and middleware lifecycle remain exactly the same inside the kernel's execution engine.
- **Backward Compatible**: CapsKit continues to support legacy `manifest.ts`-based capsules. You can migrate gradually—Caps and legacy manifests co-exist within the same capsule directory.
