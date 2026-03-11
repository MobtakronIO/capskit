---
title: Implement Event Bus Adapter
type: feature
status: active
created: 2026-03-11
---

## Objective
Implement an Event Bus system that fulfills the Capability Architecture's promise of loose coupling. When one capsule emits an event (`ctx.emit()`), the Kernel should read the `events.subscribes` array of all other loaded capsule manifests and automatically route the event data to their mapped actions.

## Plan
1. Ensure `CapsuleManifest` in `src/types.ts` has a fully defined `events: { publishes?: string[], subscribes?: { event: string, action: string }[] }` type.
2. Update `src/kernel/platform.ts`: During `start()` or `registerCapsule()`, it should discover all subscriptions and store them in an `eventRegistry` map (`Map<string, string[]>`, mapping eventName to actionNames).
3. Update `platform.emit(eventName, data)` to iterate over `eventRegistry.get(eventName)` and fire an asynchronous `platform.call(actionName, data)` for each subscribed action under the hood.
4. Add a dummy subscriber action in `capskit-calculator` (e.g., listening for `system.pinged` or a custom event) to prove the wire-up works.

## Tasks
- [ ] Flesh out `events` in `CapsuleManifest` typing.
- [ ] Build the in-memory Event Subscription Registry in `src/kernel/platform.ts`.
- [ ] Bind `platform.emit()` to execute subscribed `platform.call()` actions asynchronously without blocking the emitter.
- [ ] Update `capskit-calculator` to emit a `calculator.calculated` event inside its `sum` action.
- [ ] Create an `audit` capability in the `system` capsule that subscribes to `calculator.calculated` and logs it to console.

## Verification
- Running `bun test/verify.test.ts` should show the `system.audit` action firing automatically exactly after `capskit-calculator.sum` finishes its execution.
