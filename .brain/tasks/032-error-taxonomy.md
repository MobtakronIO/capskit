---
title: Standardize framework error taxonomy and mapping
type: feature
status: pending
priority: 🟡 medium
created: 2026-03-29
tags: errors,kernel,adapters,dx
---

## Objective
Unify runtime errors across kernel and adapters using a shared taxonomy and predictable payload shape.

## Impact
- Files: (to be confirmed during implementation)
  - packages/capskit/src/kernel/errors.ts
  - packages/capskit/src/kernel/*
  - packages/capskit/src/capsules/http/src/adapters/*
  - packages/capskit/src/capsules/websocket/src/adapters/*
  - tests/suites/*
- New patterns:
  - Shared error classes and codes
  - Adapter-independent error envelope

## Plan
- Define core error classes/codes (Validation, Dependency, Timeout, NotFound, Internal).
- Map internal failures to taxonomy at kernel edge.
- Reuse one adapter mapping utility for HTTP/WebSocket/proxy outputs.
- Ensure stack visibility rules differ by environment.

## Tasks
- [ ] Define error taxonomy and canonical envelope.
- [ ] Add shared error-mapping utility in kernel.
- [ ] Wire HTTP/WebSocket adapters to the shared mapper.
- [ ] Add environment-based stack exposure policy.
- [ ] Add regression tests for taxonomy consistency.
- [ ] Document error codes and intended usage.

## Acceptance Criteria
- [ ] Kernel and adapters emit consistent error code + message shape.
- [ ] Transport layer does not invent custom error formats.
- [ ] Stack traces are hidden in production by default.
- [ ] Tests validate mapping parity across transports.

## Verification
- npm run test

## Risks/Blockers
- Existing clients may depend on legacy message text.
