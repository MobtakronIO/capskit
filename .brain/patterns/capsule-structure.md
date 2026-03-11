# Service Capsule Structure

> Every module under `src/capsules/` MUST follow this structure.
> A **Capsule** is a plug-and-play, framework-agnostic collection of business capabilities (actions).

## Layout

```text
services/<capsule-name>/
├── manifest.ts     # The descriptive metadata (actions, schemas, routes, events)
├── index.ts        # The public API boundary (exports the 'service' manifest and 'actions')
├── src/
│   ├── actions/    # Independent, pure function files for each capability (e.g., getPrice.ts)
│   └── core/       # Private internal logic not directly exposed to the Platform Kernel
│       ├── entities/     # Domain types private to this capsule
│       ├── providers/    # External adapters (exchanges, databases — swappable)
│       ├── services/     # Complex domain logic orchestration used by actions
│       └── utils/
└── package.json    # Must NOT contain any web framework dependencies (e.g., Elysia, Express)
```

## Folder Responsibilities

### `manifest.ts`
The single source of truth for what this Capsule can do, and what it needs to run. 
- Must export a `service` object conforming to `CapsuleManifest` (from `../types`).
- Defines `name`, `requires` (hard dependencies like 'redis' or 'database'), `actions` (metadata, handlers, and localized `pre`/`post` hooks), `routes` (Zod schemas, traits), and `events`.

### `index.ts`
The API boundary for the Platform Kernel. It exports the `service` manifest and safely re-exports the individual actions.
- **Zero business logic.**
- **No HTTP frameworks or network port binding.**

### `src/actions/`
Contains the **pure capabilities** of the Capsule.
- Each action is a pure function taking `(input, deps)`.
- **No HTTP Request/Response objects.** Actions accept plain TypeScript objects, return plain objects, or throw errors.
- Actions should be completely unaware of whether they were invoked via HTTP, an Event Bus, or a CLI command.

### `src/core/`
This is the black box. The Platform Kernel never looks inside `core/`. It contains the private implementations that the actions rely on.
- `entities/`: Service-private domain types. (Platform-wide types live in `src/types.ts`).
- `providers/`: Classes or functions to talk to external systems (e.g., Binance REST APIs).
- `services/`: Heavy business orchestration. If an action processes complex state, it delegates to a domain service here.

## Core Rules
1. **Never import Web Frameworks**: No `elysia`, `express`, or network libraries inside the capsule. The gateway handles the network.
2. **Never Bind Ports**: The Capsule does not expose itself. It only exports functions mapped in `manifest.ts`.
3. **Traits and Routing are Metadata**: Rate-limiting, caching, auth, and HTTP routing are declared as pure metadata inside `manifest.ts`, never written as middleware in the actions.
4. **Dependencies are Injected**: The Platform Kernel satisfies the `requires: []` array and injects the actual connections into the `deps` argument of the action.

## Minimal Example: `manifest.ts`
```ts
import { z } from "zod";
import { getPrice } from "./src/actions/getPrice";

export const service = {
  name: "market-data",
  requires: ["redis", "database"],
  actions: {
    getPrice: {
      handler: getPrice,
      pre: [validateSubscription], // Action-level hooks that run BEFORE the handler
      post: [emitPriceFetched],    // Action-level hooks that run AFTER the handler
      description: "Get symbol price"
    }
  },
  routes: [
    {
      method: "GET",
      path: "/price/:symbol",
      action: "getPrice",
      schema: {
        params: z.object({ symbol: z.string() })
      },
      traits: { cache: 5, rateLimit: "strict" }
    }
  ],
  events: {
    publishes: ["price.updated"],
    subscribes: []
  }
};
```
