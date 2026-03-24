# Review: CapsKit Core Architecture

## Overview

CapsKit is a capability-centric backend platform that implements a unique "capsule" architecture. Instead of traditional microservices, it uses independent, plug-and-play modules called "Capsules" that expose business capabilities through actions and events. The kernel provides a minimal runtime for capsule discovery, dependency validation, and cross-capsule communication with zero network latency.

The platform aims to be framework-agnostic - capsules contain pure business logic while adapters translate between external protocols (HTTP, WebSocket, CLI) and the internal action system.

## Structure

```
capskit/
├── src/
│   ├── kernel/
│   │   ├── platform.ts    # Core runtime engine (CapsKit class)
│   │   └── loader.ts      # Capsule discovery & dynamic imports
│   ├── capsules/
│   │   ├── system/        # Built-in system capsule (health, metrics, listing)
│   │   ├── http/          # HTTP adapter (Elysia-based)
│   │   ├── websocket/     # WebSocket adapter (Elysia-based)
│   │   └── capskit-calculator/ # Example business capsule
│   ├── types.ts           # TypeScript type definitions
│   └── index.ts           # Main exports
├── test/
│   └── verify.test.ts     # Integration test covering all capsules
├── package.json           # Library configuration (ESM + CJS)
└── docs/                  # VitePress documentation
```

**Key architectural layers:**

1. **Kernel** (`platform.ts`): Singleton runtime managing action registry, event bus, dependency injection, and interceptor chain
2. **Capsules**: Self-contained modules with `manifest.ts` declaring name, actions, events, routes, and dependencies
3. **Adapters**: Protocol translators (HTTP/WebSocket) that convert external requests to `platform.call()` invocations

## Key Patterns

✅ **Well-Designed Patterns:**

1. **Action-Centric Model**: All capabilities are explicit actions with clear names (`capsuleName.actionName`). This provides discoverability and avoids implicit coupling.

2. **Manifest-Driven Configuration**: Each capsule declares its interface via `CapsuleManifest`. The kernel validates dependencies and auto-registers actions without manual wiring.

3. **Dependency Injection via Context**: Actions receive `deps` from the platform, allowing capsules to remain pure while accessing shared services.

4. **Interceptor Chain**: Global and per-action interceptors enable cross-cutting concerns (logging, auth, metrics) without polluting business logic.

5. **Proxy-Based Capsule Access**: `platform.use('capsuleName')` returns a typed proxy that auto-prefixes action names, providing clean syntax: `calc.sum({a, b})`.

6. **Event-Driven Loose Coupling**: `context.emit()` and `events.subscribes` allow capsules to communicate without direct dependencies.

7. **Adapter Pattern Separation**: HTTP/WebSocket logic is isolated in separate capsules, keeping business capsules framework-agnostic.

8. **TypeScript Strictness**: Good use of interfaces (`CapsuleManifest`, `ActionDefinition`, `ActionContext`) with appropriate typing.

## Issues Found

❌ **Critical Issues:**

1. **Dynamic Handler Loading Not Implemented** (platform.ts:76)
   - Manifest handlers can be functions OR string paths, but string paths are ignored
   - Comment says "In a real implementation, we would dynamic import here" but it's not done
   - This breaks the plug-and-play promise - capsules must inline all handlers

2. **Event Subscriber Validation Missing** (platform.ts:80-87)
   - Subscribers stored as string action names (`"capsule.action"`) without checking if they exist
   - Errors only occur at emit time, making debugging difficult
   - Should validate all subscriptions during `registerCapsule()`

3. **Built-in Capsules Hardcoded** (platform.ts:26-29)
   - System capsules (`system`, `http`, `calculator`, `websocket`) are statically imported
   - Contradicts the "auto-discover from directory" approach for built-ins
   - Makes adding new built-in capsules require kernel modification

4. **Limited Error Handling in Event Bus** (platform.ts:169-183)
   - `emit()` catches errors but only logs to console
   - No retry, dead-letter queue, or error propagation
   - One faulty subscriber can affect others

⚠️ **Design Concerns:**

5. **Dependency Injection Inconsistency**
   - `capskit` dependency is injected via config (`config.dependencies.capskit`), but the test manually adds it
   - The kernel should guarantee `capskit` is always available to capsules, especially system capsule
   - Document that `capskit` is a "magic" dependency name

6. **Windows-Specific Path Handling** (loader.ts:30)
   - Uses `file://` prefix for dynamic import, comment says "In Windows"
   - Actually required by Node.js ES modules for absolute paths on all platforms
   - Should use `pathToFileURL` from `url` module for clarity

7. **No Input Validation on Action Calls**
   - `platform.call()` directly passes payload to handler without validation
   - Zod schemas in `routes` are only used by HTTP adapter, not direct action calls
   - Consider validating against manifest-defined schemas

8. **Excessive `any` Types**
   - `payload: any`, `context: any` in several places
   - `ActionHandler` should have stricter generic types for payload and result
   - `CapsuleManifest` uses `[key: string]: any` to allow extensions - could be more structured

9. **Circular Dependency Risk**
   - `system` capsule calls `context.deps.capskit.getManifests()`
   - `capskit` is the kernel instance itself, creating a potential circular dependency
   - Works because injected at runtime, but could be fragile

