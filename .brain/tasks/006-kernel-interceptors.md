---
title: Implement Kernel Interceptors (Action Middlewares)
type: feature
status: active
created: 2026-03-11
---

## Objective
Introduce an action interceptor (middleware) system at the core Kernel level. This allows developers to wrap or block execution of *any* Capsule's action, regardless of how it was triggered (HTTP, Event Bus, CLI, internal call). This is vital for global concerns like logging, permission checks, and transactional wrappers.

## Plan
1. Update `IPlatform` in `src/types.ts` to include an `addInterceptor(middleware)` method.
2. An interceptor must follow a standard Onion architecture format: `(actionName, payload, context, next) => Promise<any>`.
3. Update `src/kernel/platform.ts` to store an array of interceptor functions.
4. Modify `platform.call()` to execute the chain of interceptors asynchronously before finally invoking the target `handler`.
5. Update `test/verify.test.ts` to register a dummy interceptor that logs "Action Intercepted: <name>" and verify its output in the terminal.

## Tasks
- [ ] Define the `ActionInterceptor` type in `src/types.ts`.
- [ ] Implement `addInterceptor` and the recursive execution chain in `src/kernel/platform.ts`.
- [ ] Add a `metrics` counting interceptor or a simple logging interceptor in `verify.test.ts` to prove it wraps calls correctly.

## Verification
- Run `bun test/verify.test.ts` and confirm the interceptor logs its message before and after every single `platform.call()` action sequence (including `system.getHealth` and `calculator.sum`).
