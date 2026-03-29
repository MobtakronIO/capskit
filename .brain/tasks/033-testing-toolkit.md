---
title: Create @capskit/testing toolkit for capsule and action tests
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
completed: 2026-03-29
tags: testing,tooling,dx,kernel
---

## Objective
Provide an official testing toolkit so capsule authors can test actions and hooks with minimal boilerplate.

## Impact
- Files: (to be confirmed during implementation)
  - packages/testing/*
  - packages/capskit/src/types.ts
  - examples/*
  - tests/suites/*
- New patterns:
  - Mock kernel harness
  - Test helpers for action execution with injected deps

## Plan
- Create `@capskit/testing` package with a minimal harness API.
- Include helpers for mocked deps, fake context, and event assertions.
- Add fixtures for manifest/action testing.
- Provide example tests for common capsule scenarios.

## Tasks
- [x] Scaffold `@capskit/testing` package.
- [x] Implement `createTestCapsule()` helper.
- [x] Add dependency and event mocking helpers.
- [x] Add assertion utilities for action outputs and emitted events.
- [x] Write sample tests for docs/examples.
- [x] Document testing workflow and best practices.

## Acceptance Criteria
- [x] Capsule authors can run action tests without booting full runtime.
- [x] Toolkit supports mocking deps and asserting emitted events.
- [x] Example tests compile and pass in CI.

## Verification
- npm run test ✅ (21 passing tests)
- npm run build ✅

## Risks/Blockers
- API design must stay small to avoid locking users into rigid test style.

(End of file - total 54 lines)
