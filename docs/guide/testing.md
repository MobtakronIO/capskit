# Testing

CapsKit applications are highly testable because caps are functions, rules are pure, and helpers have no I/O. This guide covers testing at every layer.

---

## Testing Pure Functions

### Testing Helpers

Helpers are pure functions — no I/O, no `ctx.deps`. Test them directly:

```ts
import { test, expect } from 'vitest';
import { calculateTotal } from './calculate-total.helper';

test('calculates total from items', () => {
  const items = [
    { price: 10, quantity: 2 },
    { price: 5, quantity: 3 },
  ];
  expect(calculateTotal(items)).toBe(35);
});

test('applies discount', () => {
  const items = [{ price: 100, quantity: 1 }];
  expect(calculateTotal(items, 20)).toBe(80);
});

test('discount cannot make total negative', () => {
  const items = [{ price: 10, quantity: 1 }];
  expect(calculateTotal(items, 100)).toBe(0);
});
```

### Testing Rules

Rules return `boolean` or throw. Test both paths:

```ts
import { test, expect } from 'vitest';
import { canCancel } from './can-cancel.rule';

test('can cancel a pending order', () => {
  const order = { status: 'pending' };
  expect(canCancel(order as any)).toBe(true);
});

test('cannot cancel a shipped order', () => {
  const order = { status: 'shipped' };
  expect(canCancel(order as any)).toBe(false);
});

test('cannot cancel an already cancelled order', () => {
  const order = { status: 'cancelled' };
  expect(canCancel(order as any)).toBe(false);
});
```

---

## Mocking CapContext for Cap Testing

Create a mock context helper:

```ts
// test/mock-context.ts
import type { CapContext } from '@mobtakronio/capskit';

export function createMockContext(
  overrides: Partial<CapContext> = {}
): CapContext {
  return {
    deps: {
      database: {
        orders: {
          create: async (data: any) => ({ id: '1', ...data }),
          findById: async (id: string) => ({ id, status: 'pending' }),
        },
      },
      logger: { info: () => {}, error: () => {} },
    },
    emit: () => {},
    invoke: async () => ({}),
    tell: () => {},
    use: () => ({}) as any,
    ...overrides,
  };
}
```

Now test caps cleanly:

```ts
import { test, expect, vi } from 'vitest';
import createOrder from './create-order.cap';
import { createMockContext } from '../../../test/mock-context';

test('creates an order and emits event', async () => {
  const emitted: Array<{ event: string; data: any }> = [];
  const ctx = createMockContext({
    emit: (event, data) => emitted.push({ event, data }),
  });

  const input = {
    body: {
      items: [{ price: 10, quantity: 2 }],
      discount: 5,
    },
  };

  const result = await createOrder(input, ctx);

  expect(result.order).toBeDefined();
  expect(emitted).toContainEqual({
    event: 'order.created',
    data: { orderId: '1' },
  });
});
```

---

## Testing Repository Functions with Mock DB

Repository functions accept a DB client as their first argument. Pass a mock:

```ts
import { test, expect, vi } from 'vitest';
import { orderRepository } from './order.repository';

test('creates an order', async () => {
  const mockDb = {
    orders: {
      create: vi.fn().mockResolvedValue({ id: '1', items: [], total: 20 }),
    },
  };

  const result = await orderRepository.create(mockDb, {
    items: [],
    total: 20,
    status: 'pending',
  });

  expect(mockDb.orders.create).toHaveBeenCalledWith({
    data: { items: [], total: 20, status: 'pending' },
  });
  expect(result.id).toBe('1');
});

test('returns null when order not found', async () => {
  const mockDb = {
    orders: {
      findById: vi.fn().mockResolvedValue(null),
    },
  };

  const result = await orderRepository.findById(mockDb, 'nonexistent');
  expect(result).toBeNull();
});
```

---

## Testing Hook Chains

Test hooks in isolation by calling them directly:

```ts
import { test, expect, vi } from 'vitest';
import requireAuth from './require-auth.cap';
import { AuthorizationError } from '@mobtakronio/capskit';

test('throws when no token provided', async () => {
  const ctx = { user: undefined } as any;
  const input = { headers: {} };

  await expect(requireAuth(input, ctx)).rejects.toThrow(AuthorizationError);
});

test('sets ctx.user when valid token provided', async () => {
  const ctx = { user: undefined } as any;
  const input = {
    headers: { authorization: 'Bearer valid-token' },
  };

  await requireAuth(input, ctx);
  expect(ctx.user).toBeDefined();
});
```

---

## Integration Testing with createCapsKitPlatform

Test the full pipeline including boot, hook resolution, and cap execution:

```ts
import { test, expect } from 'vitest';
import { createCapsKitPlatform } from '@mobtakronio/capskit';

test('full pipeline: create order', async () => {
  const platform = await createCapsKitPlatform({
    capsuleDirs: ['./test-caps'],
    dependencies: {
      database: {
        orders: {
          create: async (data: any) => ({ id: '1', ...data }),
        },
      },
    },
  });

  const result = await platform.call('orders.create-order', {
    body: { items: [{ price: 10, quantity: 2 }] },
  });

  expect(result.order).toBeDefined();
});
```

---

## Using @mobtakronio/capskit-testing

The testing package provides utilities for common testing patterns:

```ts
import { test, expect } from 'vitest';
import { createTestPlatform, mockDeps } from '@mobtakronio/capskit-testing';
import createOrder from './create-order.cap';

test('with test helper', async () => {
  const { platform, ctx } = await createTestPlatform({
    capsuleDirs: ['./test-caps'],
    deps: mockDeps({
      database: {
        orders: { create: async (d: any) => ({ id: '1', ...d }) },
      },
    }),
  });

  const result = await platform.call('orders.create-order', {
    body: { items: [{ price: 10, quantity: 2 }] },
  });

  expect(result.order.id).toBe('1');
});
```

---

## Testing Best Practices

1. **Test pure functions directly** — helpers and rules need no mocking.
2. **Mock CapContext for cap tests** — use `createMockContext`.
3. **Mock DB for repository tests** — pass mock DB as first argument.
4. **Test error paths** — validation failures, not-found, auth errors.
5. **One assertion per test** — clear, focused test cases.
6. **Fresh instance per test** — no shared mutable state between tests.

---

## Next Steps

- [Capsules](./capsules.md) — Capsule structure and file conventions
- [Hooks](./hooks.md) — Cross-cutting concerns as caps
- [Dependencies](./dependencies.md) — CapsuleDefinition and auto-discovery
