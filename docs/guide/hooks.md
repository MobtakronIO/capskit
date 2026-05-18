# Hooks

Hooks are caps with `kind: 'hook'` that wrap cap handlers in a middleware pipeline. They replace the legacy trait and hook systems with a transport-agnostic, declarative approach.

---

## What Are Hooks?

A hook is a `.cap.ts` file with `kind: 'hook'` in its meta. Hooks run in two phases:

- **Pre hooks** — run before the cap handler (auth, validation, logging)
- **Post hooks** — run after the cap handler (response transformation, audit logging)

Hooks are **transport-agnostic** — they work for HTTP, WebSocket, events, and `ctx.invoke()` calls.

---

## Writing a Hook Cap

A hook cap follows the same `.cap.ts` format as an action cap, but with `kind: 'hook'`:

```ts
// capsules/security/caps/require-auth.cap.ts
import { CapInput, CapContext, CapMeta, AuthorizationError } from '@mobtakronio/capskit';
import { decodeJWT } from '../helpers/decode-jwt.helper';
import { isTokenExpired } from '../rules/is-token-expired.rule';

export const meta: CapMeta = {
  name: 'require-auth',
  kind: 'hook',
};

export default async function requireAuth(input: CapInput, ctx: CapContext) {
  const token = input.headers?.authorization?.replace('Bearer ', '');
  if (!token) throw new AuthorizationError('Authentication required');
  const payload = decodeJWT(token);
  if (isTokenExpired(payload)) throw new AuthorizationError('Token expired');
  ctx.user = payload;
}
```

### Hook Meta Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Unique hook name |
| `kind` | `'hook'` | Yes | Identifies this as a hook cap |

---

## Capsule-Level Hooks

Define hooks once in `capsule.ts` to apply to **all caps** in that capsule:

```ts
// capsules/orders/capsule.ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: ['database'],
  hooks: {
    pre: [
      { name: 'require-auth' },           // applies to ALL caps in this capsule
      { name: 'validate-input', caps: ['create-order', 'update-order'] },  // specific caps only
    ],
    post: [
      { name: 'audit-log' },              // applies to ALL caps
    ],
  },
} satisfies CapsuleDefinition;
```

### CapsuleHook Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Hook cap name |
| `caps` | `string \| string[]` | `'*'` (all) | Which caps this hook applies to |

### Per-Cap Hooks Still Work

Capsule-level hooks merge with per-cap hooks. Capsule hooks run **first**, then cap-level hooks:

```ts
// capsules/orders/caps/delete-order.cap.ts
export const meta: CapMeta = {
  name: 'delete-order',
  kind: 'action',
  hooks: {
    post: ['notify-admin'],  // additional to capsule-level hooks
  },
};
```

Final pipeline for `delete-order`:
- **Pre**: `require-auth` (from capsule) → `validate-input` (from capsule, scoped to this cap)
- **Post**: `audit-log` (from capsule) → `notify-admin` (from cap)

---

## Referencing Hooks in Action Caps

Cap caps declare which hooks run before/after them in the `meta.hooks` object:

```ts
// capsules/orders/caps/delete-order.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'delete-order',
  kind: 'action',
  hooks: {
    pre: ['require-auth', 'require-admin-role'],
  },
  routes: [{ method: 'DELETE', path: '/orders/:id', cap: 'delete-order' }],
};

export default async function deleteOrder(input: CapInput, ctx: CapContext) {
  // Hooks have already run — ctx.user is set
  const { id } = input.params;
  // ... delete logic
  return { deleted: true };
}
```

The kernel resolves hook names at boot time and chains them before the cap handler.

---

## Hook Formats

### Pre Hooks Only (Object Format)

```ts
export const meta: CapMeta = {
  name: 'create-order',
  kind: 'action',
  hooks: {
    pre: ['require-auth', 'validate-input'],
  },
};
```

### Post Hooks

Post hooks run after the cap handler and receive the result via `ctx.result`:

