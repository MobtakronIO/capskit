---
title: Establish baseline kernel quality (no contract layer)
type: refactor
status: done
priority: 🟡 medium
created: 2026-03-29
tags: quality,tests,adapters,docs
---

## Objective
Raise kernel quality without introducing a formal contract layer. Focus on stability, adapter consistency, and targeted tests.

## Impact
- Files:
  - packages/capskit/src/types.ts
  - packages/capskit/src/kernel/*
  - packages/capskit/src/capsules/http/src/adapters/*
  - packages/capskit/src/capsules/websocket/src/adapters/*
  - tests/suites/*
  - README.md or docs/kernel.md
- New patterns:
  - Shared adapter error mapping utility
  - Focused regression tests for loader + adapters

## Plan
- Centralize adapter error mapping (HTTP + WebSocket) into a shared utility.
- Tighten loader/registry validation for duplicate actions and malformed entries (no new contract system).
- Add targeted regression tests for adapter payload normalization and loader edge cases.
- Update documentation to reflect current (non-contract) behavior.

## Tasks
- [x] Create shared error mapping utility used by HTTP + WebSocket adapters.
- [x] Add loader checks for duplicate action keys per capsule.
- [x] Validate malformed manifest entries with clear error messages (non-contract).
- [x] Add tests for adapter payload normalization and loader edge cases.
- [x] Update docs describing current validation behavior.

## Acceptance Criteria
- [x] HTTP and WebSocket adapters share a single error mapping utility.
- [x] Loader rejects duplicate action keys with clear errors.
- [x] Malformed manifest entries are detected and reported (no contract layer required).
- [x] Tests cover adapter payload normalization and loader edge cases.
- [x] Docs reflect actual validation behavior.

## Verification
- npm run test

## Risks/Blockers
- Stricter validation could reject existing manifests; add clear errors and guidance.
