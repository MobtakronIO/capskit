---
title: Create system capsule for WebSocket
type: feature
status: done
created: 2026-03-12
---

## Objective
Create a `websocket` system capsule that allows other capsules to define WebSocket endpoints in their manifests, similar to how the `http` capsule handles HTTP routes. This will provide a framework-agnostic way to expose real-time capabilities.

## Plan
1.  **Update `src/types.ts`**:
    -   Make `CapsuleManifest` extensible via `[key: string]: any`.
    -   Remove `RouteDefinition` (moved to `http` capsule).
2.  **Organize Capsule-Specific Types**:
    -   `src/capsules/http/src/types.ts`: Define `RouteDefinition`.
    -   `src/capsules/websocket/src/types.ts`: Define `SocketDefinition`.
3.  **Implement `websocket` System Capsule**:
    -   `src/capsules/websocket/manifest.ts`: Standard manifest exposing `buildSocket`.
    -   `src/capsules/websocket/src/actions/buildSocket.ts`: Action to build the WebSocket configuration.
    -   `src/capsules/websocket/src/adapters/elysia.ts`: Elysia-specific adapter for WebSocket mapping.
4.  **Update Kernel (if needed)**:
    -   Ensure `websocket` capsule is auto-loaded (it is).
5.  **Verification**:
    -   Update `test/verify.test.ts` to include a WebSocket test case.

## Tasks
- [x] Refactor `src/types.ts` to be extensible and remove protocol-specific types
- [x] Create `src/capsules/http/src/types.ts` and update its index
- [x] Create `src/capsules/websocket` with local `types.ts`
- [x] Implement `buildSocket` action in `src/capsules/websocket/src/actions/buildSocket.ts`
- [x] Implement Elysia WebSocket adapter in `src/capsules/websocket/src/adapters/elysia.ts`
- [x] Export `websocket` capsule and types from `src/capsules/websocket/index.ts`
- [x] Add WebSocket example or test case to verify functionality

## Verification
-   Run `npm run build` to ensure types are correct.
-   Run `npm test` after adding a WebSocket test case.
-   Manually test with an Elysia server and a WS client (e.g., `wscat` or browser).
