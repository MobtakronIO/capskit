# Error Handling

CapsKit provides a structured error model for predictable error handling across adapters. This guide covers the built-in error types, custom errors, and error mapping strategies.

## Error Hierarchy

```
Error (base)
├── CapsKitError (base for all CapsKit errors)
│   ├── ValidationError
│   ├── NotFoundError
│   ├── DependencyError
│   ├── AuthorizationError
│   └── TraitError
└── (any other Error types)
```

### Built-in Errors

| Error | Description | Typical HTTP Status |
| :--- | :--- | :--- |
| `ValidationError` | Payload failed schema validation | 400 Bad Request |
| `NotFoundError` | Action, capsule, or resource not found | 404 Not Found |
| `DependencyError` | Required dependency missing or failed | 500/503 |
| `AuthorizationError` | Caller lacks required permissions | 403 Forbidden |
| `TraitError` | Trait handler threw or validation failed | 403/400 |

## When Errors Are Thrown

### 1. Kernel-Level Errors

Thrown during boot/initialization:

```ts
try {
  await capskit.start()
} catch (err) {
  if (err instanceof DependencyError) {
    console.error('Missing dependency:', err.message)
  }
  if (err instanceof ValidationError) {
    console.error('Invalid manifest:', err.details)
  }
}
```

### 2. Action-Level Errors

Thrown inside an action handler, hook, or interceptor:

```ts
export default async function deleteUser(payload, ctx) {
  const user = await ctx.deps.db.findById(payload.id)
  if (!user) throw new NotFoundError('User not found')
  
  if (!canDelete(ctx.deps.currentUser, user)) {
    throw new AuthorizationError('Insufficient permissions')
  }
  
  await ctx.deps.db.delete(payload.id)
  return { deleted: true }
}
```

Errors propagate:
- Up through interceptor chains
- Out through post hooks
- To the adapter (which maps to appropriate response)

## Error Mapping

Adapters map error types to protocol-specific responses:

### HTTP Adapter

```ts
// Default mapping
ValidationError → 400 Bad Request + { error: { code: 'VALIDATION', details } }
NotFoundError → 404 Not Found + { error: { code: 'NOT_FOUND' } }
AuthorizationError → 403 Forbidden + { error: { code: 'FORBIDDEN' } }
TraitError → 403/400 + { error: { code: 'TRAIT_FAILED' } }
DependencyError → 500/503 + { error: { code: 'DEPENDENCY_FAILED' } }
Other Error → 500 Internal Server Error + { error: { message } }
```

Customize the mapping:

```ts
import { Elysia } from 'elysia'
import { errorHandler } from '@mobtakronio/capskit/adapters/elysia'

const app = new Elysia()
  .use(
    errorHandler({
      mapError: (err) => {
        if (err instanceof ValidationError) {
          return { status: 422, body: { error: err.details } }
        }
        if (err instanceof AuthorizationError) {
          return { status: 401, body: { error: 'UNAUTHORIZED' } }
        }
        return { status: 500, body: { error: err.message } }
      }
    })
  )
```

### WebSocket Adapter

Errors are sent as structured messages:

```json
{
  "type": "error",
  "code": "VALIDATION",
  "message": "Invalid payload",
  "details": { ... }
}
```

### Internal `call()` / `use()`

Errors thrown by the callee propagate to the caller:

```ts
try {
  await ctx.call('user-capsule.delete', { id: '123' })
} catch (err) {
  if (err instanceof NotFoundError) {
    // Handle not found case
  }
}
```

## Validation Errors

`ValidationError` includes detailed schema validation information:

```ts
try {
  await capskit.call('user-capsule.create', {
    name: 'Al',      // too short
    email: 'invalid' // not an email
  })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.details)
    // {
    //   errors: [
    //     { path: ['name'], message: 'String is too short (min 2)' },
    //     { path: ['email'], message: 'Must be a valid email' }
    //   ]
    // }
  }
}
```

`err.details` contains an array of ` Ajv`-style validation errors.

## Custom Error Types

Extend `CapsKitError` for domain-specific errors:

