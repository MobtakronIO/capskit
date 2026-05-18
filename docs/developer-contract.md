# CapsKit — Compact AI Reference

> **All hard rules + key patterns in <100 lines. Use this, not the full contract.**

---

## ⛔ 10 Hard Rules

1. **Caps NEVER import other `.cap.ts` files** — use `ctx.invoke()`, `ctx.emit()`, `ctx.tell()`.
2. **No pyramid violations** — foundation (`.type`, `.error`, `.constant`) imports only each other.
3. **No `utils.ts`, `shared.ts`, `common.ts`** — suffix convention: `.helper.ts`, `.rule.ts`, `.repository.ts`.
4. **`.cap.ts` max 200 lines** — orchestrates, not implements. Extract when exceeding.
5. **Errors extend built-ins** — `ValidationError`, `NotFoundError`, `AuthorizationError`, `DependencyError`, `InternalError`. Never raw `Error`.
6. **Event names are past-tense** — `order.created` ✅, `createOrder` ❌.
7. **All I/O in `.repository.ts` only** — no DB/HTTP/file calls in caps, rules, helpers, or types.
8. **`.helper.ts` is pure** — input → output. No side effects, no `ctx`, no I/O.
9. **`.rule.ts` returns boolean or throws** — no I/O, no `ctx`. Constraint only.
10. **`capsule.ts` is name + deps + boot only** — no cap references, no business logic.

---

## Import Pyramid

```
.cap.ts              ← orchestrates, imports ALL below
.rule / .helper / .repository  ← logic layer, imports .type/.error/.constant only
.type / .error / .constant    ← foundation, imports each other ONLY
```

---

## File Suffixes

| Suffix | Purpose | Can Import |
|---|---|---|
| `.type.ts` | Interfaces, enums | `.type`, `.error`, `.constant` |
| `errors.ts` | Error classes | `.type`, `.error`, `.constant` |
| `constants.ts` | `as const` values | `.type`, `.error`, `.constant` |
| `.repository.ts` | DB queries, API calls | `.type`, `.error`, `.constant` |
| `.rule.ts` | Boolean / throws | `.type`, `.error`, `.constant`, `.helper` |
| `.helper.ts` | Pure computation | `.type`, `.error`, `.constant` |
| `.cap.ts` | Entry point (meta + handler) | ALL below + `@mobtakronio/capskit` |

---

## `capsule.ts` (Required)

```ts
import { CapsuleDefinition } from '@mobtakronio/capskit';
export default {
  name: 'orders',
  dependencies: ['database'],
  boot: { init: async ({ deps }) => { await deps.database.migrate(); } },
  hooks: { pre: [{ name: 'require-auth' }], post: [{ name: 'audit-log' }] },
} satisfies CapsuleDefinition;
```

## `.cap.ts` (Required)

```ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'create-order',
  kind: 'action',
  routes: [{ method: 'POST', path: '/orders', cap: 'create-order' }],
  inputSchema: { type: 'object', properties: { items: { type: 'array' } }, required: ['items'] },
  events: { publishes: ['order.created'] },
  hooks: { pre: ['require-auth'], post: [] },
};

export default async function createOrder(input: CapInput, ctx: CapContext) {
  const { items } = input.body;
  const order = await orderRepository.create(ctx.deps.database, { items });
  ctx.emit('order.created', { orderId: order.id });
  return { order };
}
```

## CapContext

```ts
ctx.deps              // Injected dependencies
ctx.emit(event, data)           // Fire-and-forget publish
ctx.invoke('capsule.cap', payload)  // RPC, returns result
ctx.tell('capsule.cap', payload)    // Fire-and-forget RPC
ctx.use(capsuleName)  // Capsule proxy
ctx.user              // Set by auth hooks
```

---

## Errors

```ts
throw new ValidationError('Bad input')    // 400
throw new NotFoundError('Missing')        // 404
throw new AuthorizationError('No access') // 403
throw new DependencyError('DB down')      // 503
throw new InternalError('Unexpected')     // 500
```

---

## Graduation Rule

1. **First cap** — write logic inline. No premature extraction.
2. **Second cap needs it** — graduate to `.rule.ts` (boolean), `.helper.ts` (pure), or `.repository.ts` (I/O).
3. **Never pre-extract.**

---

## ✅ Pre-Ship (12 checks)

- `capsule.ts` exists with `name` and `satisfies CapsuleDefinition`
- Every `.cap.ts` exports `meta` (with `name`, `kind`) AND `default` handler
- No `.cap.ts` imports another `.cap.ts`
- No `.cap.ts` exceeds 200 lines
- No pyramid violations
- No `utils.ts` / `shared.ts` / `common.ts`
- I/O only in `.repository.ts`
- Pure logic in `.helper.ts`, constraints in `.rule.ts`
- Errors extend built-in classes
- Constants use `as const`
- Event names past-tense
- Cross-cap calls use `ctx.invoke` / `ctx.emit` / `ctx.tell`

---

## 🧭 When In Doubt

| Question | Answer |
|---|---|
| Extract helper/rule now? | No. Inline first. Graduate on second use. |
| Cap call another cap directly? | No. Use `ctx.invoke` / `ctx.emit` / `ctx.tell`. |
| DB query location? | `.repository.ts` only. |
| Add `utils.ts`? | No. Use suffix convention. |
| `.cap.ts` > 200 lines? | Extract to `.repository.ts`, `.rule.ts`, or `.helper.ts`. |
| `.type.ts` import from `.helper.ts`? | No. Foundation imports nothing from above. |
| `.repository.ts` import from `.rule.ts`? | No. Imports `.type`/`.error`/`.constant` only. |
| Share state between caps? | `ctx.emit` + subscribe, or `ctx.deps`. |
| Auth on all caps? | Capsule-level hooks in `capsule.ts`. |
| Which error class? | `ValidationError`, `NotFoundError`, `AuthorizationError`, `InternalError`. Never raw `Error`. |
| Business logic in `capsule.ts`? | No. Logic in `.cap.ts`, graduating to rules/helpers/repositories. |
| Need data from another capsule? | `ctx.invoke('other-capsule.cap-name', payload)`. |
