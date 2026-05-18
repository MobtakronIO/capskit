# Errors

CapsKit provides a structured error model for predictable error handling across all adapters. This guide covers the error file conventions, built-in error classes, and custom error patterns.

---

## The errors.ts File Convention

Each capsule has an `errors.ts` file at its root for capsule-specific errors:

```ts
// capsules/orders/errors.ts
import { NotFoundError, ValidationError } from '@mobtakronio/capskit';

export const ORDER_ERRORS = {
  EMPTY_ITEMS: 'Order must contain at least one item',
  ALREADY_CANCELLED: 'Order is already cancelled',
  CANNOT_CANCEL_SHIPPED: 'Cannot cancel a shipped order',
} as const;

export class OrderNotFoundError extends NotFoundError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
  }
}

export class EmptyOrderError extends ValidationError {
  constructor() {
    super(ORDER_ERRORS.EMPTY_ITEMS);
  }
}
```

**Rule:** Error classes and error message constants only. No functions that do I/O. No imports from `.rule.ts`, `.helper.ts`, `.repository.ts`, or `.cap.ts`.

---

## Built-in Error Classes

CapsKit exports these base error classes from `@mobtakronio/capskit`:

| Error | Description | Typical HTTP Status |
|---|---|---|
| `CapsKitError` | Base for all CapsKit errors | — |
| `ValidationError` | Payload failed schema validation | 400 Bad Request |
| `NotFoundError` | Resource not found | 404 Not Found |
| `AuthorizationError` | Caller lacks required permissions | 403 Forbidden |
| `DependencyError` | Required dependency missing | 500/503 |
| `InternalError` | Unexpected internal error | 500 Internal Server Error |

---

## Error Class Pattern

Extend built-in errors for domain-specific errors:

```ts
import { NotFoundError, ValidationError, CapsKitError } from '@mobtakronio/capskit';

// Simple extension
export class OrderNotFoundError extends NotFoundError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
  }
}

// With additional context
export class InsufficientFundsError extends CapsKitError {
  constructor(
    public balance: number,
    public required: number,
  ) {
    super(`Insufficient funds: ${balance} < ${required}`);
    this.name = 'InsufficientFundsError';
  }
}
```

---

## Error Message Constants

Use `as const` for error message constants:

```ts
export const ORDER_ERRORS = {
  EMPTY_ITEMS: 'Order must contain at least one item',
  ALREADY_CANCELLED: 'Order is already cancelled',
  CANNOT_CANCEL_SHIPPED: 'Cannot cancel a shipped order',
  MAX_ITEMS_EXCEEDED: 'Order exceeds maximum item count',
} as const;
```

Benefits:
- **Single source of truth** — messages defined once, referenced everywhere.
- **Type-safe** — TypeScript infers literal types.
- **Easy to localize** — swap constants for i18n.

---

## Using Errors in Caps

```ts
// capsules/orders/caps/create-order.cap.ts
import { ValidationError } from '@mobtakronio/capskit';
import { ORDER_ERRORS, EmptyOrderError } from '../errors';
import { orderRepository } from '../repository/order.repository';

export default async function createOrder(input: CapInput, ctx: CapContext) {
  const items = input.body.items;

  if (!items || items.length === 0) {
    throw new EmptyOrderError();
  }

  const order = await orderRepository.create(ctx.deps.database, {
    items,
    status: 'pending',
  });

  if (!order) {
    throw new ValidationError('Failed to create order');
  }

  return { order };
}
```

---

## Error Handling in Adapters

Adapters map error types to protocol-specific responses:

### HTTP Adapter

```
ValidationError      → 400 Bad Request
NotFoundError        → 404 Not Found
AuthorizationError   → 403 Forbidden
DependencyError      → 500/503
Other CapsKitError   → 500 Internal Server Error
```

### WebSocket Adapter

Errors are sent as structured messages:

```json
{
  "type": "error",
  "code": "VALIDATION",
  "message": "Order must contain at least one item"
}
```

---

## Custom Error Mapping

Override the default error mapping in your adapter:

```ts
const adapter = await createHttpAdapter(capskit, {
  errorMapping: {
    ValidationError: { status: 422 },
    NotFoundError: { status: 404 },
    AuthorizationError: { status: 401 },
  },
});
```

---

## Testing Errors

Test error paths explicitly:

```ts
import { test, expect } from 'vitest';
import createOrder from './create-order.cap';
import { EmptyOrderError } from '../errors';

test('throws EmptyOrderError when items are empty', async () => {
  const ctx = createMockContext();
  const input = { body: { items: [] } };

  await expect(createOrder(input, ctx)).rejects.toThrow(EmptyOrderError);
});
```

---

## Best Practices

1. **Use specific error types** — don't throw generic `Error` for business logic.
2. **Extend built-in errors** — `NotFoundError`, `ValidationError`, `AuthorizationError`.
3. **Define error constants** — use `as const` for message strings.
4. **Include helpful messages** — what went wrong and how to fix it.
5. **Never expose internals** — don't leak stack traces or DB errors to clients.

---

## Next Steps

- [Capsules](./capsules.md) — Capsule structure and file conventions
- [Caps](./caps.md) — Cap handler signature
- [Testing](./testing.md) — Testing error paths
