---
title: Decouple Elysia via Dynamic Lazy-Loading
type: refactor
status: active
priority: 🔴 critical
created: 2026-03-24
tags: architecture, runtime, core
dependencies: none
---

## Objective
The `elysia` framework is currently bundled and tightly coupled into the CapsKit core via static imports in the `http` and `websocket` capsules. It contributes to a massive 4.8 MB unpacked size. We need to decouple it structurally so that it acts as a zero-cost default adapter, strictly lazy-loaded via `await import()`.

## Impact
- Files: 
  - `src/capsules/http/src/actions/buildRouter.ts`
  - `src/capsules/websocket/src/actions/buildSocket.ts`
  - `tsup.config.ts`
  - `package.json`
- New patterns: **Dynamic Lazy-Loading Pattern** for built-in default adapters. Standardize on optional `peerDependencies`.

## Plan
1. Mark `elysia` as `external` in `tsup` to prevent bundling its vast dependency tree (like `strtok3`).
2. Move `elysia` to `peerDependencies` in `package.json` since it is purely an optional consumer dependency.
3. Change static `import { createElysiaRouter }` to dynamic `await import()` in `buildRouter` and `buildSocket`.
4. Wrap dynamic import in `try/catch` and throw a human-readable module missing error instructing the user to `npm install elysia`.
5. Support passing generic functional adapters `if (typeof adapter === 'function')` to maintain purity.

## Tasks
- [x] Task 1 — Add `external: ['elysia']` to `tsup.config.ts` and set `minify: true`
- [x] Task 2 — Move `elysia` to `peerDependencies` in `package.json`
- [x] Task 3 — Convert static imports to run-time dynamic imports in `buildRouter.ts`
- [x] Task 4 — Convert static imports to run-time dynamic imports in `buildSocket.ts`
- [x] Task 5 — Fix syntax ReferenceError in `sum.ts` failing Elysia test cases

*(Note: These tasks were fully implemented during the architectural planning conversation, so they are marked as completed automatically).*

## Acceptance Criteria
[x] `npm pack --dry-run` shrinks unpacked size from ~4.8 MB to < 140 KB
[x] `http.buildRouter` continues to default to `elysia` via plug & play logic
[x] The core kernel does not break if `elysia` is missing until `adapter: 'elysia'` is actually triggered

## Verification
- Run `npm run build`
- Run `npm run test` (all tests passing)
- Run `npm pack --dry-run` to verify metrics.
