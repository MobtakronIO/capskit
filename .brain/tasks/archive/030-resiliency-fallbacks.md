---
title: Add resiliency patterns (fallbacks + circuit breaker v1)
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
completed: 2026-03-29
tags: resiliency,fallbacks,circuit-breaker,kernel
---

## Objective
Provide action-level fallback behavior (cache or alternate action) to improve offline and failure handling.

## Impact
- Files: 
  - packages/capskit/src/kernel/* (context.call middleware)
  - packages/capskit/src/types.ts (resiliency config types)
  - tests/ (fallback action + cache)
- New patterns:
  - Resiliency metadata in manifest actions
  - Fallback execution in call pipeline

## Plan
- Add resiliency config to action metadata in `manifest.ts`.
- Implement call middleware to handle failures and apply fallbacks.
- Support fallback types: cache or alternate action.
- Add minimal circuit-breaker behavior (fail fast after consecutive errors).

## Tasks
- [x] Define resiliency metadata schema (fallback type, target action, thresholds).
- [x] Implement fallback-to-cache behavior.
- [x] Implement fallback-to-action behavior.
- [x] Add minimal circuit breaker state per action.
- [x] Add tests for fallback action, cache fallback, and breaker open state.
- [x] Document resiliency metadata usage.

## Acceptance Criteria
- [x] Actions can declare fallback behavior via manifest metadata.
- [x] Fallback supports cache or alternate action.
- [x] Circuit breaker can prevent repeated failing calls (v1 minimal).
- [x] Failures still surface when no fallback is configured.

## Verification
- npm run test

## Risks/Blockers
- Fallback action could loop if misconfigured; document and guard.

## Notes
- v1 minimal implementation - core mechanisms work correctly
- Conceptual improvements identified for v2:
  - Better error categorization (transient vs permanent)
  - More sophisticated breaker state transitions
  - Configurable recovery policies

(End of file - total 55 lines)
