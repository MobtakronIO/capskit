---
title: Standardize framework error taxonomy and mapping
type: feature
status: done ✅
priority: 🟡 medium
created: 2026-03-29
completed: 2026-03-29
tags: errors,kernel,adapters,dx
---

## Objective
Unify runtime errors across kernel and adapters using a shared taxonomy and predictable payload shape.

## Impact
- Files: 
  - packages/capskit/src/kernel/errors.ts (error taxonomy already existed)
  - packages/capskit/src/kernel/error-mapping.ts (shared mapping utility already existed)
  - packages/elysia/src/shared/error-mapping.ts (fixed instanceof → duck-typing)
  - packages/capskit/test/suites/elysia-error-mapping.test.ts (22 tests)
- New patterns:
  - Shared error classes and codes
  - Adapter-independent error envelope
  - Cross-module duck-typing for error identification

## Plan (completed)
- [x] Define error taxonomy and canonical envelope.
- [x] Add shared error-mapping utility in kernel.
- [x] Wire HTTP/WebSocket adapters to the shared mapper.
- [x] Add environment-based stack exposure policy.
- [x] Add regression tests for taxonomy consistency.
- [x] Document error codes and intended usage.

## Tasks (completed)
- [x] Define error taxonomy and canonical envelope.
- [x] Add shared error-mapping utility in kernel.
- [x] Wire HTTP/WebSocket adapters to the shared mapper.
- [x] Add environment-based stack exposure policy.
- [x] Add regression tests for taxonomy consistency.
- [x] Document error codes and intended usage.

## Acceptance Criteria (met)
- [x] Kernel and adapters emit consistent error code + message shape.
- [x] Transport layer does not invent custom error formats.
- [x] Stack traces are hidden in production by default.
- [x] Tests validate mapping parity across transports.

## Key Pattern Discovered
**Cross-module error identification**: Using `instanceof FrameworkError` fails across JavaScript module boundaries (different realms/vm contexts). Solution: duck-typing with `isFrameworkError` marker property:

```typescript
// In FrameworkError base class
get isFrameworkError() { return true; }

// In error mapping (before - BROKEN)
if (error instanceof FrameworkError) // ❌ Fails across modules

// In error mapping (after - FIXED)
if ((error as any)?.isFrameworkError === true) // ✅ Works everywhere
```

## Verification
- npm run test (22 error taxonomy tests pass)

## Files Modified
- packages/elysia/src/shared/error-mapping.ts (fixed instanceof → duck-typing)
- packages/capskit/test/suites/elysia-error-mapping.test.ts (test coverage)
- packages/capskit/test/verify.test.ts (enabled tests)
