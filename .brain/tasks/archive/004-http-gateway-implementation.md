---
title: Implement HTTP Gateway as a Capsule
type: feature
status: done
created: 2026-03-11
---

## Objective
Implement a unified "Gateway" architecture where the HTTP Adapter itself is treated as a Capsule. This ensures architectural consistency (everything is a capsule) while providing a bridge between the framework-agnostic business capsules and the external world (e.g., Express or Elysia).

## Plan
1. **Capsule Definition**: Create the `http-gateway` capsule in `packages/http-gateway`.
2. **Framework Selection**: Use **Elysia (Bun)** as the underlying engine, but keep it localized within this specific capsule.
3. **Registry Integration**: The capsule will take the `platform` dependency and use `platform.getManifests()` to discover all declared `routes`.
4. **Route Mapping**: Automatically map `route.path`, `route.method`, and `route.action` to the underlying Elysia application.
5. **Request Transformation**: Create a generic handler that converts Elysia's context (body, params, query) into the standard `platform.call()` payload.
6. **Execution**: Expose a `start` action in the `http-gateway` manifest to initialize the listener.

## Tasks
- [x] Create `packages/http-gateway` with the standard capsule structure.
- [x] Add `elysia` to the `http-gateway` package.
- [x] Implement `src/core/router.ts`: Logic to iterate through manifests and bind routes to Elysia.
- [x] Implement `src/actions/listen.ts`: The primary action to start the Elysia server on a specified port.
- [x] Implement `src/actions/stop.ts`: Action to gracefully shut down the server.
- [x] Ensure the gateway capsule handles the `platform` dependency to call other capsules.

## Verification
- Boot the platform including both the `calculator` capsule and the `http-gateway` capsule.
- Call `platform.call('http-gateway.listen', { port: 3000 })`.
- Perform a manual `curl` or `fetch` to `POST http://localhost:3000/calculate/sum` (if routes are defined) and verify the result comes from the `calculator.sum` action.
