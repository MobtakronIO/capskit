---
title: Harden CapsKit kernel contracts and adapter boundaries
type: refactor
status: active
priority: 🔴 critical
created: 2026-03-23
tags: kernel,adapters,typing,loading,events
dependencies: 020-websocket-system-capsule
---

## Objective

Bring the runtime implementation in line with CapsKit's intended architecture by hardening the kernel contract, formalizing adapter introspection, and fixing the main gaps identified in the architectural review.

This task exists because the current code has a strong core idea but several contract-level mismatches:

- documented string-based handlers are not implemented
- adapters depend on internal manifest access
- capsule discovery is coupled to source layout
- public/npm-distributed capsules do not yet have a first-class registration model
- event naming and error semantics are underdefined
- loader and manifest contracts are too permissive for long-term ecosystem stability

Reference:

- `brain/knowledge/codex-5.4-review-2026-03-23.md`

## Impact

- Files:
  - `src/kernel/platform.ts`
  - `src/kernel/loader.ts`
  - `src/types.ts`
  - `src/capsules/http/src/actions/buildRouter.ts`
  - `src/capsules/http/src/adapters/elysia.ts`
  - `src/capsules/websocket/src/actions/buildSocket.ts`
  - `src/capsules/websocket/src/adapters/elysia.ts`
  - `src/capsules/system/src/actions/listCapsules.ts`
  - `src/capsules/capskit-calculator/manifest.ts`
  - `src/capsules/capskit-calculator/src/actions/sum.ts`
  - `test/verify.test.ts`
- New patterns:
  - Formal runtime introspection API
  - Structured action-handler resolution
  - Public capsule registration model
  - Clear event naming rules
  - Transport-safe error mapping
  - Stronger manifest validation boundaries

## Plan

Refactor the kernel around explicit contracts instead of implicit conventions.

The work should proceed in this order:

1. Formalize the public runtime API so adapters and system capsules stop depending on internal `getManifests()` reach-through.
2. Implement actual support for string-based action handlers, either eagerly at registration time or lazily at invocation time with validation.
3. Rework capsule discovery so published builds do not depend on source-tree assumptions.
4. Define a first-class registration model for public/npm capsules so the ecosystem can grow without static capsule imports or blind node_modules scanning.
5. Tighten manifest typing and runtime validation for common fields like routes, sockets, events, and adapter metadata.
6. Normalize event naming conventions and align the calculator sample with the chosen rule.
7. Improve HTTP and WebSocket adapter semantics, especially around trait handling, error translation, and introspection.
8. Upgrade verification so behavior is asserted in focused tests instead of only demonstrated in one smoke script.

## Tasks

- [ ] Codify and test the `capskit` dependency injection invariant so the kernel always provides it and user config cannot override or break it.
- [ ] Add a formal runtime introspection contract to the public API and migrate `system`, `http`, and `websocket` to use it instead of internal `getManifests()` access.
- [ ] Implement documented string-based action handler loading and fail registration clearly when a handler path cannot be resolved.
- [ ] Replace source-layout-based built-in capsule discovery with a packaging-safe strategy that behaves consistently in development and in published builds.
- [ ] Define and implement a first-class registration model for public/npm capsules, including explicit imported capsules and optionally package-name-based loading via config.
- [ ] Make capsule load sources explicit in config so built-ins, local discovered capsules, imported public capsules, and package-loaded capsules have clear precedence rules.
- [ ] Tighten `CapsuleManifest` typing for common fields while preserving an explicit extension mechanism for advanced capsule metadata.
- [ ] Add an optional action-level `schema` contract to `ActionDefinition` and validate inputs in `platform.call()` using a transport-agnostic validation interface.
- [ ] Add runtime validation for capsule registration, including duplicate capsule names, duplicate action names, invalid event subscriptions, and unsupported manifest export shapes.
- [ ] Define package/export conventions for public capsules, including a standard `service` export and rules for multi-capsule preset packages.
- [ ] Define and document a first-class event naming convention, then align the calculator capsule's declared published events and emitted events with that convention.
- [ ] Introduce structured framework/runtime errors so adapters can map validation, dependency, not-found, and authorization failures without collapsing everything to HTTP 500.
- [ ] Formalize trait execution semantics at the framework level so adapters share a consistent short-circuit and response contract.
- [ ] Replace manual `file://` URL construction in the loader with Node's `pathToFileURL` and cover path resolution behavior with tests.
- [ ] Remove debug/noisy loader logging and replace it with intentional diagnostics or debug-mode logging.
- [ ] Ensure manifest introspection returns fully typed `CapsuleManifest[]` through the public runtime contract without `any` leakage.
- [ ] Split the current verification flow into focused unit/integration coverage for dispatch, hooks, interceptors, discovery, events, adapter projection, dependency injection invariants, and input validation.

## Acceptance Criteria

- [ ] The runtime always injects a valid `capskit` dependency and user-supplied dependencies cannot replace it.
- [ ] The public CapsKit API exposes a supported way to inspect registered capsule manifests without `@ts-ignore` or unchecked casts.
- [ ] Manifests using function handlers and string handlers both register callable actions successfully.
- [ ] Capsule discovery works the same way from source and from packaged output.
- [ ] Public capsules can be registered through an intentional config/API path without static capsule-to-capsule imports or blind `node_modules` scanning.
- [ ] Load precedence between built-ins, local discovered capsules, imported public capsules, and package-loaded capsules is documented and enforced.
- [ ] Public capsule packages follow a clear export convention and duplicate capsule names fail predictably.
- [ ] Common manifest fields have explicit typing and validation failures are surfaced clearly at registration time.
- [ ] Actions can declare optional input schemas and invalid payloads fail before handler execution with framework-level validation errors.
- [ ] Event naming is consistent across declaration and emission in built-in/sample capsules.
- [ ] HTTP adapter behavior distinguishes between application error classes instead of always returning 500.
- [ ] Trait handling has explicit framework-level semantics that are portable across adapters.
- [ ] Loader URL resolution uses Node-safe file URL conversion and works correctly on Windows-style paths.
- [ ] Manifest introspection is strongly typed end-to-end without `any`-based adapter reach-through.
- [ ] Verification covers the hardened runtime contracts with automated assertions.

## Verification

- Add focused tests for action registration and dispatch.
- Add tests for string-handler resolution success and failure paths.
- Add tests for duplicate capsule/action registration failures.
- Add tests for the `capskit` dependency injection invariant and user dependency merge behavior.
- Add tests for action schema validation success and failure paths.
- Add tests for explicit public capsule registration through imported manifests.
- Add tests for optional package-name-based public capsule loading if that mode is supported.
- Add tests for precedence and duplicate-name behavior across built-in, local, and public capsule sources.
- Add tests for event subscription registration and dispatch behavior.
- Add tests for public introspection APIs used by adapters and system actions.
- Add tests for loader file URL resolution on Windows-safe paths.
- Add adapter-level tests for HTTP error mapping and trait short-circuit behavior.
- Run the full build and test suite after the refactor.

## Risks/Blockers

- Discovery refactors may break current local development assumptions.
  - Mitigation: preserve behavior with explicit tests for dev and packaged modes.
- Public capsule loading can introduce ambiguity or unsafe magic if discovery is too implicit.
  - Mitigation: prefer explicit registration and avoid blind scanning of `node_modules`.
- Tightening manifest contracts may break existing sample or user capsules.
  - Mitigation: keep a backward-compatibility layer with deprecation warnings where reasonable.
- Introducing structured errors may require adapter API changes.
  - Mitigation: land the kernel error model first, then update adapters in the same task.
