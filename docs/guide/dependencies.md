# Dependencies

This guide covers the `CapsuleDefinition` format, auto-discovery, dependency declaration, factory capsules, and the boot order resolution.

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
| `boot.shutdown` | `(context) => Promise<void>` | No | Lifecycle hook run during shutdown |
| `caps` | `CapsuleCap[]` | No | Inline caps for factory-created capsules (no filesystem directory) |
| `hooks` | `{ pre?, post? }` | No | Hooks applied to all caps in this capsule |

---

## Two Capsule Patterns

### 1. Filesystem Capsules (auto-discovered)

For capsules that live on disk, place a `capsule.ts` at the root and `.cap.ts` files in a `caps/` subdirectory. The kernel auto-discovers all caps.

```
capsules/orders/
├── capsule.ts          # name, dependencies, boot
├── caps/
│   ├── create-order.cap.ts
│   ├── cancel-order.cap.ts
│   └── list-orders.cap.ts
├── repository/
│   └── order.repository.ts
└── types/
    └── order.type.ts
```

```ts
// capsules/orders/capsule.ts
export default {
  name: 'orders',
  dependencies: ['database'],
} satisfies CapsuleDefinition;
// caps auto-discovered from caps/ directory
```

### 2. Factory Capsules (inline caps)

For capsules created programmatically (e.g., database adapters, cache layers), include caps inline via the `caps` field. No filesystem needed.

```ts
import { CapsuleDefinition, CapsuleCap } from '@mobtakronio/capskit';

const myCaps: CapsuleCap[] = [
  {
    meta: { name: 'query' },
    handler: async (input, ctx) => {
      const repo = ctx.deps.myRepo;
      return repo.query(input.body);
    },
  },
];

export function createMyCapsule(config: MyConfig): CapsuleDefinition {
  return {
    name: 'my-capsule',
    caps: myCaps,
    boot: {
      init: async ({ deps }) => {
        // Create resources and store in deps flatly
        deps.myResource = await createResource(config);
        deps.myRepo = createMyRepository(deps.myResource);
      },
    },
  };
}
```

Register factory capsules before boot:

```ts
// Recommended: use createCapsKit() for one-call setup
const { capskit, shutdown } = await createCapsKit({
  capsules: [createMyCapsule({ /* config */ })],
});

// Or use the low-level platform API:
const platform = await createCapsKitPlatform();
platform.registerCapsule(createMyCapsule({ /* config */ }));
await platform.boot({ body: { capsuleDirs: [] } });
```

---

## Auto-Discovery

The kernel scans directories specified in `capsuleDirs` for `capsule.ts` files:

```ts
const { capskit, shutdown } = await createCapsKit({
  capsuleDirs: ['./caps', './packages/shared-capsules'],
});
```

Or using the low-level platform API:

```ts
const platform = await createCapsKitPlatform();
await platform.boot({
  body: { capsuleDirs: ['./caps', './packages/shared-capsules'] },
});
```

For each `capsule.ts` found, the kernel:

1. **Loads the capsule definition** — reads `name`, `dependencies`, `boot`.
2. **Scans the `caps/` directory** — auto-discovers all `.cap.ts` files.
3. **Imports each cap** — reads `meta` and `default` exports.
4. **Validates the cap meta** — checks name, required fields.

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

External services (databases, Redis, etc.) are injected via the `capsules` config:

```ts
const { capskit, shutdown } = await createCapsKit({
  capsuleDirs: ['./caps'],
  capsules: [createCapsule({ dialect: 'sqlite', connection: './db.sqlite' })],
});
```

Or using the low-level platform API:

```ts
const platform = await createCapsKitPlatform();
platform.registerCapsule(createCapsule({ dialect: 'sqlite', connection: './db.sqlite' }));
await platform.boot({ body: { capsuleDirs: ['./caps'] } });
```

Access them in any cap flatly via `ctx.deps`:

```ts
const repo = ctx.deps.drizzleRepo;
const order = await repo.query({ table: 'orders', operation: 'select' });
```

---

## The Repository Factory Pattern

Instead of passing `db` as the first argument to every repository function, use the factory pattern:

```ts
// repository/order.repository.ts
export function createOrderRepository(db: any) {
  return {
    async findById(id: string) {
      return db.orders.findUnique({ where: { id } });
    },
    async create(input: OrderInput) {
      return db.orders.create({ data: input });
    },
  };
}
```

Create the factory once in `boot.init` and store it in `deps`:

```ts
// capsule.ts
boot: {
  init: async ({ deps }) => {
    const db = await connectDatabase();
    deps.db = db;
    deps.orderRepo = createOrderRepository(db);
  },
}
```

Then use it in caps flatly:

```ts
// caps/list-orders.cap.ts
export default async function listOrders(_input: CapInput, ctx: CapContext) {
  const repo = ctx.deps.orderRepo;
  const orders = await repo.findWithFilters({ status: 'pending' });
  return { orders };
}
```

**Benefits:**
- No `db: any` parameter on every function
- Type-safe repository interface
- Easy to mock in tests
- Clear dependency lifecycle

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

const { capskit, shutdown } = await createCapsKit<MyDeps>({
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