```ts
import { CapsKitError } from '@mobtakronio/capskit'

export class InsufficientFundsError extends CapsKitError {
  constructor(
    public balance: number,
    public required: number,
    public accountId: string
  ) {
    super(`Insufficient funds: ${balance} < ${required}`)
    this.code = 'INSUFFICIENT_FUNDS'
  }
}

// In action:
if (balance < amount) {
  throw new InsufficientFundsError(balance, amount, accountId)
}
```

Custom errors preserve `code` and `status` properties for adapter mapping.

## Global Error Handlers (Interceptors)

Use **interceptors** for cross-cutting error handling:

```ts
const capskit = await createCapsKit({
  interceptors: [
    async (action, payload, ctx, next) => {
      try {
        return await next()
      } catch (err) {
        // Log all errors
        ctx.deps.logger.error('Action failed', {
          action,
          error: err.message,
          stack: err.stack
        })
        
        // Transform error
        if (err instanceof NotFoundError) {
          return { notFound: true }
        }
        
        throw err // re-throw
      }
    }
  ]
})
```

## Hooks and Errors

- **Pre hooks**: If a pre-hook throws, the handler never runs.
- **Post hooks**: If a post-hook throws, the result is lost and error propagates.

```ts
{
  actions: {
    delete: {
      handler: './actions/delete',
      pre: [
        async (input, ctx) => {
          // This aborts execution if it throws
          if (!ctx.deps.auth.canDelete()) {
            throw new AuthorizationError()
          }
        }
      ],
      post: [
        async (input, result, ctx) => {
          // If this throws, the original result is lost
          await ctx.deps.analytics.track('delete', input.body.id)
        }
      ]
    }
  }
}
```

## Adapter Error Mapping

### Customizing HTTP Status Codes

```ts
import { createHttpAdapter, type ErrorMapping } from '@mobtakronio/capskit/adapters/elysia'

const adapter = await createHttpAdapter(capskit, {
  errorMapping: {
    [ValidationError.name]: { status: 422 },
    [NotFoundError.name]: { status: 404 },
    [AuthorizationError.name]: { status: 403 },
    [DependencyError.name]: { status: 503 }
  }
})
```

### Error Response Format

Default HTTP error response:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Payload validation failed",
    "details": {
      "errors": [
        { "path": ["email"], "message": "Must be a valid email" }
      ]
    }
  }
}
```

Customize with a formatter:

```ts
const adapter = await createHttpAdapter(capskit, {
  formatError: (err) => ({
    success: false,
    error: {
      type: err.constructor.name,
      code: err.code || 'UNKNOWN',
      message: err.message,
      // Omit stack traces in production
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  })
})
```

## Testing Error Cases

Test error paths explicitly:

```ts
import { test, expect } from 'bun:test'
import deleteUser from '../capsules/user/actions/delete'

test('throws NotFoundError when user does not exist', async () => {
  const mockDb = {
    findById: async () => null
  }
  const ctx = createMockContext({ database: mockDb })
  
  await expect(
    deleteUser({ id: 'nonexistent' }, ctx)
  ).rejects.toThrow(NotFoundError)
})

test('throws AuthorizationError when unauthorized', async () => {
  const mockAuth = { canDelete: () => false }
  const ctx = createMockContext({ auth: mockAuth })
  
  await expect(
    deleteUser({ id: '123' }, ctx)
  ).rejects.toThrow(AuthorizationError)
})
```

## Best Practices

1. **Use specific error types**—don't throw generic `Error` for business logic failures.
2. **Include helpful messages**—what went wrong and (ideally) how to fix it.
3. **Preserve error codes**—for client-side error handling.
4. **Log server-side**—error details for debugging, but don't expose internals to clients.
5. **Handle expected errors** in clients (e.g., show validation messages).

## Troubleshooting

### "Unhandled error in action"

If an action throws and you see an unhandled rejection:

- Ensure you're not silently catching and ignoring errors
- Check interceptor chains—a post-hook might be re-throwing
- Verify the adapter has an error handler middleware

### "Error status is 500 for validation errors"

ValidationErrors should map to 400/422. If you see 500:

- Check that `ValidationError` is thrown directly (not wrapped)
- Verify error mapping configuration in adapter
- Ensure you're using the built-in `ValidationError` class, not custom

## Next Steps

- **Adapters**: Learn how errors are mapped per-protocol
- **Interceptors**: Add global error logging/reporting
- **Testing**: Comprehensive error case coverage
