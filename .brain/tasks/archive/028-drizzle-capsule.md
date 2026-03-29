---
title: Add Drizzle ORM capsule (Postgres + SQLite)
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
tags: database,drizzle,capsule,orm
---

## Objective
Provide a `drizzle` capsule that exposes a thin action wrapper over an injected Drizzle instance for Postgres and SQLite.

## Impact
- Files: (to be confirmed during implementation)
  - packages/capskit/src/capsules/drizzle/*
  - packages/capskit/src/kernel/* (DI for injected drizzle instance)
  - packages/capskit/src/types.ts
  - tests/ (capsule behavior, health, close)
- New patterns:
  - ORM capsule surface (query/execute/transaction)
  - Env-only DB config via CAPSKIT_DB_*

## Plan
- Kernel constructs Drizzle instance from env vars and injects into capsule deps.
- Capsule exposes actions: query, execute, transaction, migrate (stub), health, close.
- Allow raw SQL via Drizzle `sql` tag.
- Support Postgres pooling with expanded pool env vars.

## Tasks
- [x] Define Drizzle capsule manifest and action contracts.
- [x] Implement action handlers using injected Drizzle instance.
- [x] Add env parsing for CAPSKIT_DB_* and pooling settings.
- [x] Add health and close handlers.
- [x] Stub migrate action (explicit not implemented).
- [x] Add tests for query/execute, health, close, and env parsing.
- [x] Add docs for usage and env vars.

## Acceptance Criteria
- [x] `capskit.use('drizzle')` exposes query/execute/transaction/health/close.
- [x] Capsule uses injected Drizzle instance (no internal connection logic).
- [x] Env-only config via CAPSKIT_DB_* (Postgres + SQLite).
- [x] Postgres pooling supports min/max/idle/timeout settings.
- [x] Raw SQL is permitted via Drizzle `sql` tag.
- [x] `migrate` action exists but returns not-implemented.

## Verification
- npm run test

## Risks/Blockers
- Kernel must own Drizzle construction to satisfy DI requirement.
- Env-only config may be limiting for some apps; document clearly.
