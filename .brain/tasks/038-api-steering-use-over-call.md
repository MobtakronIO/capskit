---
title: Steer public API usage to use().action() and guard internal call()
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
tags: api,dx,ai,lint,guardrails
dependencies: 031-schema-contracts-validation,032-error-taxonomy
---

## Objective
Make `capskit.use('capsule').action()` the canonical app-facing API and reduce accidental use of `capskit.call(...)` in user code and AI-generated code.

## Impact
- Files: (to be confirmed during implementation)
  - packages/capskit/src/index.ts
  - packages/capskit/src/kernel/*
  - packages/capskit/src/types.ts
  - eslint rules/config (or custom lint package)
  - docs/guide/*
  - tests/suites/*
- New patterns:
  - Public vs internal API boundary
  - Lint/runtime guardrails for API usage

## Plan
- Keep `capskit.call(...)` available for kernel/advanced internals but discourage it for capsule app code.
- Add lint rule(s) to flag direct `capskit.call(...)` in user capsules.
- Add dev-time runtime warning when `capskit.call(...)` is used outside allowed internal contexts.
- Ensure docs/examples and generated snippets always prefer `use().action()`.

## Tasks
- [x] Define and document API boundary (`use().action()` public, `call()` internal/advanced).
- [x] Implement lint rule to flag direct `capskit.call(...)` in app capsule code.
- [x] Add optional dev runtime warning for disallowed direct `call()` usage.
- [x] Add migration guide for replacing `capskit.call('x.y', payload)` with `capskit.use('x').y(payload)`.
- [x] Update examples/templates to exclusively use `use().action()`.
- [x] Add tests for lint rule behavior and runtime warning conditions.

## Acceptance Criteria
- [x] Public docs/examples consistently use `capskit.use('capsule').action()`.
- [x] Lint checks detect disallowed direct `capskit.call(...)` usage in user code.
- [x] Dev runtime can warn on disallowed direct `call()` usage without breaking internals.
- [x] Migration guidance exists for existing projects.

## Verification
- npm run test
- npm run lint

## Risks/Blockers
- Overly strict lint/runtime checks may block legitimate advanced use cases; include allowlist/escape hatch.
