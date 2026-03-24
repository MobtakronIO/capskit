# Review: CapsKit Core

## Overview

CapsKit is trying to be a capability-first runtime rather than another transport-first framework. The central idea is good: package business logic into capsules, expose those capabilities through adapters like HTTP or WebSocket, and keep execution concerns such as hooks, interceptors, traits, and events in the kernel.

That core idea is strong and differentiated. The codebase already shows a coherent mental model:

- a capsule is a manifest-driven unit
- actions are invoked as `capsule.action`
- adapters project capsules into delivery surfaces
- the kernel owns loading, dependency injection, dispatch, hooks, interceptors, and events

The product direction is promising.

The implementation, though, is still at an early “proof of concept with good instincts” stage. Several important behaviors are documented or implied but not yet fully honored by the code. The biggest gap is that the framework’s conceptual model is ahead of its runtime guarantees.

## Structure

### Top-Level Layout

- `src/kernel/platform.ts`
  - Main runtime. Registers capsules, validates dependencies, dispatches actions, runs interceptors/hooks, manages events, and handles boot.
- `src/kernel/loader.ts`
  - Filesystem-based capsule discovery and manifest import.
- `src/types.ts`
  - Public runtime and manifest types.
- `src/capsules/system`
  - Introspection and diagnostics-oriented built-in capsule.
- `src/capsules/http`
  - HTTP adapter capsule that builds an Elysia router from capsule route metadata.
- `src/capsules/websocket`
  - WebSocket adapter capsule that builds Elysia socket config from capsule socket metadata.
- `src/capsules/capskit-calculator`
  - Sample capsule that demonstrates actions, hooks, routes, traits, and events.
- `test/verify.test.ts`
  - End-to-end style verification script for the current surface area.

### Logic Flow

1. `createCapsKit()` instantiates `CapsKit` and calls `start()`.
2. `start()` registers built-ins, auto-loads capsule manifests from the built-in capsule directory, then loads custom capsule directories from config.
3. `registerCapsule()` stores the manifest, indexes function-based actions, and registers event subscriptions.
4. `call()` creates an execution context and runs the interceptor chain, pre-hooks, handler, and post-hooks.
5. Adapter capsules like `http.buildRouter` and `websocket.buildSocket` introspect manifests and project capabilities to Elysia.

## Key Patterns

## Good Patterns

### 1. The kernel has a clear conceptual center

`src/kernel/platform.ts` is doing the right kinds of jobs for this product. It owns loading, dispatch, events, and execution flow. That gives CapsKit a real identity as a runtime rather than just a helper library.

### 2. Capsule manifests are simple enough to adopt quickly

The author has kept the capsule authoring model lightweight. The sample calculator capsule is easy to read and demonstrates the whole story in one place:

- action
- route
- trait
- hook
- event publication

That is good product design, even if the underlying runtime still needs tightening.

### 3. Built-in capsules dogfood the abstraction

Using capsules for `system`, `http`, `websocket`, and the calculator sample is the right move. It pressures the abstraction in realistic ways instead of letting built-ins bypass the framework model.

### 4. Interceptor and hook ordering is sensible

The execution pipeline in `src/kernel/platform.ts` is conceptually sound:

- interceptors wrap the call
- pre-hooks run before the handler
- post-hooks run after the handler

That is a clean separation of concerns.

### 5. Traits are a smart declaration/enforcement split

The `http` adapter reads `route.traits` and lets external `traitHandlers` interpret them. That is a good architecture choice because it keeps policy outside capsule business logic.

## Issues Found

## 1. String-based action handlers are documented but not actually supported

File: `src/kernel/platform.ts:71`

CapsKit’s guidance says action handlers can be function imports or string paths for dynamic loading. The runtime does not currently honor that.

In `registerCapsule()`, function handlers are indexed, but string handlers are silently ignored:

- `src/kernel/platform.ts:73`
- `src/kernel/platform.ts:75`

That means manifests that use the documented string form will load without their actions actually becoming callable. This is the single clearest mismatch between the framework’s stated model and the implementation.

Impact:

- documented feature is non-functional
- failures will appear late as “Action not found”
- plugin-style capsule loading is weakened significantly

