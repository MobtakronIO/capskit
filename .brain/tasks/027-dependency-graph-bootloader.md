---
title: Build dependency graph bootloader (DAG topo sort)
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
completed: 2026-03-29
tags: boot,dependencies,kernel,dg,init
---

## Objective
Prevent capsules from starting before their declared dependencies are ready by booting capsules in topological order.

## Impact
- Files: (to be confirmed during implementation)
  - packages/capskit/src/kernel/* (loader/boot sequence)
  - packages/capskit/src/types.ts (boot lifecycle types)
  - tests/ (boot order, cycle detection)
- New patterns:
  - Dependency DAG build + validation
  - Sequential topo boot sequencing
  - Dual readiness signaling (init promise or ready event)

## Plan
- Parse all manifests and build a directed graph (capsule → dependencies).
- Validate missing dependencies and detect cycles with clear error output.
- Topologically sort the graph.
- Boot capsules sequentially in topo order.
- For each capsule, wait for readiness via `init()` Promise or ready event/hook.

## Tasks
- [x] Build DAG from manifest dependencies.
- [x] Detect missing dependencies and cycle paths (fail fast).
- [x] Add topological sort (capsules only).
- [x] Implement sequential boot in topo order.
- [x] Implement readiness resolution (init promise OR ready event).
- [x] Add tests for boot order, missing deps, and cycle detection.
- [x] Document boot lifecycle and readiness signaling.

## Acceptance Criteria
- [x] Capsules boot in dependency order derived from manifest dependencies.
- [x] Cycles are detected and boot fails with a readable cycle path.
- [x] Missing dependencies fail fast with a clear error.
- [x] Capsule readiness is honored (init promise or ready event).

## Verification
- npm run test

## Risks/Blockers
- Indefinite wait if a capsule never signals ready (no timeout by design).

## Artifacts
- Patterns: .brain/patterns/027-dependency-graph-bootloader.md
- Learnings: .brain/knowledge/027-dependency-graph-bootloader.md
- Decisions: .brain/decisions/027-dependency-graph-bootloader.md
