# Architecture

CapsKit is a lightweight, strictly-opinionated runtime kernel that enforces the **Capability Architecture** pattern. It separates "what the system can do" from "how the system is told to do it."

---

## The Five Built-in Capsules

The kernel package ships with five built-in capsules. Each has its own mission, its own directory, and its own structure:

| Capsule | Mission | Caps | Loaded |
|---|---|---|---|
| **kernel** | The engine — execute caps, manage lifecycle | `boot`, `call`, `register`, `use`, `shutdown` | 1st |
| **events** | Pub/sub messaging | `emit`, `subscribe`, `unsubscribe`, `list-subscriptions` | 2nd |
| **http** | Route compilation | `build-router` | 3rd |
| **websocket** | WS compilation | `build-websocket` | 4th |
| **system** | Introspection | `health`, `inspect` | 5th |

All five are built-in: they ship with `@mobtakronio/capskit`, have zero runtime dependencies, and are loaded automatically before user capsules.

### Built-in vs External

| | Built-in | External |
|---|---|---|
| **What** | kernel, events, http, websocket, system | drizzle, cache, calculator, security |
| **Why built-in** | Every app needs these | Optional domain concerns |
| **Has runtime deps?** | No | Yes — drizzle-orm, ioredis, etc. |
| **Loaded at boot** | Automatically, before user capsules | User adds via `capsuleDirs` or `capsules` |
| **Follows capsule structure?** | Yes | Yes |

---

## The Boot Sequence

```
1.  Load kernel capsule          → engine is ready (call, register, use, shutdown)
2.  Load events capsule          → pub/sub is ready (emit, subscribe)
3.  Load http capsule            → route compilation is ready (buildRouter)
4.  Load websocket capsule       → WS compilation is ready (buildWebSocket)
5.  Load system capsule          → introspection is ready (health, inspect)
6.  Scan user capsuleDirs        → discover user capsules
7.  Validate ALL capsules        → dependency graph, meta shapes, cycles
8.  Register user capsules       → orders, users, security, etc.
9.  Resolve hooks                → wire hook caps before caps
10. Wire event subscriptions     → read CapMeta events.subscribes, register with events capsule
11. Run boot lifecycles          → per capsule, in topological dependency order
12. System is ready
```

Steps 1–5: built-in capsules (always available).
Steps 6–10: user capsules (auto-discovered).
Step 11: ALL capsules, built-in + user, run boot in dependency order.

---

## The Adapter Contract

HTTP and WebSocket adapters are external packages that implement a contract:

```ts
interface HttpAdapter {
  name: string;    // 'elysia' | 'express' | 'hono'
  version: string;
  createServer(routes: BuildRouterResult, options: ServerOptions): Promise<Server>;
}
```

The http capsule compiles CapMeta routes into a unified `CompiledRoute[]` format. The adapter creates the framework-specific server:

```ts
const http = capskit.use('http');
const { routes } = await http.buildRouter();

const { createServer } = await import('@mobtakronio/capskit-http-elysia');
await createServer(routes, { port: 3000 });
```

| HTTP capsule owns | Adapter owns |
|---|---|
| Read CapMeta routes from all capsules | Create framework-specific server |
| Resolve hook chains per route | Register routes with framework API |
| Compile unified `CompiledRoute[]` | Handle HTTP request/response lifecycle |
| Validate route metadata | Transport-level concerns (CORS, compression) |

---

## How ctx.emit Delegates to Events

The kernel provides `ctx.emit` on CapContext as a convenience, but delegates to the events capsule:

```ts
const context: CapContext = {
  deps: { ...state.dependencies },
  emit: (event: string, data: any) => {
    capskit.call('events.emit', { body: { event, data } });
  },
  invoke: (actionPath, payload) => {
    return capskit.call(actionPath, payload, { fromUse: true });
  },
  tell: (actionPath, payload) => {
    capskit.call(actionPath, payload, { fromUse: true }).catch(() => {});
  },
  use: (name) => capskit.use(name),
};
```

The kernel has **no event logic**. All pub/sub belongs to the events capsule.

---

## How ctx.invoke and ctx.tell Work

- **`ctx.invoke(actionPath, payload)`** — RPC call. Waits for the cap to complete and returns its result.
- **`ctx.tell(actionPath, payload)`** — Fire-and-forget. Dispatches the cap without waiting. Errors are caught silently.

Both delegate to `capskit.call()` internally. The cap path format is `capsule-name.cap-name` (e.g., `orders.create-order`).

---

## What the Kernel Does NOT Own

| NOT in kernel capsule | Why | Where it lives |
|---|---|---|
| Route compilation | Different mission | http capsule |
| Event dispatch / subscriptions | Different mission | events capsule |
| Health check / introspection | Different mission | system capsule |
| WS endpoint compilation | Different mission | websocket capsule |
| Cache implementations | External dep | `@mobtakronio/capskit-cache` |
| Drizzle queries | External dep | `@mobtakronio/capskit-drizzle` |

---

## Next Steps

- [Built-in Capsules](./built-in-capsules.md) — Detailed documentation for all 5 built-ins
- [Philosophy](./philosophy.md) — Design principles behind the architecture
- [Quick Start](./quick-start.md) — Get started in under a minute
