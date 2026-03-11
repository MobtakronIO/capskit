---
title: Implement Built-in System Capsules
type: feature
status: active
created: 2026-03-11
---

## Objective
Implement early iterations of `@capskit/system`, providing essential platform utilities (health checks, loaded capsule lists, metrics) using the exact same capsule execution architecture. This avoids circular dependencies while giving the platform built-in admin capabilities acting purely as business actions.

## Plan
1. Create a `manifest.ts` for the system capsule that exposes internal platform metadata queries via actions.
2. Implement standard action functions (e.g. `getHealth`, `listCapsules`) that interact directly with the platform kernel interface to extract telemetry.
3. Establish how the kernel can inject itself (or a contextual reference) into system capsule functions to retrieve the live list of capabilities.

## Tasks
- [ ] Establish `manifest.ts` defining actions: `system.getHealth`, `system.listCapsules`, `system.metrics`.
- [ ] Implement `getHealth.ts` action handler to return basic platform uptime metadata and overall system health status.
- [ ] Implement `listCapsules.ts` action handler traversing the Platform Registry to return structured info about everything loaded.
- [ ] Implement `metrics.ts` stub (e.g., memory usage or basic request counts if instrumented).
- [ ] Ensure the virtual `@capskit/system` module can be registered during the kernel boot process so its endpoints can be parsed by adapters like any other capsule.

## Verification
- Initialize the Platform incorporating the System capsule.
- Use `platform.call("system.getHealth")` and assert correct output format.
- Execute a request to `system.listCapsules` and assert it returns correctly formatted JSON detailing the registered actions and events.
