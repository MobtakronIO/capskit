# API Steering Pattern

> Steer public API usage to `use().action()` while guarding internal `call()` with lint and runtime warnings.

## Core Pattern

```typescript
// ✅ Canonical public API - use this in app code
const result = await capskit.use('myCapsule').myAction({ input: 'value' });

// ❌ Direct call - discouraged for app code, allowed for internals
const result = await capskit.call('myCapsule.myAction', { input: 'value' });
```

## Why Steering?

1. **Discovery** - `use('x')` autocomplete reveals all capsules
2. **Type Safety** - `use()` return type includes all actions
3. **Intent** - `use()` signals explicit capsule access
4. **Guards** - Lint/runtime can distinguish public from internal

## Implementation

### 1. Runtime Guard Flag

The `use()` proxy passes `{ fromUse: true }` internally:

```typescript
// kernel/platform.ts
export function use(capsule: string) {
  return new Proxy({}, {
    get(_, action) {
      return (payload: any) => 
        this.#kernel.call(`${capsule}.${String(action)}`, payload, { fromUse: true });
    }
  });
}
```

### 2. Lint Rule

Flag direct `capskit.call()` in non-internal files:

```typescript
// lint/no-direct-call.ts
export const noDirectCall = {
  create(context) {
    return {
      CallExpression(node) {
        if (isCapskitCall(node) && !isInInternalFile(context))
          context.report({ node, message: 'Use use().action() instead' });
      }
    };
  }
};
```

### 3. Configurable Warning

```typescript
capskit.init({
  warnOnDirectCall: true  // Warns in dev, off in prod
});
```

## Lint Configuration

```javascript
// eslint.config.js or eslint/capskit.js
module.exports = {
  rules: {
    'capskit/no-direct-call': 'warn'  // or 'error'
  }
};
```

## Internal Allowlist

Some files are allowed to use `call()` directly:

```typescript
// Lint rule checks file path
const INTERNAL_PATHS = [
  /\/kernel\//,
  /\/system-/
];

const isInternalFile = (filename: string) => 
  INTERNAL_PATHS.some(p => p.test(filename));
```

## Key Insight

API steering creates a **contract between library and user code**:
- Public API (`use().action()`) - stable, supported
- Internal API (`call()`) - can change without notice

Lint rules enforce this contract at build time; runtime warnings catch dynamic calls.

(End of file - total 70 lines)