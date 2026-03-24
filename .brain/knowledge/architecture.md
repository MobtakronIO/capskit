# CapsKit: Capability-Centric Architecture

CapsKit is a **capsule-centric backend platform** designed to build scalable applications using independent, plug-and-play modules called **Capsules** (or Service Capsules).

It moves away from traditional "microservices" (with explicit routes, local port bindings, and embedded web frameworks) towards a **Capability-Centric Architecture** where functionality is exposed through **actions** and **events**, and capsules remain fully independent and framework-agnostic.

The goal is to create a system where each module behaves like a **lego block**: you install it, drop it into a directory, and the platform automatically exposes its capabilities without manual wiring.

---

## 1. System Overview

```text
                                  ┌───────────────────────────┐
                                  │      Platform Kernel       │
                                  │  (Core Loader & Registry) │
                                  └───────────┬──────────────┘
                                              │
             ┌────────────────────────────────┴─────────────────────────────────┐
             │                                                                  │
  ┌──────────┴───────────┐                                        ┌────────────┴───────────┐
  │   Capsule Loader     │                                        │  Capability Registry   │
  │ (Scan / Import / Init)│                                        │ (actionName → function)│
  └──────────┬───────────┘                                        └────────────┬───────────┘
             │                                                                  │
  ┌──────────┴───────────┐                                        ┌────────────┴───────────┐
  │  Service Capsules    │                                        │   Actions / Capabilities│
  │  (Plug-and-Play Lego)│                                        │ (Callable by Platform) │
  └──────────┬───────────┘                                        └────────────┬───────────┘
             │                                                                  │
  ┌──────────┴───────────┐                                        ┌────────────┴───────────┐
  │ manifest.ts          │  ← Service Descriptor                  │  HTTP / Event / CLI /  │
  │ index.ts             │  ← Public API boundary                 │  Worker Adapters       │
  │ actions/             │  ← Individual Actions                  │  (Platform Maps Admin) │
  │ events/              │  ← Event hook implementations          │                        │
  └──────────┬───────────┘                                        └────────────┬───────────┘
             │                                                                  │
             └───────────────────────────────┬──────────────────────────────────┘
                                             ▼
                                       Adapters Layer
             ┌───────────────┬───────────────┬───────────────┬───────────────┐
             │  HTTP Routes  │  Event Bus    │  CLI Commands │  Workers / Cron│
             └───────────────┴───────────────┴───────────────┴───────────────┘
```

CapsKit consists of three structural layers, though the first two are bundled together in the `@capskit/core` package for simplicity:
1. **CapsKit Core** (The Kernel)
2. **System Capsules** (Platform utilities and Gateway Adapters)
3. **Application/Service Capsules** (Business logic)

---

## 2. Core Concepts

### The Platform Kernel

The **Kernel** (`@capskit/core`) is the bare-metal, intentionally minimal runtime core of CapsKit. **It is not a capsule.** It is pure, fast, framework-agnostic engine code.

**Responsibilities:**
1. **Service Discovery / Loader**: Scan the application's capsules directory and auto-load `manifest.ts` files.
2. **Dependency Validation**: Check if a Capsule's required dependencies (e.g., redis, database) are provided by the host platform. If missing, fail the boot process immediately. 
3. **Capability Registry**: Store every discovered capability in an in-memory map (e.g., `{"market-data.getPrice": getPriceFn}`).
4. **Execution Hub**: Provide `platform.call("action.name", input)` to allow zero-network-latency cross-capsule communication.
5. **Adapter System**: Connect external protocols (HTTP, message queues, etc.) to the internal capabilities.

### Service Capsules

A **Service Capsule** is a fully self-contained, plug-and-play logic module.

**Crucial Rule**: A capsule must remain **100% framework agnostic**. It must never import HTTP frameworks like Express or Elysia directly. Communication happens entirely through the Kernel.

Each capsule represents a domain and contains:
- Actions (pure business capabilities)
- Event handlers & emitters
- A **manifest** describing what it provides and requires

#### Folder Structure

```text
orders/
├── manifest.ts          # Service descriptor (metadata, events, routes, dependencies)
├── index.ts             # Public API boundary
├── actions/             # Independent functions for single capabilities
│   ├── create.ts    
│   ├── cancel.ts    
│   └── get.ts
└── events/              # Event hook implementations
    └── orderCreated.ts
└── core/                # Internal business logic (optional)
    ├── repositories/
    └── services/
```

### The "System" & Gateway Capsules (Hybrid Approach)

To avoid infinite recursion and "chicken-and-egg" dependencies, the raw Kernel handles the registry and adapters through specialized built-in capsules.
- `system.listCapsules`: Returns manifests of all running capsules.
- `system.getHealth`: Returns platform status.
- `system.reloadCapsule`: Hot-reloads a specific capsule folder.

The **Gateway Adapters** are also capsules with specific build actions:
- `http.buildRouter`: Generates a routable object for HTTP frameworks (default: Elysia).
- `websocket.buildRouter`: Generates a WebSocket-ready router.

Instead of calling separate kernel APIs, you invoke them normally: `capskit.use("system").listCapsules()`.

---

## 3. The Capability Model: Actions & Events

### Actions

**Actions** are the primary capability of a capsule representing pure business operations.

