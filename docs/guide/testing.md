# Testing

Testing CapsKit applications is straightforward because actions are pure functions. This guide covers unit testing actions, integration testing capsules, and mocking dependencies.

> **Note**: Testing works identically whether you use the Cap model or legacy manifest format. Action handlers are always pure functions — the loading format doesn't change how you test.

## Unit Testing Actions

Actions are simple `async` functions. Test them in isolation:

```ts
import { test, expect } from 'bun:test'
import createUser from '../../capsules/user/actions/create'

test('create user returns user object', async () => {
  const mockDb = {
    users: {
      create: async (data) => ({ id: '1', ...data })
    }
  }
  
  const deps = {
    database: mockDb,
    logger: { info: () => {} }
  }
  
  const ctx = {
    deps,
    emit: () => {},
    call: async () => ({}),
    use: () => ({})
  }
  
  const result = await createUser(
    { name: 'Alice', email: 'alice@example.com' },
    ctx
  )
  
  expect(result.user).toEqual({
    id: '1',
    name: 'Alice',
    email: 'alice@example.com'
  })
})
```

### Mocking Context

Create a helper for mock contexts:

```ts
// test/mock-context.ts
import type { ActionContext } from '@mobtakronio/capskit'

export function createMockContext(
  depsOverrides: Partial<ActionContext['deps']> = {}
): ActionContext {
  const defaultDeps = {
    database: { 
      users: { 
        create: async (u) => ({ id: '1', ...u }) 
      } 
    },
    logger: { info: () => {}, error: () => {} },
    config: { jwtSecret: 'test' }
  }
  
  return {
    deps: { ...defaultDeps, ...depsOverrides },
    emit: () => {},
    call: async () => ({ }),
    use: () => ({ })
  }
}
```

Now tests are cleaner:

```ts
import { createMockContext } from '../../../test/mock-context'

test('create user', async () => {
  const ctx = createMockContext()
  const result = await createUser({ name: 'Bob', email: 'bob@test.com' }, ctx)
  expect(result.user.email).toBe('bob@test.com')
})
```

## Testing Schema Validation

The kernel validates payloads against JSON Schema before invoking the handler. Test that invalid payloads throw `ValidationError`:

```ts
import { test, expect } from 'bun:test'
import { ValidationError } from '@mobtakronio/capskit'

test('create user validates required fields', async () => {
  const ctx = createMockContext()
  
  await expect(
    createUser({ name: 'Alice' }, ctx) // missing email
  ).rejects.toThrow(ValidationError)
})
```

For more detailed validation testing, invoke the kernel's validation directly:

```ts
import { validatePayload } from '@mobtakronio/capskit/kernel/validation'

test('schema validation', () => {
  const schema = {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' }
    },
    required: ['email']
  } as const
  
  const valid = validatePayload(schema, { email: 'test@example.com' })
  expect(valid).toBe(true)
  
  const invalid = validatePayload(schema, { name: 'Test' })
  expect(invalid).toBe(false)
})
```

## Testing Hooks

Hooks run before/after the handler. Test them in isolation:

```ts
import { test, expect } from 'bun:test'
import { preLog } from '../../capsules/user/hooks/preLog'
import { postTransform } from '../../capsules/user/hooks/postTransform'

test('preLog hook', async () => {
  const deps = { logger: { info: (msg) => { /* assertion */ } } }
  const ctx = { deps }
  
  await preLog({ body: { name: 'Alice' } }, ctx)
  // Assert logger was called
})

test('postTransform hook', async () => {
  const result = await postTransform(
    { body: { name: 'Alice' } },
    { user: { id: '1', name: 'Alice' } },
    { deps: {} }
  )
  
  expect(result).toEqual({ user: { id: '1', name: 'Alice', createdAt: expect.any(String) } })
})
```

## Integration Testing

Test the full action pipeline (including schema validation, hooks, interceptors):

```ts
import { test, expect } from 'bun:test'
import { createCapsKit } from '@mobtakronio/capskit'

test('full pipeline: create user', async () => {
  const { capskit } = await createCapsKit({
    capsules: [{ type: 'directory', path: './test-capsules/user' }],
    dependencies: {
      database: mockDb,
      logger: { info: () => {} }
    }
  })
  
  // Call through the kernel (full pipeline)
  const result = await capskit.use('user-capsule').create({
    name: 'Alice',
    email: 'alice@example.com'
  })
  
  expect(result.user).toMatchObject({
    name: 'Alice',
    email: 'alice@example.com'
  })
  
  await capskit.stop()
})
```

### With HTTP Adapter

Test complete HTTP request/response:

```ts
import { test, expect } from 'bun:test'
import { Elysia } from 'elysia'
import { createCapsKit } from '@mobtakronio/capskit'

test('POST /users returns 200', async () => {
  const { capskit } = await createCapsKit({
    capsules: [{ type: 'directory', path: './src/capsules' }],
    dependencies: { database: mockDb }
  })
  
  const { router } = await capskit.use('http').buildRouter({ adapter: 'elysia' })
  
  const app = new Elysia().use(router)
  
  const response = await app.request('/users')
    .post({ name: 'Alice', email: 'alice@example.com' })
  
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    user: { email: 'alice@example.com' }
  })
  
  await capskit.stop()
})
```

