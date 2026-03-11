---
title: Consolidate Core Packages
type: refactor
status: done
created: 2026-03-11
---

## Objective
Consolidate all foundational packages (`system-capsules` and `http-elysia`) into a unified `@capskit/core` package. This creates a single installable dependency for users to get the Kernel, the standard telemetry (System capsule), and the HTTP Gateway (Elysia), significantly simplifying the developer experience.

## Plan
1. **Directory Restructure**: Move the contents of `packages/system-capsules` and `packages/http-elysia` into new subdirectories under `packages/core/src/system-capsules/`.
2. **Kernel Isolation**: Move existing kernel files (`packages/core/src/platform.ts` and `loader.ts`) into `packages/core/src/kernel/` to maintain clean logical boundaries.
3. **Dependency Updates**: 
   - Add `elysia` as an optional or standard dependency in `packages/core/package.json`.
   - Remove the old `packages/system-capsules` and `packages/http-elysia` directories.
4. **Export Consolidation**: Update `packages/core/src/index.ts` to export the kernel and provide easy access to the built-in system capsules.
5. **Bootstrapper Update**: Update `examples/elysia.js` and `packages/core/verify.ts` to reflect the new paths for the built-in capsules.

## Tasks
- [x] Create `packages/core/src/kernel` and move `platform.ts` and `loader.ts` into it.
- [x] Create `packages/core/src/system-capsules/system` and move `packages/system-capsules/*` into it.
- [x] Create `packages/core/src/system-capsules/http-elysia` and move `packages/http-elysia/*` into it.
- [x] Update import paths in all moved files.
- [x] Update `packages/core/package.json` to include `elysia`.
- [x] Delete the old `packages/system-capsules` and `packages/http-elysia` packages.
- [x] Update `verify.ts` and `examples/elysia.js` to load the system capsules from their new internal locations.
- [x] Update root `package.json` workspaces if necessary.

## Verification
- Run `verify.ts` inside `packages/core` to ensure the platform still boots, loads the internal system capsules, mounts the gateway, and successfully executes `calculator.sum` over HTTP.
- Run `examples/elysia.js` to ensure the bootstrapped example still functions correctly.
