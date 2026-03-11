---
title: Implement Action-Level Hooks (Pre/Post)
type: feature
status: done
created: 2026-03-11
---

## Objective
Introduce Action-Level Hooks (`pre` and `post` arrays) explicitly defined within a Capsule's `manifest.ts`. This allows individual capabilities to manage their own execution pipelines (like custom validation, role checking, or specific event emitting) without relying on massive global interceptors.

## Plan
1. Update `ActionDefinition` in `src/types.ts` to include optional `pre?: ActionInterceptor[]` and `post?: ActionInterceptor[]` properties.
2. Update `src/kernel/platform.ts` inside the `call` execution pipeline. When `platform.call()` resolves down to the actual action:
   - Sequence through the `pre` hooks array sequentially. If any throw, the run is aborted.
   - Execute the core `handler`.
   - Sequence through the `post` hooks array sequentially (passing or giving access to the handler's result).
3. Update `test/verify.test.ts` by adding a simple `pre` hook (e.g., logging or input mutating) to `capskit-calculator.sum` to verify it triggers and controls the flow before the handler runs.

## Tasks
- [x] Add `pre` and `post` property types to `ActionDefinition` in `src/types.ts` (using `ActionInterceptor` or a similar dedicated type).
- [x] Implement the execution execution sequence for `pre` and `post` arrays inside `platform.call()` in `src/kernel/platform.ts`.
- [x] Add a `pre` and `post` hook to the `sum` action in `capskit-calculator`'s manifest and verify the logging order in `verify.test.ts`.

## Verification
- Executing `bun test/verify.test.ts` should show the `pre` hook log firing before the action handler, and the `post` hook after the action handler, all safely inside the platform's global Onion interceptor.