## Testing Events

Test that events are emitted correctly:

```ts
test('delete user emits user.deleted event', async () => {
  const emittedEvents: Array<{ event: string; data: any }> = []
  
  const ctx = {
    deps: { database: mockDb },
    emit: (event, data) => emittedEvents.push({ event, data }),
    call: async () => ({}),
    use: () => ({})
  }
  
  await deleteUser({ id: '123' }, ctx)
  
  expect(emittedEvents).toHaveLength(1)
  expect(emittedEvents[0]).toEqual({
    event: 'user.deleted',
    data: { userId: '123' }
  })
})
```

## Testing Interceptors

Test interceptors in isolation:

```ts
import { test, expect } from 'bun:test'
import { loggingInterceptor } from '../../kernel/interceptors/logging'

test('loggingInterceptor logs action and duration', async () => {
  const logs: string[] = []
  const logger = { info: (msg: string) => logs.push(msg) }
  
  const interceptor = loggingInterceptor({ logger })
  
  const result = await interceptor(
    'user.create',
    { name: 'Alice' },
    { deps: {} },
    async () => ({ user: { id: '1' } })
  )
  
  expect(result).toEqual({ user: { id: '1' } })
  expect(logs[0]).toContain('user.create')
  expect(logs[0]).toContain('duration')
})
```

## Testing Traits

Test trait handlers directly:

```ts
test('auth role trait grants access to admin', async () => {
  const traitHandler = (role, ctx) => {
    const userRole = ctx.deps.auth.currentUser().role
    if (userRole !== role) throw new AuthorizationError()
  }
  
  const ctx = {
    deps: {
      auth: { currentUser: () => ({ role: 'admin' }) }
    }
  }
  
  // Should not throw
  await expect(traitHandler('admin', ctx)).resolves.toBeUndefined()
})

test('auth role trait denies non-admin', async () => {
  const traitHandler = (role, ctx) => {
    const userRole = ctx.deps.auth.currentUser().role
    if (userRole !== role) throw new AuthorizationError()
  }
  
  const ctx = {
    deps: {
      auth: { currentUser: () => ({ role: 'user' }) }
    }
  }
  
  await expect(traitHandler('admin', ctx)).rejects.toThrow(AuthorizationError)
})
```

## Database Testing

For integration tests with real database:

```ts
import { test, expect } from 'bun:test'
import { Database } from '../database'

let db: Database

test.beforeEach(async () => {
  db = new Database('postgresql://localhost:5432/test')
  await db.migrate()
  await db.seed() // optional fixture data
})

test.afterEach(async () => {
  await db.disconnect()
})

test('create and retrieve user', async () => {
  const user = await db.users.create({ name: 'Alice', email: 'alice@test.com' })
  const found = await db.users.findById(user.id)
  expect(found.email).toBe('alice@test.com')
})
```

## End-to-End Testing

Simulate real usage scenarios:

```ts
test('user registration flow', async () => {
  // 1. Create user
  const createResult = await capskit.use('user-capsule').create({
    name: 'Alice',
    email: 'alice@example.com'
  })
  
  // 2. User receives welcome email (check event emitted)
  const emits: any[] = []
  capskit.on('event', (event, data) => emits.push({ event, data }))
  
  // 3. Verify user was created
  const getResult = await capskit.use('user-capsule').get({
    id: createResult.user.id
  })
  
  expect(getResult.user.name).toBe('Alice')
  expect(emits).toContainEqual({
    event: 'user.created',
    data: { userId: createResult.user.id }
  })
})
```

## Testing Best Practices

1. **Test one thing per test**—single assertion pattern
2. **Use descriptive test names**—`'should throw ValidationError when email missing'`
3. **Mock external services**—databases, APIs, Redis; use in-memory fakes
4. **Isolate state**—create fresh caps kit per test or use `beforeEach` cleanup
5. **Test error cases**—validation, not-found, auth failures
6. **Avoid testing internals**—test through public API (`call()`, `use()`)
7. **Setup/teardown**—clean resources after each test

## Recommended Libraries

- **Bun test** (included): Fast, built-in
- **Vitest**: Vite-powered, great DX
- **@vitest/coverage-v8**: Code coverage
- **sinon**: Advanced stubs/spies (if needed)
- **@faker-js/fake**: Realistic test data

## Troubleshooting

### "Cannot find module '@mobtakronio/capskit' in tests"

Use relative imports in tests or configure module aliasing:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfig from './tsconfig.json'

export default defineConfig({
  resolve: {
    alias: tsconfig.compilerOptions.paths
  }
})
```

### "Tests leak resources"

Ensure you're closing connections:

```ts
test.afterEach(async () => {
  await capskit.stop()
  await db.disconnect()
  await redis.disconnect()
})
```

### "Tests are flaky"

Common causes:
- Shared mutable state (use fresh caps kit per test)
- Unawaited async operations (always `await`)
- Race conditions in parallel tests (use `test.serial`)

## Next Steps

- **Architecture**: Review overall system design for testability
- **Dependencies**: Learn dependency mocking patterns
- **Interceptors**: Test global middleware behavior
- **Events**: Verify pub/sub flows
