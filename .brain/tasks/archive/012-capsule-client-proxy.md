---
title: Implement Capsule Client Proxy (capskit.use)
type: feature
status: done
created: 2026-03-11
---

## Objective
Implement a "Capsule Client" pattern within the `CapsKit` core to greatly improve developer experience and code readability when calling internal capabilities. Instead of relying purely on string-concatenated event paths, developers can instantiate a proxy client for a specific capsule.

## Plan
1. Update `ICapsKit` interface in `src/types.ts` to include:
   - `use(capsuleName: string): any;`
   - `describe(capsuleName: string): any;`
2. Implement `use(capsuleName: string)` inside `src/kernel/platform.ts`:
   - It will return a Javascript `Proxy`.
   - The Proxy's `get(target, prop)` trap will intercept action calls (e.g., `client.sum`) and transparently map them to `this.call('${capsuleName}.${prop}', payload)`.
3. Implement `describe(capsuleName: string)` to return the parsed manifest or specific capability definitions of that capsule, providing instant introspection.
4. Refactor `verify.test.ts` to utilize `capskit.use('capskit-calculator')` to prove the design is working natively.

## Tasks
- [x] Add `use()` and `describe()` signatures to `ICapsKit` interface.
- [x] Implement `use()` Proxy factory in `CapsKit` class.
- [x] Implement `describe()` in `CapsKit` class resolving the internal `manifests` map.
- [x] Convert tests in `verify.test.ts` to use the new `.use()` method.

## Discussion / Benefits
This completely abstracts away the "event bus" string path architecture (`'calculator.sum'`) for direct application usage:
```ts
const calculator = capskit.use("capskit-calculator");
await calculator.sum({ a: 1, b: 2 });
```
To achieve strict TypeScript safety, generic overrides can theoretically be applied later: `capskit.use<CalculatorInterface>('calculator')`.