## 2. Built-in capsule auto-discovery relies on source-tree assumptions that are brittle for a published package

File: `src/kernel/platform.ts:31`

`start()` resolves `../capsules` relative to `import.meta.url` and attempts to auto-load manifests from the source structure. That may work in the repo, but it is a fragile assumption for a distributed library where the runtime shape is `dist/`, not `src/`.

The comment already hints this is temporary:

- `src/kernel/platform.ts:33`

This matters because package consumers need deterministic capsule discovery semantics after bundling/publishing.

Impact:

- source-layout coupling
- risk of discovery behaving differently in local dev vs published package
- makes the library harder to reason about operationally

## 3. The public interface and the real runtime contract are out of sync

Files:

- `src/types.ts`
- `src/kernel/platform.ts:185`
- `src/capsules/system/src/actions/listCapsules.ts:3`
- `src/capsules/http/src/adapters/elysia.ts:8`
- `src/capsules/websocket/src/adapters/elysia.ts:5`

Adapters and the `system` capsule depend on `getManifests()`, but that method is not part of `ICapsKit`. The result is that the codebase works by reaching through the public boundary:

- direct runtime check in `listCapsules`
- `@ts-ignore` / cast-based access in HTTP and WebSocket adapters

This is not just a type nicety. It means the extension mechanism does not yet have a formal introspection contract.

Impact:

- weak public API discipline
- adapters depend on internals
- ecosystem extensions will be forced into the same pattern

## 4. The event contract is inconsistent: the sample capsule publishes one event name and emits another

Files:

- `src/capsules/capskit-calculator/manifest.ts:32`
- `src/capsules/capskit-calculator/src/actions/sum.ts:11`
- `src/capsules/system/manifest.ts:24`

The calculator capsule declares:

- `publishes: ['calculator.calculated']`

and actually emits:

- `context.emit('calculator.calculated', ...)`

while the action name and capsule name are `capskit-calculator.sum`.

This reveals that published event naming is not currently normalized around the same namespace model as actions. That may be intentional, but if it is, the framework needs to make that convention explicit. Right now it looks accidental.

Impact:

- weak event naming discipline
- unclear relationship between capsule names and event namespaces
- larger apps will drift into inconsistent event taxonomies

## 5. HTTP adapter error handling collapses all application errors to HTTP 500

File: `src/capsules/http/src/adapters/elysia.ts:28`

The Elysia adapter catches all errors and always returns `500`:

- `src/capsules/http/src/adapters/elysia.ts:35`

This means:

- validation failures
- missing actions
- auth failures raised as exceptions
- dependency/config issues

all become the same transport-level response unless trait handlers intercept first. That is too blunt for a framework that wants to be reusable and transport-aware.

Impact:

- poor HTTP semantics
- weak debuggability
- pushes users toward ad hoc error handling

## 6. Route traits can return a response, but the adapter does not clearly enforce short-circuit semantics

File: `src/capsules/http/src/adapters/elysia.ts:16`

The adapter builds `beforeHandle` hooks from trait handlers, which is the right general direction. But the framework contract here is not formalized. The sample test uses a handler that returns `{ error: ... }` and mutates `set.status`, relying on Elysia’s behavior rather than a CapsKit-defined trait contract.

That means the policy model currently depends on adapter-specific semantics instead of a framework-level rule.

Impact:

- traits are conceptually strong but operationally underdefined
- behavior may diverge across adapters

## 7. The loader is noisy and under-validated

File: `src/kernel/loader.ts:26`

`loadCapsules()` prints every loaded manifest path:

- `src/kernel/loader.ts:28`

This looks like debugging output that should not be part of normal runtime behavior.

More importantly, the loader imports whatever it finds and accepts `service || manifest || default`. That is flexible, but it weakens the contract instead of enforcing the repo’s own guidance that capsules must export `service`.

Impact:

- noisy runtime logs
- weaker loader discipline
- easier for malformed capsules to slip through with inconsistent conventions

## 8. The manifest type is flexible, but too open for a framework that wants ecosystem consistency

File: `src/types.ts:1`

`CapsuleManifest` includes an index signature:

- `src/types.ts:9`

