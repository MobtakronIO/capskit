---
title: Raise kernel quality to 9.5 via contract polish and tests
type: refactor
status: active
priority: 🟡 medium
created: 2026-03-24
tags: quality,contracts,tests,adapters,docs
dependencies: 021-kernel-contract-hardening
---

## Objective
Tighten CapsKit contracts, error mapping, and validation consistency to move code quality from ~9.0 to ~9.5 with minimal surface-area changes.

## Impact
- Files:
  - src/types.ts
  - src/kernel/platform.ts
  - src/kernel/errors.ts (or new src/kernel/error-mapping.ts)
  - src/capsules/http/src/adapters/elysia.ts
  - src/capsules/websocket/src/adapters/elysia.ts
  - test/suites/http-adapter.test.ts
  - test/suites/platform.test.ts
  - test/suites/loader-edge-cases.test.ts
  - README.md or docs/kernel-contract.md
- New patterns:
  - Action input contract type
  - Shared error mapping utility for adapters
  - Expanded manifest validation
  - Targeted regression tests for traits and payload normalization

## Plan
Create a small, explicit contract layer for action inputs, centralize framework error mapping, strengthen manifest validation checks, and add targeted tests + documentation.

## Tasks
- [ ] Define `ActionInput` (or equivalent) and align handler + hooks to consume a consistent shape.
- [ ] Centralize framework error mapping and use it in HTTP + WebSocket adapters.
- [ ] Strengthen manifest validation (route/socket shape + duplicate action detection per capsule).
- [ ] Add tests for trait short-circuiting and payload normalization edge cases.
- [ ] Add a short contract doc section for capsule loading precedence and event subscription rules.

## Acceptance Criteria
- [ ] Handlers and hooks receive a single, documented input shape across transports.
- [ ] HTTP and WebSocket adapters map `FrameworkError` consistently via a shared utility.
- [ ] Manifest validation rejects malformed route/socket entries and duplicate action keys.
- [ ] Tests cover trait short-circuit behavior and payload normalization (body/params/query combos).
- [ ] Documentation explicitly states capsule loading precedence and event subscription rules.

## Verification
- npm run test

## Risks/Blockers
- Route/socket validation could reject existing custom manifests → add backward-compatible warnings if needed.
- Error mapping refactor might subtly change adapter behavior → cover with targeted tests.
