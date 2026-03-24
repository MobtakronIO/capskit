---
title: Extract transport adapters into monorepo packages
type: refactor
status: done
priority: 🔴 critical
created: 2026-03-24
tags: architecture, monorepo, adapters, packaging
dependencies: 024-dynamic-adapter-lazy-loading
---

## Objective
Move framework-specific transport adapters out of the CapsKit core package and into dedicated publishable packages inside a monorepo. The core package should remain framework-agnostic, while adapters such as Elysia and future Express adapters are installed explicitly by consumers.

This replaces the current "lazy-load Elysia from inside core" direction with a cleaner package boundary:
- `@mobtakronio/capskit` for the kernel and built-in capsules
- `@mobtakronio/capskit-http-elysia` for the Elysia HTTP adapter
- future packages such as `@mobtakronio/capskit-http-express`

## Impact
- Files:
  - `package.json` (Root)
  - `tsconfig.json` (Root)
  - `packages/capskit/package.json`
  - `packages/capskit-http-elysia/`
  - `packages/capskit-websocket-elysia/`
  - `packages/capskit/src/capsules/http/src/actions/buildRouter.ts` (Dynamic resolution)
  - `packages/capskit/src/capsules/websocket/src/actions/buildSocket.ts` (Dynamic resolution)
- New patterns:
  - **Adapter Package Boundary** for transport/framework integrations
  - **Workspace Monorepo Pattern** for core, adapters, and future capsule packages
  - **String-or-Function Adapter Resolution** in transport capsules
  - **Cross-Package Error Identity** via `isFrameworkError` property

## Plan
1. Convert the repository into a workspace-based monorepo so the core package and adapter packages can live together and be versioned intentionally.
2. Define a small adapter contract in core for HTTP and WebSocket builder packages.
3. Remove Elysia-specific implementation from the core source tree and create a dedicated package for it.
4. Update `http.buildRouter` and `websocket.buildSocket` so they can resolve:
   - adapter factory functions
   - package-name strings such as `@mobtakronio/capskit-http-elysia`
5. Keep the ergonomic public API through `capskit.use('http').buildRouter(...)` and `capskit.use('websocket').buildSocket(...)`.
6. Add publishing/build conventions for future adapter and capsule packages inside the monorepo.

## Tasks
- [x] Task 1 — Design the workspace monorepo structure for core, adapter packages, and future capsule packages
- [x] Task 2 — Choose and document the package naming convention for ecosystem packages (for example `@mobtakronio/capskit-http-elysia`)
- [x] Task 3 — Define the HTTP adapter contract that external packages must export
- [x] Task 4 — Define the WebSocket adapter contract that external packages must export
- [x] Task 5 — Refactor `http.buildRouter` to resolve adapter package names and adapter factory functions
- [x] Task 6 — Refactor `websocket.buildSocket` to resolve adapter package names and adapter factory functions
- [x] Task 7 — Extract the current Elysia HTTP adapter into its own package inside the monorepo
- [x] Task 8 — Extract the current Elysia WebSocket adapter into its own package inside the monorepo
- [x] Task 9 — Remove framework-specific adapter code and direct framework dependency expectations from the core package
- [x] Task 10 — Update docs and examples to use `capskit.use('http').buildRouter({ adapter: '@mobtakronio/capskit-http-elysia' })`
- [x] Task 11 — Add monorepo build and publish workflow guidance for future adapters and capsules

## Acceptance Criteria
- [x] The `@mobtakronio/capskit` package can be installed and imported without `elysia` present
- [x] The Elysia transport integration is provided by a separate package within the monorepo
- [x] `capskit.use('http').buildRouter({ adapter: '@mobtakronio/capskit-http-elysia' })` is supported
- [x] `capskit.use('websocket').buildSocket({ adapter: '@mobtakronio/capskit-http-elysia' })` or the final chosen Elysia package shape is supported
- [x] Core transport capsules accept both package-name string adapters and direct adapter factory functions
- [x] The monorepo layout clearly supports adding future packages such as `@mobtakronio/capskit-http-express`

## Verification
- Build the core package successfully without bundling framework code into the main entrypoint
- Verify importing `@mobtakronio/capskit` does not require `elysia`
- Verify the Elysia adapter package builds and works when installed alongside core
- Verify examples and docs use the `capskit.use(...)` API with adapter package strings
- Verify workspace build and packaging commands work for both core and adapter packages

## Risks/Blockers
- Monorepo structure affects packaging, local development, and publish workflows
- HTTP and WebSocket adapter boundaries may need one shared package or two separate packages; decided to use transport-specific packages for maximum modularity.
- The adapter contract must stay small and stable so future adapters do not couple back into kernel internals
- Cross-package error identity: Solved by adding `isFrameworkError` property to avoid `instanceof` failures in monorepos.