That gives excellent short-term extensibility, but it also means the framework cannot strongly guide or validate common capabilities such as `routes`, `sockets`, `traits`, schemas, lifecycle semantics, and adapter-specific metadata.

At the moment, this makes the runtime easier to grow, but harder to stabilize.

Impact:

- weaker tooling
- weaker validation
- higher long-term ambiguity

## 9. The verification path is useful, but currently more of a demo script than a test suite

File: `test/verify.test.ts`

The current test file is valuable as a smoke flow, but it behaves like an integration demo:

- starts a server
- uses console logs for pass/fail messaging
- exercises multiple concerns in one script

That is good for proving the concept, but it will not scale well as the framework grows.

Impact:

- hard to isolate failures
- low confidence in edge cases
- runtime regressions may be hard to localize

## Recommendations

## Highest Priority

### 1. Implement real support for string handler loading

This should be treated as a core feature gap, not a nice-to-have.

If the framework advertises both:

- direct function handlers
- string path handlers

then `registerCapsule()` needs to resolve or lazily resolve string handlers in a supported way.

### 2. Formalize a public introspection API

Add an explicit public method or interface contract for adapter-level introspection, for example:

- listing manifests
- listing actions
- describing capabilities

Then update `system`, `http`, and `websocket` to use it instead of private reach-through.

### 3. Define a stable discovery model for published builds

The runtime should not depend on source-layout heuristics after packaging. Discovery should be based on:

- explicit directories
- explicit manifest registration
- or a packaging-aware convention

### 4. Introduce structured framework errors

The HTTP adapter needs richer error mapping. CapsKit would benefit from typed/structured errors such as:

- validation error
- dependency error
- action not found
- unauthorized/forbidden
- boot configuration error

Then adapters can translate those errors appropriately.

## Medium Priority

### 5. Tighten manifest typing while preserving extensibility

Keep extension support, but make the common shape more explicit:

- `routes`
- `sockets`
- traits metadata
- schemas
- event metadata

This will improve docs, IDE support, and runtime validation.

### 6. Make event naming conventions first-class

Document and enforce whether events should be:

- `capsule.event`
- `domain.event`
- or another explicit convention

Right now event naming is present but not governed.

### 7. Add capsule registration diagnostics

When loading capsules, the framework should surface:

- duplicate capsule names
- duplicate action names
- unresolved handlers
- unsupported manifest exports
- invalid event subscriptions

This is especially important in a plugin-style architecture.

### 8. Separate demo coverage from test coverage

Keep the end-to-end verification flow, but add real tests for:

- `call()` behavior
- interceptor ordering
- pre/post hook behavior
- event dispatch
- manifest loading
- duplicate registration
- trait projection

## Worth Preserving

## 1. The product idea itself

This is the strongest asset in the repo. CapsKit has a clear point of view, and that matters.

## 2. The capsule abstraction

The abstraction is simple, legible, and powerful enough to support multiple adapters. That is worth protecting.

## 3. The kernel/adapters split

Even with the current leaks, the overall separation is right:

- kernel owns runtime semantics
- adapters expose them to transports

That is a solid foundation.

## 4. Dogfooding through built-in capsules

This is exactly the right habit for a framework project. It will keep the abstraction honest.

## 5. Interceptor plus hook layering

The execution pipeline in `call()` is one of the better parts of the current implementation. It should stay central to the design.

## Final Assessment

CapsKit is not a shallow framework idea. The code reflects a real architectural point of view, and that gives it a better foundation than many early libraries.

What is good today:

- the core concept is strong
- the runtime boundary is recognizable
- the code is small enough to evolve quickly
- the sample capsule demonstrates the intended developer experience well

What needs work next:

- make documented features real, especially string handler loading
- make adapter introspection official instead of implicit
- reduce source-layout coupling in discovery
- strengthen typing, diagnostics, and error semantics

My bottom-line view:

CapsKit has a genuinely good core idea and a promising skeleton, but it is still closer to an architectural prototype than a production-grade kernel. That is not a criticism of the direction. It is a signal about the next phase of work: the project now needs runtime contracts, validation, and operational clarity to catch up with the design vision.

If those gaps are closed carefully, CapsKit could become a compelling capability-first TypeScript runtime instead of just an interesting experiment.
