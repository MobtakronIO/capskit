# Conventions

This is the definitive reference for file naming, directory structure, and dependency rules in CapsKit capsules.

---

## File Suffix Reference

| Suffix | Directory | What goes here | Can import from |
|---|---|---|---|
| (none) | Root | `capsule.ts` — capsule declaration | External packages, `@mobtakronio/capskit` |
| `.type.ts` | `types/` | TypeScript interfaces, type aliases, enums | `.type.ts`, `.error.ts`, `.constant.ts` (each other only) |
| (none) | Root | `errors.ts` — error classes, error constants | `.type.ts`, `.error.ts`, `.constant.ts` |
| (none) | Root | `constants.ts` — runtime-invariant values | `.type.ts`, `.error.ts`, `.constant.ts` |
| `.repository.ts` | `repository/` | DB queries, external API calls, cache access | `.type.ts`, `.error.ts`, `.constant.ts` |
| `.rule.ts` | `rules/` | Constraints — returns boolean or throws | `.type.ts`, `.error.ts`, `.constant.ts`, `.helper.ts` |
| `.helper.ts` | `helpers/` | Pure computations — input → output | `.type.ts`, `.error.ts`, `.constant.ts` |
| `.cap.ts` | `caps/` | Cap caps and hook caps | ALL layers below |

---

## Dependency Pyramid

Imports flow **down only**. No layer may import from a layer above it.

```
     .cap.ts          ← Entry: orchestrates everything
       │
   ┌────┼──────────────────┐
   │    │                  │
 .rule.ts  .helper.ts  .repository.ts  ← Shared logic
   │    │                  │
   └────┼──────────────────┘
        │
   .type.ts  .error.ts  .constant.ts   ← Foundation: no imports from above
```

### Import Rules by Layer

| Layer | Can import from | CANNOT import from |
|---|---|---|
| `.cap.ts` | ALL layers below | Other `.cap.ts` files |
| `.rule.ts` | `.type.ts`, `.error.ts`, `.constant.ts`, `.helper.ts` | `.repository.ts`, `.cap.ts` |
| `.helper.ts` | `.type.ts`, `.error.ts`, `.constant.ts` | `.repository.ts`, `.rule.ts`, `.cap.ts` |
| `.repository.ts` | `.type.ts`, `.error.ts`, `.constant.ts` | `.rule.ts`, `.helper.ts`, `.cap.ts` |
| `.type.ts` / `.error.ts` / `.constant.ts` | Each other only | ALL layers above |

---

## What Goes Where

### Capsule Root Files

| File | Required? | What goes here | What does NOT go here |
|---|---|---|---|
| `capsule.ts` | **YES** | Capsule name, dependencies, boot lifecycle | Logic, queries, validation, cap references |
| `errors.ts` | If custom errors exist | Error classes, error message constants | Functions that Do I/O, imports from `.rule.ts`/`.helper.ts`/`.repository.ts`/`.cap.ts` |
| `constants.ts` | If constants exist | Runtime-invariant values (`as const`) | Functions, computed values, imports from `.rule.ts`/`.helper.ts`/`.repository.ts`/`.cap.ts` |

### Subdirectories

| Directory | Required? | What goes here | What does NOT go here |
|---|---|---|---|
| `types/` | If custom types exist | TypeScript types, interfaces, enums | Functions, runtime logic, I/O |
| `repository/` | If I/O is performed | DB queries, external API calls, cache access | Business rules, validation, imports from `.rule.ts`/`.helper.ts`/`.cap.ts` |
| `rules/` | If shared constraints exist | Boolean-returning or throwing functions | I/O, computations, imports from `.repository.ts`/`.cap.ts` |
| `helpers/` | If shared computations exist | Pure functions — input → output | I/O, constraints, imports from `.repository.ts`/`.rule.ts`/`.cap.ts` |
| `caps/` | **YES** | `.cap.ts` files (actions and hooks) | Non-cap files, imports from other `.cap.ts` files |

