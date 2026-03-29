---
title: Create unified Elysia adapter package (HTTP + WebSocket)
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
completed: 2026-03-29
tags: adapters,elysia,http,websocket,packaging,dx
dependencies: 025-extract-adapters-into-monorepo-packages,032-error-taxonomy,037-docs-feature-coverage-journey
---

## Objective
Provide a single installable package for Elysia integration that supports both HTTP and WebSocket transports while keeping internal modules modular and extensible.

## Impact
- Files: (confirmed during implementation)
  - packages/adapters/elysia/* (new)
  - packages/adapters/elysia/src/http/*
  - packages/adapters/elysia/src/websocket/*
  - packages/adapters/elysia/src/shared/*
  - packages/capskit/src/types.ts (adapter interfaces if needed)
  - docs/guide/adapters/*
  - tests/suites/*
- New patterns:
  - Unified adapter package with transport feature flags
  - Shared Elysia middleware and error mapping layer

## Plan
- Build `@capskit/adapter-elysia` as a unified package exposing both HTTP and WebSocket integration.
- Keep `http` and `websocket` internals separate inside the package for maintainability.
- Support enable flags so users can opt into HTTP-only, WS-only, or both.
- Add shared extension points for future Elysia-specific features (auth hooks, tracing hooks, rate-limit hooks).

## Missing/Needed For Production Readiness
- [x] Clear adapter options contract (defaults, feature flags, conflict handling).
- [x] Shared lifecycle hooks across transports (boot, shutdown, error handling).
- [x] Transport parity rules (same validation/error behavior for HTTP and WS where applicable).
- [x] Versioning and compatibility policy for Elysia and CapsKit core.
- [x] Migration path from separate adapter packages/imports to unified package.

## Tasks
- [x] Create package scaffold `@capskit/adapter-elysia`.
- [x] Move/compose existing HTTP and WS adapter logic under unified package.
- [x] Implement adapter options with flags (`http`, `websocket`) and sane defaults.
- [x] Add shared modules for error mapping and common middleware integration.
- [x] Add lifecycle hooks (`onReady`, `onClose`, `onError`) across both transports.
- [x] Add tests for HTTP-only, WS-only, and combined mode.
- [x] Add migration guide and updated adapter docs/examples.

## Acceptance Criteria
- [x] Users can install one package and enable HTTP + WebSocket together.
- [x] Users can disable either transport without breaking the other.
- [x] Shared behavior (error mapping, validation semantics) is consistent.
- [x] Docs and examples show one-package setup path.
- [x] Migration guidance exists for old imports/configuration.

## Verification
- [x] npm run test - 15 tests passing
- [x] Adapter integration smoke test with Elysia HTTP and WebSocket enabled

## Risks/Blockers
- [x] Hidden coupling between current HTTP/WS implementations was resolved via shared error mapping layer.
- [x] Backward compatibility via legacy import aliases in migration guide.

## Learnings
- Feature flags with `http: true, websocket: true` defaults provide intuitive API
- Shared error mapping layer (`src/shared/errors.ts`) prevents code duplication between transports
- Type safety improved by making `app` property optional in `UnifiedElysiaAdapter`
- Migration guide helps users transition from legacy import patterns
