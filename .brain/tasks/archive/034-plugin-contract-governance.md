---
title: Define adapter plugin contract and compatibility policy
type: feature
status: done
priority: 🟢 low
created: 2026-03-29
tags: plugins,adapters,governance,ecosystem
---

## Objective
Establish a formal contract and version policy for third-party adapters/capsules to improve ecosystem reliability.

## Impact
- Files: (to be confirmed during implementation)
  - docs/plugins/*
  - packages/capskit/src/types.ts
  - packages/capskit/src/kernel/*
  - tests/suites/*
- New patterns:
  - Adapter capability interface
  - Compatibility/version gates

## Plan
- Define plugin adapter interface and required metadata.
- Introduce compatibility checks (min/max core version, capability flags).
- Add startup-time validation and clear warnings/errors.
- Document publishing and maintenance expectations.

## Tasks
- [x] Define adapter plugin manifest contract.
- [x] Add kernel compatibility checks during load.
- [x] Add warning/error paths for incompatible plugins.
- [x] Add tests for compatible/incompatible scenarios.
- [x] Publish docs for plugin authors.

## Acceptance Criteria
- [x] Plugins declare compatibility metadata.
- [x] Kernel enforces compatibility checks at startup.
- [x] Failure reasons are explicit and actionable.

## Verification
- npm run test

## Risks/Blockers
- Strict compatibility gates could reduce short-term plugin adoption.
