---
title: Implement HTTP Route Traits (Adapter Middlewares)
type: feature
status: active
created: 2026-03-11
---

## Objective
Enhance the HTTP Capsule's Elysia adapter so it can inject native Elysia request middlewares to specific routes based on the definitions provided in a Capsule's `manifest.ts` under the `traits` property.

## Plan
1. Update `CapsuleRoute` in `src/types.ts` to include an optional `traits?: Record<string, any>` property if it doesn't already exist.
2. Update the `http` capsule's `src/adapters/elysia.ts` adapter logic.
3. When iterating over `manifest.routes`, the adapter should inspect the `route.traits` object. 
4. Provide a mechanism (e.g., passing a `traitHandlers` map into `createElysiaRouter` or registering them globally inside the `http` capsule) mapping strings like `"auth": "admin"` to actual Elysia `beforeHandle`/`derive` plugin logic.
5. Create a mock trait (e.g., `auth: 'user'`) in `capskit-calculator`'s manifest to verify execution.

## Tasks
- [ ] Define how `http.buildRouter` receives or maps trait handlers from the host application.
- [ ] Update `src/adapters/elysia.ts` to apply `beforeHandle` hooks dynamically based on `route.traits`.
- [ ] Add a sample trait to the calculator capsule in `manifest.ts` and test failing/passing that trait via `verify.test.ts` HTTP fetch calls.

## Verification
- A route with a restricted trait should return a 401 or 403 HTTP status code when called if the condition is not met, without the underlying Capsule action ever executing.