---

## The Graduation Rule

**Code starts inline in `.cap.ts`. Extract when one of two triggers fires:**

### Trigger 1: Horizontal Reuse (Cross-Cap)

1. **First cap** — write logic inline. No extraction needed.
2. **Second cap** needs the same logic — extract to the appropriate layer:
   - Boolean check or constraint → `.rule.ts`
   - Pure computation → `.helper.ts`
   - DB query or I/O → `.repository.ts`
3. **Never pre-extract.** Wait until the need is proven by a second consumer.

### Trigger 2: Vertical Complexity (Single-Cap)

A cap doing more than **4 distinct sequential steps** must extract each step to a `.helper.ts`, even if no other cap needs it. A "step" is a phase of work with a different concern:

| Step Category | Example | Extract To |
|---|---|---|
| Input parsing | Destructuring body, defaults | inline (doesn't count) |
| State construction | Building initial Maps/objects | `.helper.ts` |
| Loading | Dynamic imports, filesystem reads | `.helper.ts` |
| Scanning | Directory traversal, discovery | `.helper.ts` |
| Validation | Graph checks, cycle detection | `.rule.ts` |
| Ordering | Topological sort, ranking | `.helper.ts` |
| Lifecycle | Running init/boot hooks | `.helper.ts` |
| Response shaping | Building return object | inline (doesn't count) |

**Input parsing and response shaping don't count** — they're part of the cap contract. Everything else does.

### Example — Horizontal Reuse

```ts
// First cap — logic inline
export default async function createOrder(input: CapInput, ctx: CapContext) {
  const total = input.body.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // ...
}

// Second cap needs the same calculation — extract to helper
// capsules/orders/helpers/calculate-total.helper.ts
export function calculateTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// Both caps now import the helper
```

### Example — Vertical Complexity

```ts
// BAD: boot.cap.ts does 7 steps inline (parse, build state, load builtins,
//       scan users, validate, sort, run lifecycles)
export default async function boot(input: CapInput, ctx: CapContext) {
  // 90 lines of mixed concerns...
}

// GOOD: boot.cap.ts is a thin orchestrator calling 4 helpers
export default async function boot(input: CapInput, ctx: CapContext) {
  const { capsuleDirs, dependencies, disableBuiltins } = parseBootInput(input);
  const state = buildBootState(dependencies);
  await loadAllCapsules(state, disableBuiltins, capsuleDirs);
  const sorted = validateAndOrder(state);
  await runBootLifecycles(sorted, state);
  return shapeBootResponse(sorted, state);
}
```

---

## Banned File Names

These file names are **banned** across all capsules:

- `utils.ts`
- `shared.ts`
- `common.ts`

Use specific suffixes instead: `.helper.ts`, `.rule.ts`, `.repository.ts`. Vague names hide intent.

---

## Hard Limits

| Limit | Target | Enforcement |
|---|---|---|
| 200 lines | `.cap.ts` files | Lint rule `max-cap-lines`, kernel warning at boot |
| 4 steps | `.cap.ts` files | Lint rule `max-cap-steps` |
| No cap imports | `.cap.ts` → `.cap.ts` | Lint rule `no-cap-imports-cap` |
| No pyramid violations | Any layer | Lint rule `no-import-violation` |
| No classes | `.cap.ts` files | Lint rule `no-class-in-cap` |

---

## Cross-Cap Communication

Caps communicate via:

- **`ctx.invoke('capsules.action', payload)`** — RPC (request/response)
- **`ctx.emit('event.name', data)`** — Event-driven (fire-and-forget)
- **`ctx.tell('capsules.action', payload)`** — Fire-and-forget RPC

**NEVER** import from another `.cap.ts` file directly.

---

## Next Steps

- [Capsules](./capsules.md) — Full capsule structure with examples
- [Dependencies](./dependencies.md) — CapsuleDefinition and auto-discovery
- [Built-in Capsules](./built-in-capsules.md) — All 5 built-in capsules