```ts
// capsules/observability/caps/audit-log.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'audit-log',
  kind: 'hook',
};

export default async function auditLog(input: CapInput, ctx: CapContext) {
  const result = await ctx.next();
  ctx.deps.logger.info(`Action completed`, {
    cap: ctx.actionName,
    result: ctx.result,
  });
  return result;
}
```

```ts
// Cap cap using post hooks
export const meta: CapMeta = {
  name: 'delete-order',
  kind: 'action',
  hooks: {
    pre: ['require-auth'],
    post: ['audit-log'],
  },
};
```

### Both Phases

```ts
export const meta: CapMeta = {
  name: 'delete-order',
  kind: 'action',
  hooks: {
    pre: ['require-auth', 'rate-limit'],
    post: ['audit-log', 'notify-admin'],
  },
};
```

### Backward Compat (Array Format)

A plain array is treated as pre hooks only:

```ts
export const meta: CapMeta = {
  name: 'create-order',
  kind: 'action',
  hooks: ['require-auth', 'validate-input'], // treated as pre hooks
};
```

---

## The Hooks Pipeline

When an action is invoked, the kernel builds a Koa-style middleware dispatch chain:

```
Request → Pre Hook 1 → Pre Hook 2 → ... → Cap Handler → Post Hook 1 → Post Hook 2 → Response
```

### Execution Flow

```
1. Kernel resolves capsule-level hooks (filtered by caps field)
2. Kernel resolves cap-level hooks from meta.hooks
3. Kernel builds middleware chain: [capsulePre..., capPre..., handler, capPost..., capsulePost...]
4. Kernel dispatches through the chain
5. Each hook calls ctx.next() to continue
6. If any hook throws, the chain aborts
7. The cap handler runs between pre and post hooks
```

---

## Examples

### Auth Hook

```ts
// capsules/security/caps/require-auth.cap.ts
import { CapInput, CapContext, CapMeta, AuthorizationError } from '@mobtakronio/capskit';
import { decodeJWT } from '../helpers/decode-jwt.helper';

export const meta: CapMeta = {
  name: 'require-auth',
  kind: 'hook',
};

export default async function requireAuth(input: CapInput, ctx: CapContext) {
  const token = input.headers?.authorization?.replace('Bearer ', '');
  if (!token) throw new AuthorizationError('Authentication required');
  const payload = decodeJWT(token);
  ctx.user = payload;
}
```

### Logging Hook (Both Phases)

```ts
// capsules/observability/caps/log-request.cap.ts
import { CapInput, CapContext, CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'log-request',
  kind: 'hook',
};

export default async function logRequest(input: CapInput, ctx: CapContext) {
  const start = Date.now();
  ctx.deps.logger.info(`Action started`, { cap: ctx.actionName });

  const result = await ctx.next();

  const duration = Date.now() - start;
  ctx.deps.logger.info(`Action completed`, { cap: ctx.actionName, duration });

  return result;
}
```

### Role-Based Access Hook

```ts
// capsules/security/caps/require-role.cap.ts
import { CapInput, CapContext, CapMeta, AuthorizationError } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'require-admin-role',
  kind: 'hook',
};

export default async function requireAdminRole(input: CapInput, ctx: CapContext) {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new AuthorizationError('Admin role required');
  }
}
```

---

## Best Practices

1. **One concern per hook** — auth, logging, rate limiting should each be separate.
2. **Use capsule-level hooks for cross-cutting concerns** — define `require-auth` once in `capsule.ts` instead of repeating it on every cap.
3. **Scope capsule hooks with `caps`** — use `caps: ['create', 'update']` to target specific caps within a capsule.
4. **Throw specific errors** — use `AuthorizationError`, `ValidationError`, etc.
5. **Keep hooks under 200 lines** — same hard limit as action caps.
6. **Import from lower layers only** — helpers, rules, types, errors, constants.

---

## Next Steps

- [Capsules](./capsules.md) — Capsule structure and file conventions
- [Actions](./caps.md) — Action handler signature and cap file format
- [Events](./events.md) — Event-driven communication
