# Migration Guide: `call()` to `use().action()`

This guide helps you migrate from direct `capskit.call()` usage to the recommended `capskit.use('capsule').action()` pattern.

> **Note**: This guide covers the `call()` → `use()` API migration. For migrating from the legacy `manifest.ts` format to the **Cap model** (`caps.ts` + `.cap/` directories), see the [Cap model migration guide](../capsules.md#migration-guide-manifest--cap-model). In the Cap model, `ctx.call()` becomes `ctx.invoke()` for RPC and `ctx.tell()` for fire-and-forget.

## Why Migrate?

| Aspect | `capskit.call('x.y', payload)` | `capsule.action(payload)` |
|--------|--------------------------------|-------------------------|
| Type Safety | ❌ String-based, no IDE support | ✅ Typed, full IDE autocompletion |
| Refactoring | ❌ Manual string updates | ✅ Rename refactoring works |
| Discoverability | ❌ Must know action name | ✅ Auto-discover available actions |
| Error Detection | ❌ Runtime errors only | ✅ Compile-time errors possible |
| Code Clarity | ❌ Verbose with string literals | ✅ Natural, object-like syntax |

## Quick Reference

### Before → After

```ts
// ❌ Before (direct call)
const result = await capskit.call('users.create', { 
  email: 'test@example.com',
  name: 'Test User'
});

// ✅ After (use + action)
const users = capskit.use('users');
const result = await users.create({ 
  email: 'test@example.com',
  name: 'Test User'
});
```

## Step-by-Step Migration

### 1. Identify `call()` Usage

Search your codebase for direct `call()` usage:

```bash
# Find all capskit.call() usages
grep -r "\.call('" --include="*.ts" src/
```

### 2. Replace with `use().action()`

For each `capskit.call('capsule.action', payload)`:

1. Extract the `capsule` name (before the dot)
2. Extract the `action` name (after the dot)
3. Create a client with `capskit.use('capsule')`
4. Call the action as a method

**Example transformation:**

```ts
// ❌ Before
const user = await capskit.call('users.get', { id: '123' });
const users = await capskit.call('users.list', {});
await capskit.call('users.delete', { id: '123' });

// ✅ After
const users = capskit.use('users');
const user = await users.get({ id: '123' });
const allUsers = await users.list({});
await users.delete({ id: '123' });
```

### 3. Update Action Handlers

Inside action handlers, use `context.use()` instead of `context.call()`:

```ts
// ❌ Before (inside action handler)
export async function createOrder(payload, ctx) {
  const user = await ctx.call('users.get', { id: payload.userId });
  const payment = await ctx.call('payments.create', { amount: payload.amount });
  // ...
}

// ✅ After
export async function createOrder(payload, ctx) {
  const users = ctx.use('users');
  const payments = ctx.use('payments');
  
  const user = await users.get({ id: payload.userId });
  const payment = await payments.create({ amount: payload.amount });
  // ...
}
```

### 4. Type Your Clients

For better TypeScript support, define client types:

```ts
// types/users.ts
export type UsersClient = {
  get: (payload: { id: string }) => Promise<User>;
  create: (payload: CreateUserInput) => Promise<User>;
  list: (payload?: ListUsersInput) => Promise<User[]>;
  delete: (payload: { id: string }) => Promise<void>;
};

// In your action handler
const users = ctx.use<UsersClient>('users');
```

## Configuration

### Lint Rule Setup

Add the ESLint rule to catch any remaining `call()` usage:

```js
// eslint.config.js
import { capsKitLintRules } from '@mobtakronio/capskit/lint';

export default [
  {
    files: ['**/*.ts'],
    rules: {
      ...capsKitLintRules,
    },
  },
];
```

### Runtime Warning Setup

Enable dev-mode warnings to catch accidental `call()` usage:

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit } = await createCapsKit({
  capsules: [...],
  dependencies: {...},
  // Enable warnings during development
  warnOnDirectCall: process.env.NODE_ENV !== 'production',
});

// Now any capskit.call() usage will emit a warning:
// [CapsKit] Warning: Direct `capskit.call('users.create', ...)` usage detected.
//   Prefer `capskit.use('users').create(...)` instead.
```

## Allowed Exceptions

Some use cases legitimately need `call()`:

### Dynamic Action Names

When the action name is determined at runtime:

```ts
// ✅ Allowed - dynamic action name
async function invokeAction(actionName: string, payload: any) {
  // Cannot use use().action() when name is dynamic
  return capskit.call(actionName, payload);
}
```

### System/Internal Capsules

Certain system capsules may need direct access:

```ts
// System capsules are allowed by default in the lint rule
// No change needed for:
capskit.call('system.getHealth', {});
capskit.call('http.buildRouter', {});
capskit.call('websocket.buildSocket', {});
```

To customize the allowlist:

```js
// eslint.config.js
export default [
  {
    rules: {
      '@capskit/no-direct-call': ['warn', {
        allowList: ['system', 'http', 'websocket', 'my-internal-capsule'],
      }],
    },
  },
];
```

## Automated Migration

For large codebases, consider using jscodeshift or a custom AST transformer:

```bash
# Example: codemod script concept
# Transform capskit.call('x.y', z) → { const x = capskit.use('x'); x.y(z) }
```

## Further Reading

- [Capsule Clients](../guide/clients.md) - Complete guide to capsule clients
- [API Reference](../guide/actions.md) - Action handler documentation
- [Architecture](../guide/architecture.md) - System architecture overview