Instead of writing controllers, you define pure functions that receive `input` (validated by the Kernel) and `deps` (injected dependencies).

**Example Action (`actions/getPrice.ts`):**
```typescript
export async function getPrice(input, deps) {
  const { symbol } = input.params;
  const price = await deps.priceRepository.get(symbol);
  
  return { symbol, price };
}
```

Actions are executed globally via the platform runtime:

```typescript
const result = await platform.call("market-data.getPrice", {
  params: { symbol: "BTCUSDT" }
});
```

### Events

**Events** allow capsules to communicate without tight coupling. A capsule can emit events, and other capsules can subscribe to them via their manifests.

A capsule emits events via its local context:
```typescript
ctx.emit("orders.created", data)
```

---

## 4. The Capsule Manifest (`manifest.ts`)

The true power of the capsule resides in its statically defined manifest. The Kernel reads this object, verifies dependencies, mounts validation schemas, and auto-registers actions and routes.

**Example `manifest.ts`:**
```typescript
import { z } from "zod";

export const manifest = {
  name: "market-data",

  // 1. Hard dependencies required by the platform to mount this capsule
  requires: [
    "redis",
    "database"
  ],

  // 2. Actions: Business capabilities mapped to execution handlers
  actions: {
    getPrice: {
      handler: "actions/getPrice", // Reference to the file/function
      description: "Get symbol price"
    }
  },

  // 3. Routes: Optional metadata instructing the HTTP Adapter how to expose actions
  routes: [
    {
      method: "GET",
      path: "/price/:symbol",
      action: "getPrice",
      
      // The Kernel's adapter layer will auto-validate requests using this schema before calling the action
      schema: {
        params: z.object({
          symbol: z.string()
        })
      },

      traits: {
        cache: 5,
        rateLimit: "strict"
      }
    }
  ],

  // 4. Events: Publish/subscribe hooks for the Event Adapter to wire up automatically
  events: {
    publishes: ["price.updated"],

    subscribes: [
      {
        event: "order.created",
        action: "handleOrderCreated"
      }
    ]
  }
}
```

---

## 5. Gateway & Adapters Layer

**Adapters** act as the bridge between the outside world and the Kernel's Capability Registry. Capsules do not know about Adapters, and Adapters don't implement business logic.

- **HTTP Adapter (The API Gateway)**: Iterates over the `routes` arrays from loaded manifests, transforming them into native framework code (e.g., Elysia, Express, Hono). It uses the `schema` to validate input, interprets `traits` (applying cache/rate-limit layers automatically), and finally invokes the mapped action via `platform.call()`.
- **Event Bus Adapter**: Automatically wires up `events.subscribes` arrays to native message queue handlers (e.g., RabbitMQ, EventBridge).
- **CLI Adapter**: Dynamically provides terminal commands by parsing the platform's action list `platform.call('market-data.getPrice')`.
- **Workers / Cron**: Maps timed triggers to specific actions.

---

## 6. Repository Strategy

CapsKit is now deployed natively as a standalone, flat package structure representing the unified core.

```text
capskit/
├── package.json               # capskit core package configuration
├── src/
│   ├── kernel/                # Bare-metal runtime engine
│   ├── capsules/              # Built-in utilities & gateways (system, http)
│   ├── index.ts               # Core framework export
│   └── types.ts               # Type defs: CapsuleManifest, ActionContext
├── test/                      # Internal tests (verify.test.ts)
└── examples/
    ├── elysia.js              # Boostrapper example using Elysia Gateway
    ├── inventory-platform/
    └── accounting-platform/
```

### Application Boot Process

A real application project contains only its business capsules and configuration. The application boots the Kernel, which orchestrates the rest.

**Example Boot Process (`main.ts`):**
```typescript
### Application Boot Process

A real application project contains only its business capsules and configuration. The application boots the Kernel using the `createCapsKit` helper, which orchestrates the rest.

**Example Boot Process (`main.ts`):**
```typescript
import { createCapsKit } from "@mobtakronio/capskit"

const { capskit } = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ],
  dependencies: { database: myDatabase }
})

// Optional: call boot actions or generate adapters manually
const { router } = await capskit.use('http').buildRouter({ adapter: 'elysia' });

// Native proxy invocation
const result = await capskit.use('market-data').getPrice({ symbol: "BTCUSDT" });
```

The `createCapsKit` function initializes the kernel, loads built-in and configured capsules, injects dependencies, and executes any specified boot actions in one go.
```

---

## 7. Key Architectural Goals & Benefits

1. **Framework-Agnostic / Zero Lock-in**: You can swap out the web framework simply by pulling in a new HTTP adapter. The business capsules remain entirely unmodified.
2. **Capability-Centric Design**: Functionality is exposed as explicitly named actions rather than arbitrary services or controllers.
3. **Action-Centric Routing & Safety**: By mapping routes to explicit actions with Zod schemas, we maintain tight cohesion without coupling to HTTP Requests/Responses. Generative AI tools and OpenAPI docs can be auto-generated from the manifest directly.
4. **Plug-and-Play Reusability**: Capsules can be installed as NPM packages or dropped into folders, instantly enriching the host platform.
5. **Clean Separation**: Business logic (Actions) is completely separated from infrastructure implementations (Adapters & DI).
