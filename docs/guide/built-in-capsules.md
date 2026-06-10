# Built-in Capsules

CapsKit ships with five built-in capsules. Each has its own mission, follows the same structure as user capsules, and has zero runtime dependencies.

---

## 1. Kernel Capsule

**Mission:** The engine — execute caps, manage lifecycle.

### Caps

| Cap | Description |
|---|---|
| `boot` | Load, validate, wire, and start all capsules |
| `call` | Execute a cap through the hooks pipeline |
| `register` | Register a capsule at runtime |
| `use` | Proxy-based capsule access |
| `shutdown` | Graceful shutdown |

### Structure

```
capsules/kernel/
├── capsule.ts                              # name: 'kernel', dependencies: []
├── types/
│   ├── cap-input.type.ts                      # CapInput, CapContext, CapHandler
│   ├── cap-meta.type.ts                     # CapMeta, CapRoute, CapEventSubscription
│   ├── capsule-definition.type.ts           # CapsuleDefinition
│   ├── hook.type.ts                         # HookCap, HooksPipeline
│   └── result.type.ts                       # Result<T>, Ok(), Err()
├── errors.ts                                # NotFoundError, InternalError, ValidationError
├── constants.ts                             # KERNEL_VERSION, DEFAULT_BOOT_TIMEOUT
├── repository/
│   └── filesystem.repository.ts            # discoverCapsules, discoverCaps, scanDir
├── rules/
│   ├── validate-cap-meta.rule.ts            # validateCapMeta(meta) → boolean
│   ├── validate-deps-graph.rule.ts          # validateDepGraph(capsules) → boolean
│   └── detect-cycle.rule.ts                # detectCycle(capsules) → CycleError | null
├── helpers/
│   ├── discover-caps.helper.ts              # discoverCaps(capsDir) → CapFile[]
│   ├── build-hooks-pipeline.helper.ts       # chain hooks before handler
│   └── parse-cap-path.helper.ts             # "capsule.cap" → { capsule, cap }
└── caps/
    ├── boot.cap.ts
    ├── call.cap.ts
    ├── register.cap.ts
    ├── use.cap.ts
    └── shutdown.cap.ts
```

### What the Kernel Does NOT Own

- Route compilation → http capsule
- Event dispatch → events capsule
- Health check → system capsule
- WS compilation → websocket capsule

---

## 2. Events Capsule

**Mission:** Pub/sub messaging — emit, subscribe, dispatch.

### Caps

| Cap | Description |
|---|---|
| `emit` | Publish event → dispatch to subscribers |
| `subscribe` | Runtime subscription (add listener) |
| `unsubscribe` | Runtime unsubscription (remove listener) |
| `list-subscriptions` | Inspect current subscriptions |

### Structure

```
capsules/events/
├── capsule.ts
├── types/
│   ├── event.type.ts
│   └── subscription.type.ts
├── errors.ts
├── constants.ts
├── rules/
│   └── is-valid-event.rule.ts
├── helpers/
│   ├── match-event-pattern.helper.ts
│   └── build-subscription-map.helper.ts
└── caps/
    ├── emit.cap.ts
    ├── subscribe.cap.ts
    ├── unsubscribe.cap.ts
    └── list-subscriptions.cap.ts
```

### Usage

```ts
const events = capskit.use('events');
await events.emit({ body: { event: 'order.created', data: { orderId: '1' } } });
```

---

## 3. HTTP Capsule

**Mission:** Route compilation — CapMeta routes → compiled format.

### Caps

| Cap | Description |
|---|---|
| `build-router` | Compile all caps → unified `CompiledRoute[]` |

### Structure

```
capsules/http/
├── capsule.ts
├── types/
│   ├── compiled-route.type.ts
│   └── http-adapter.type.ts
├── helpers/
│   └── compile-routes.helper.ts
└── caps/
    └── build-router.cap.ts
```

### Usage

```ts
const http = capskit.use('http');
const { routes } = await http.buildRouter();
```

The HTTP capsule compiles metadata. The adapter (Elysia, Express, Hono) creates the server.

---

## 4. WebSocket Capsule

**Mission:** WS compilation — CapMeta WS events → compiled format.

### Caps

| Cap | Description |
|---|---|
| `build-websocket` | Compile all caps → unified WS endpoints |

### Structure

```
capsules/websocket/
├── capsule.ts
├── types/
│   ├── compiled-endpoint.type.ts
│   └── ws-adapter.type.ts
├── helpers/
│   └── compile-endpoints.helper.ts
└── caps/
    └── build-websocket.cap.ts
```

Same pattern as HTTP: kernel compiles, adapter serves.

---

## 5. System Capsule

**Mission:** Introspection — health check, runtime inspection, metrics.

### Caps

| Cap | Description |
|---|---|
| `health` | Health check: status, uptime, capsule count |
| `inspect` | List caps, dependencies, hooks |
| `audit` | Log execution metrics and events |
| `getHealth` | Direct health check payload |
| `listCapsules` | List all loaded capsules |
| `metrics` | CPU and memory usage statistics |

### Structure

```
capsules/system/
├── capsule.ts
└── caps/
    ├── audit.cap.ts
    ├── getHealth.cap.ts
    ├── health.cap.ts
    ├── inspect.cap.ts
    ├── listCapsules.cap.ts
    └── metrics.cap.ts
```

Minimal capsule. No types, rules, or helpers needed — data comes from querying kernel state.

---

## Disabling Built-in Capsules

If you don't need a built-in capsule, disable it:

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit: platform } = await createCapsKit({
  capsuleDirs: ['./caps'],
  disableBuiltins: ['websocket'], // CRON-only app, no WS needed
});
```

---

## Next Steps

- [Architecture](./architecture.md) — System-level view
- [Quick Start](./quick-start.md) — Get started in under a minute
- [Philosophy](./philosophy.md) — Design principles
