# Dependencies

This guide covers the `CapsuleDefinition` format, auto-discovery, dependency declaration, and the boot order resolution.

---

## CapsuleDefinition

Every capsule is defined by a single `capsule.ts` file at its root:

```ts
import { CapsuleDefinition } from '@mobtakronio/capskit';

export default {
  name: 'orders',
  dependencies: ['database', 'payment-gateway'],
  boot: {
    init: async ({ deps }) => {
      await deps.database.migrate();
    },
  },
} satisfies CapsuleDefinition;
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Unique capsule identifier |
| `dependencies` | `string[]` | No | Names of other capsules this capsule depends on |
| `boot.init` | `(context) => Promise<void>` | No | Lifecycle hook run during boot |

**What does NOT go here:** cap references (auto-discovered from `caps/`), business logic, handlers.

---

## Auto-Discovery

The kernel scans directories specified in `capsuleDirs` for `capsule.ts` files:

```ts
const platform = await createCapsKitPlatform({
  capsuleDirs: ['./caps', './packages/shared-capsules'],
});
```

For each `capsule.ts` found, the kernel:

1. **Loads the capsule definition** — reads `name`, `dependencies`, `boot`.
2. **Scans the `caps/` directory** — auto-discovers all `.cap.ts` files.
3. **Imports each cap** — reads `meta` and `default` exports.
4. **Validates the cap meta** — checks name, kind, required fields.

No manual cap listing. Just directories and files.

---

## Dependency Declaration

Dependencies are declared in the `dependencies` array of `CapsuleDefinition`:

```ts
export default {
  name: 'orders',
  dependencies: ['database', 'payment-gateway'],
} satisfies CapsuleDefinition;
```

These are **capsule names**, not npm packages. The kernel resolves them by matching against loaded capsule names.

### External Dependencies

External services (databases, Redis, etc.) are injected via the `dependencies` config:

```ts
const platform = await createCapsKitPlatform({
  capsuleDirs: ['./caps'],
  dependencies: {
    database: createDatabaseConnection(),
    'jwt-secret': process.env.JWT_SECRET,
  },
});
```

Access them in any cap via `ctx.deps`:

```ts
const order = await orderRepository.create(ctx.deps.database, input);
```

---

## Circular Dependency Detection

The kernel validates the dependency graph at boot. If a circular dependency is detected, boot fails with a clear error:

```
Circular dependency detected: orders → payment-gateway → orders
```

### Dependency Graph Validation

The kernel runs these checks:

1. **All declared dependencies exist** — every name in `dependencies` must match a loaded capsule.
2. **No circular dependencies** — the dependency graph must be a DAG (directed acyclic graph).
3. **No self-dependencies** — a capsule cannot depend on itself.

---

## Topological Boot Order

Capsules are booted in **topological order** — dependencies first, dependents later:

```
1. kernel        (no dependencies)
2. events        (no dependencies)
3. http          (no dependencies)
4. websocket     (no dependencies)
5. system        (no dependencies)
6. database      (no dependencies — user capsule)
7. orders        (depends on: database)
8. notifications (depends on: orders, events)
```

If capsule A depends on capsule B, B's boot lifecycle runs before A's.

---

## Type Safety

Use generics to type your dependencies:

```ts
interface MyDeps {
  database: Database;
  logger: Logger;
}

const platform = await createCapsKitPlatform<MyDeps>({
  capsuleDirs: ['./caps'],
  dependencies: {
    database: createDatabaseConnection(),
    logger: createLogger(),
  },
});
```

Now `ctx.deps` is fully typed in all caps.

---

## Next Steps

- [Capsules](./capsules.md) — Capsule structure and file conventions
- [Conventions](./conventions.md) — File suffix reference and dependency pyramid
- [Architecture](./architecture.md) — System-level view
