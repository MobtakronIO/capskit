---
title: Implement Platform Kernel (CapsKit Core)
type: feature
status: done
created: 2026-03-11
---

## Objective
Implement the bare-metal core engine of CapsKit (`@capskit/core`). The kernel acts as the foundation of the capability-centric architecture. It needs to discover capsules, validate dependencies, maintain the action registry, execute cross-capsule actions, and orchestrate the boot process without importing any HTTP framework. It must remain pure, minimal, and fast.

## Plan
1. **Service Discovery / Loader**: Build a scanner (`capsuleLoader.ts`) that reads a provided `capsulesDir` and dynamically imports all `manifest.ts` files.
2. **Platform Registry**: Create an in-memory map storing `actionName -> handler` relationships based on the loaded manifests.
3. **Execution Hub**: Build the primary interface (`platform.call(actionName, payload)`) the platform uses to invoke verified business capabilities across capsules.
4. **Adapter System Interface**: Design an extensible registry for adapters so external protocols (like HTTP or message queues) can plug into the platform to expose the registered actions.
5. Create the primary `createPlatform` function to bootstrap and return the Kernel instance.

## Tasks
- [x] Implement `capsuleLoader`: Function to scan the directory tree, finding and loading valid `manifest.ts` files.
- [x] Implement `registry`: The internal capability map that holds action names and their respective function definitions.
- [x] Implement `platform hub`: Build the core `Platform` class providing `call()`, `emit()`, and `start()`.
- [x] Implement `dependencyValidator`: An initialization hook checking that all declared `requires: []` dependencies are provided by the application.
- [x] Export `createPlatform` from `package/core/src/index.ts`.

## Verification
- Write unit tests mocking a basic capsule folder to ensure `createPlatform().start()` correctly parses it.
- Send a mock invocation via `platform.call()` in tests and verify the correct action resolves.
- Ensure the core doesn't import any web framework dependencies (e.g. Express or Elysia).
