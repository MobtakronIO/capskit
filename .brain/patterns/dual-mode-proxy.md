# Pattern: Dual-Mode Callable Proxy (invoke/tell)

## Context
capskit needs a single `ctx.invoke` (and `ctx.tell`) that supports both:
1. Property-access style: `ctx.invoke.capsule.action(payload)`
2. Function-call style: `ctx.invoke('capsule.action', payload)`

## Solution
Implement `createInvokeProxy` / `createTellProxy` using `Proxy` with:
- `apply` trap for the function-call style
- `get` trap that returns a nested Proxy for `capsule` access, which itself has a `get` trap for `action` access, returning a bound function

## Key Insight
The Proxy target should be a no-op function so `typeof` returns `'function'`, but the object also has callable behavior. Tests must accept both `typeof === 'object'` and `typeof === 'function'` because Proxy around a function reports `'function'`.

## Code Sketch
```typescript
function createInvokeProxy(execute) {
  return new Proxy(() => {}, {
    apply(_target, _thisArg, args) {
      const [ref, payload, opts] = args;
      const [capsule, action] = ref.split('.');
      return execute(capsule, action, payload, opts);
    },
    get(_target, capsule) {
      return new Proxy(() => {}, {
        get(_, action) {
          return (payload, opts) => execute(capsule, action, payload, opts);
        }
      });
    }
  });
}
```

## Trade-offs
- `typeof` heuristics in tests are weak; consider adding `Symbol.for('capskit.invoke')` branding for stronger contract verification
- `tell` errors are swallowed via `console.error`; production code should route to a real logger or tracing span

## Related Files
- `packages/capskit/src/kernel/platform.ts`
- `packages/capskit/test/suites/invoke-tell.suite.ts`
