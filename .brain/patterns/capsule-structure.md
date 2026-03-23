# Service Capsule Structure

> Every module under `src/capsules/` MUST follow this structure.
> A **Capsule** is a plug-and-play, framework-agnostic collection of business capabilities (actions).

## Layout

```text
src/capsules/<capsule-name>/
├── manifest.ts     # The descriptive metadata (actions, schemas, routes, events)
├── index.ts        # The public API boundary (exports the 'service' manifest)
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
- Defines `name`, `requires` (hard dependencies like `redis`, `database`, `logger`), `actions` (metadata, handlers, and localized `pre`/`post` hooks), `routes`, `sockets`, and `events`.
- `requires` is for shared runtime dependencies provided by the kernel, not for other capsules.

### `index.ts`
The API boundary for the Platform Kernel. It exports the `service` manifest.
- **Zero business logic.**
- **No HTTP frameworks or network port binding.**
- **Do not re-export other capsules.**

### `src/actions/`
Contains the **pure capabilities** of the Capsule.
- Each action is a function taking `(input, context)`.
- `context.deps` contains injected shared dependencies.
- `context.call()` and `context.use()` are the approved ways to talk to other capsules.
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
4. **Dependencies are Injected**: The Platform Kernel satisfies the `requires: []` array and injects shared runtime services into `context.deps`.
5. **Capsules Must Not Import Other Capsules**: Never do `import testcapsule from '../testcapsule'` or import another capsule's manifest/actions/core files directly.
6. **Cross-Capsule Calls Go Through the Kernel**: If one capsule needs another capsule, use `context.call('otherCapsule.someAction', payload)` or `context.use('otherCapsule').someAction(payload)`.
7. **`requires` Is Not For Capsule-to-Capsule Wiring**: Do not list another capsule name in `requires` as a substitute for calling it through the runtime.

## Capsule Interaction Rules

Capsules are intentionally decoupled from each other at the file/module level.

Good:

```ts
export const myAction = async (payload, context) => {
  return await context.call('testcapsule.someAction', payload);
};
```

Also good:

```ts
export const myAction = async (payload, context) => {
  const testcapsule = context.use<{ someAction: (input: any) => Promise<any> }>('testcapsule');
  return await testcapsule.someAction(payload);
};
```

Bad:

```ts
import { someAction } from '../testcapsule/src/actions/someAction';
import { service as testcapsule } from '../testcapsule/manifest';
```

Why this rule exists:

- keeps capsules swappable
- avoids tight compile-time coupling
- preserves transport/runtime independence
- lets the kernel remain the single orchestration boundary
- makes future adapter and loading behavior predictable

Allowed imports across capsules:

- shared types
- shared utility libraries
- platform-wide helpers that are not themselves capsules

Disallowed imports across capsules:

- another capsule's `manifest.ts`
- another capsule's `index.ts`
- another capsule's `src/actions/*`
- another capsule's `src/core/*`

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

## Minimal Example: Cross-Capsule Call

```ts
import type { ActionHandler } from "../../types";

export const createOrder: ActionHandler = async (payload, context) => {
  const inventory = context.use<{ reserve: (input: any) => Promise<any> }>("inventory");
  await inventory.reserve({ sku: payload.sku, qty: payload.qty });

  return { ok: true };
};
```
