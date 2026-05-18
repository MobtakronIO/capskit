# Philosophy

CapsKit exists because every other framework makes the same mistake: they couple business logic to transport. Express handlers mix validation, database queries, and response formatting. Controllers inherit from base classes that leak HTTP concerns into domain code. The result is code that is hard to test, harder to reuse, and impossible to move to a different transport without rewriting.

CapsKit decouples them. Completely.

---

## The Problem

Business logic should not know it lives behind an HTTP server. It should not import `Request`, `Response`, or `Socket`. It should not care whether it was triggered by a REST call, a WebSocket message, a scheduled job, or another cap.

Frameworks get this wrong by design. They start with the transport and bolt on structure. CapsKit starts with the function and adds transport as an afterthought — a pluggable adapter, not a foundation.

---

## What CapsKit Refuses

**No god objects.** The kernel is not a catch-all. It is one of five built-in capsules, each with a single mission. Routing, events, health checks, WebSocket compilation — none of these belong in the kernel. They are separate capsules with separate responsibilities.

**No transport in business logic.** A cap receives `CapInput` and `CapContext`. No `req`, no `res`, no framework-specific objects. The same cap works over HTTP, WebSockets, events, CLI, or direct invocation — zero code changes.

**No hidden state.** Dependencies are declared and injected, never imported. What a cap needs is visible in its signature. Testing means passing mocks. No stubbing, no module mocking, no singleton resets.

**No magic.** CapsKit does not scan directories at runtime, generate code behind your back, or rely on decorator metadata. Everything is explicit. If you can't read it in the source, it doesn't happen.

---

## Function-Oriented Design

CapsKit uses functions only. No classes. No inheritance hierarchies. No `new` keyword. Every cap is an `async function` with a `meta` export and a `default` export.

Functions compose naturally. They are trivially testable — call them with a mock context. They tree-shake cleanly. They have no hidden lifecycle, no `this` binding, no constructor side effects.

One pattern. Every cap. Built-in and user caps are indistinguishable in structure.

---

## One Capsule = One Mission

Every capsule has exactly one mission. Not three. Not "and also." One.

| Capsule | Mission |
|---|---|
| **kernel** | The engine — execute actions, manage lifecycle |
| **events** | Pub/sub messaging — emit, subscribe, dispatch |
| **http** | Route compilation — CapMeta routes → compiled format |
| **websocket** | WS compilation — CapMeta WS events → compiled format |
| **system** | Introspection — health check, runtime inspection |

The kernel does not own routing. It does not own events. It does not own health checks. Those are separate capsules. The kernel is not special — it follows the same rules as every user capsule.

---

## Caps Are Orchestrators, Not Implementors

A `.cap.ts` file wires things together. It does not contain business logic, database queries, or pure computations. Those live in `.rule.ts`, `.helper.ts`, and `.repository.ts` files.

The cap's job: call rules, invoke helpers, persist through repositories, emit events, return results. That's it. If a cap exceeds ~200 lines, the design is wrong — the logic belongs somewhere lower in the structure.

This is not a suggestion. It is enforced by lint rules and kernel validation at boot.

---

## Transport Agnosticism

Business logic never sees HTTP. Never sees WebSockets. Never sees any transport protocol.

Caps receive `CapInput` and `CapContext` — a pure, transport-neutral form. The adapter layer translates `Request`/`Response` into this form before the cap runs, and translates the cap's return value back into a response after.

The same cap can be triggered by:
- HTTP request
- WebSocket message
- Event subscription
- `ctx.invoke()` from another cap
- CLI command

No code changes. No conditional logic. No transport detection.

---

## Zero Runtime Dependencies

The core `@mobtakronio/capskit` package ships with zero runtime dependencies. Nothing. Empty.

The rule is simple: if every CapsKit app needs it and it can be built with zero dependencies, it stays in core. Otherwise, it is an external package. HTTP adapters, database integrations, caching, rate limiting — all external. All opt-in. All swappable.

You choose your transport. You choose your database. CapsKit provides the structure.

---

## Constraints Breed Creativity

CapsKit's constraints are not accidents. They are the design.

**~200-line cap limit.** Forces decomposition. If you can't express a cap's orchestration in 200 lines, you haven't found the right abstractions yet.

**Dependency pyramid.** Imports flow down only: `.cap.ts` → `.rule.ts` / `.helper.ts` / `.repository.ts` → `.type.ts` / `.error.ts` / `.constant.ts`. No sideways imports. No upward imports. Enforced by lint rules.

**No `utils.ts`.** Utility files are where good design goes to die. If code is shared across capsules, it belongs in a shared capsule or a dedicated package. If it's only used in one place, it stays there.

Constraints force decisions. Decisions force clarity.

---

## Prove Before You Abstract

CapsKit has a graduation rule: a pattern must be proven in at least two user capsules before it earns a place in the core or shared structure.

This prevents premature abstraction — the root of most framework bloat. You don't build a shared helper because you think you'll need it. You build it because two capsules already have the same logic.

Abstract after evidence. Never before.

---

## Explicit Dependencies

Dependencies are declared at the platform level and injected through `ctx.deps`. Never imported directly.

```ts
// Platform setup
const platform = await createCapsKitPlatform({
  capsuleDirs: ['./caps'],
  dependencies: {
    database: createDatabaseConnection(),
    'jwt-secret': process.env.JWT_SECRET,
  },
});

// In a cap
const order = await orderRepository.create(ctx.deps.database, input);
```

This gives you testability (pass mocks), swappability (change implementations without touching cap code), and clear contracts (a cap's needs are visible). It also eliminates circular dependencies — dependencies flow one direction.

---

## Conclusion

CapsKit's philosophy is simple: **functions over classes, missions over monoliths, structure over convention, zero over many**. Every design decision flows from these principles. If a feature request conflicts with them, the answer is no.

---

## Further Reading

- [Architecture](./architecture.md) — System-level view with 5 built-in capsules
- [Capsules](./capsules.md) — Capsule structure and file conventions
- [Conventions](./conventions.md) — File suffix reference and dependency rules