10. **Limited Test Coverage**
    - Only one integration test (`verify.test.ts`) that starts the full platform
    - No unit tests for individual capsules or kernel functions
    - No negative test cases (missing dependencies, invalid manifests, etc.)

## Recommendations

🔧 **Priority Fixes:**

1. **Implement Dynamic Handler Loading**
   ```typescript
   // In registerCapsule(), when handler is string:
   if (typeof definition.handler === 'string') {
     const handlerModule = await import(path.resolve(manifestDir, definition.handler));
     const handlerFn = handlerModule.default || handlerModule;
     definition.handler = handlerFn as ActionHandler;
   }
   ```
   - Load handlers lazily on first call to avoid importing all at once
   - Cache loaded modules for performance

2. **Validate Event Subscriptions at Registration**
   ```typescript
   private registerCapsule(manifest: CapsuleManifest) {
     this.validateDependencies(manifest);
     
     // Pre-validate all subscribed actions exist
     if (manifest.events?.subscribes) {
       for (const sub of manifest.events.subscribes) {
         const targetAction = `${manifest.name}.${sub.action}`;
         // We can't check yet if action exists (order dependent), 
         // but we can validate the action will be defined later
         // Better: defer validation until after all capsules registered
       }
     }
   }
   ```
   - After all capsules loaded, validate all subscriptions resolve to real actions
   - Throw early if subscription points to non-existent action

3. **Make Built-in Capsules Auto-Discovered**
   - Move `system`, `http`, `websocket`, `calculator` to a "built-in" directory
   - Load them via `loadCapsules()` like custom capsules
   - Keep static import only if truly necessary for kernel bootstrapping

4. **Improve Event Bus Error Handling**
   ```typescript
   emit(event: string, data: any): void {
     const subscribers = this.eventRegistry.get(event);
     if (!subscribers) return;
     
     for (const actionName of subscribers) {
       this.call(actionName, data).catch(err => {
         console.error(`[Event Bus] Subscriber ${actionName} failed for event ${event}:`, err);
         // TODO: dead-letter queue, retry logic, or emit error event
       });
     }
   }
   ```

5. **Guarantee `capskit` Dependency**
   - In `CapsKit` constructor, always inject `capskit: this` into `dependencies`
   - Override user-provided `deps.capskit` if present (kernel should control this)
   - Document that `capskit` is reserved/system-managed

6. **Use `pathToFileURL` for Portability**
   ```typescript
   import { pathToFileURL } from 'url';
   const module = await import(pathToFileURL(finalPath).href);
   ```

7. **Add Schema Validation Layer**
   - Extend `ActionDefinition` with optional `schema` field (like routes)
   - In `platform.call()`, if handler has schema, validate `payload` before invoking
   - Provides type safety for direct action calls, not just HTTP

8. **Reduce `any` Usage**
   - Define `ActionPayload` type with optional `params`, `body`, `query`
   - Make `ActionHandler` generic: `ActionHandler<P, R>`
   - Use `Record<string, unknown>` instead of `any` for manifest extensions

9. **Break Circular Dependency in System Capsule**
   - System capsule's `listCapsules` needs to call `capskit.getManifests()`
   - This is acceptable as `capskit` is system-provided, but should be documented
   - Consider moving `getManifests()` to a separate `registry` interface

10. **Expand Test Coverage**
    - Unit tests for: `loader.ts`, `platform.registerCapsule()`, dependency validation
    - Negative tests: missing dependency throws, invalid handler returns error
    - Event subscription tests: validate subscriber resolution fails gracefully
    - Interceptor chain tests: order of execution, error propagation

## Worth Preserving

✅ **Excellent Patterns to Carry Forward:**

1. **Clean Architecture Separation**: The three-layer design (Kernel, Capsules, Adapters) is elegant and achieves the framework-agnostic goal.

2. **Action & Event Model**: The explicit action naming (`name.action`) and event subscription system is simple yet powerful.

3. **Interceptor Chain Implementation**: The recursive `dispatch()` function in `platform.ts:123-151` correctly handles `next()` exactly once, supporting both global and per-action hooks.

4. **Proxy-Based Capsule Client**: The `use()` method in `platform.ts:154-163` creates a type-safe, ergonomic API for capsule-to-capsule calls.

5. **Manifest Extensibility**: Using `[key: string]: any` allows capsules (like HTTP) to add custom fields (`routes`, `traits`) without breaking the core type system. This is pragmatic for a plugin architecture.

6. **Elysia Adapter Implementation**: The `createElysiaRouter` function in `http/src/adapters/elysia.ts` cleanly maps manifest routes to Elysia handlers, including trait handling.

7. **Pre/Post Hooks in Actions**: The calculator capsule demonstrates per-action hooks for logging - a clean way to add capsule-specific concerns.

8. **Boot Action Pattern**: The config-driven `boot.action` allows the platform to execute initialization logic after all capsules loaded.

9. **Dependency Validation**: The `validateDependencies()` method in `platform.ts:90-98` provides early failure if required services are missing.

10. **TypeScript Configuration**: Using `tsup` for dual ESM/CJS output with types is modern and correct for a library.

---

**Overall Assessment**: CapsKit demonstrates a thoughtful, innovative approach to backend architecture. The core concepts are sound and the code is generally clean. The main gaps are in implementation completeness (dynamic handler loading) and production readiness (error handling, validation, testing). With the recommended fixes, this could be a robust foundation for capability-centric applications.