# Dependencies

Dependencies are external services injected into actions via `context.deps`. This guide covers dependency declaration, injection, testing, and best practices.

> **Note**: Examples use `createCapsKit` directly. In the Cap model, dependencies are declared the same way — only the capsule loading method differs (`caps-registry` vs legacy `manifest`). See [Capsules](./capsules.md) and [Loader](./loader.md).

## Declaring Dependencies

Dependencies are declared at boot time when creating the CapsKit instance:

```ts
import { createCapsKit } from '@mobtakronio/capskit'
import { Database } from './database'
import { Redis } from './redis'
import { Logger } from './logger'

const capskit = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }],
  dependencies: {
    database: new Database(),
    redis: new Redis(),
    logger: new Logger(),
    config: loadConfig()
  }
})
```

All dependencies are available in every action:

```ts
// any-capsule/actions/someAction.ts
export default async function someAction(payload, ctx) {
  const { database, redis, logger, config } = ctx.deps
  
  await database.query('INSERT ...')
  await redis.set('key', 'value')
  logger.debug('Action executed')
  
  return { ok: true }
}
```

## Type Safety

Use generics to type your dependencies:

```ts
interface MyDeps {
  database: Database
  redis: Redis
  logger: Logger
  config: Config
}

const capskit = await createCapsKit<MyDeps>({
  dependencies: { database, redis, logger, config }
})
```

Now `ctx.deps` is fully typed in all actions.

## Common Patterns

### Database

Inject a database client:

```ts
const capskit = await createCapsKit({
  dependencies: {
    database: new PostgresClient(process.env.DATABASE_URL)
  }
})
```

Actions use it directly:

```ts
export default async function getUsers(payload, ctx) {
  const users = await ctx.deps.database.query('SELECT * FROM users')
  return { users }
}
```

### Configuration

Pass configuration values:

```ts
const capskit = await createCapsKit({
  dependencies: {
    config: {
      api: {
        rateLimit: 100,
        timeout: 5000
      },
      smtp: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT)
      }
    }
  }
})
```

### Singletons

Dependencies are **singletons**—the same instance is shared across all actions. This is intentional for connection pooling, caching, etc.

```ts
// This is fine:
const capskit = await createCapsKit({
  dependencies: {
    redis: new Redis({ pool: true }) // shared connection pool
  }
})
```

## Testing with Mock Dependencies

Replace real dependencies with mocks for testing:

```ts
import { test, expect } from 'bun:test'
import * as userActions from '../capsules/user/actions'

test('create user', async () => {
  // Mock dependencies
  const mockDb = {
    users: {
      create: async (data) => ({ id: '1', ...data })
    }
  }
  
  const mockDeps = {
    database: mockDb,
    logger: { info: () => {} },
    config: { jwtSecret: 'test' }
  }
  
  const ctx = {
    deps: mockDeps,
    emit: () => {},
    call: async () => ({ }),
    use: () => ({ })
  }
  
  const result = await userActions.create(
    { name: 'Alice', email: 'alice@test.com' },
    ctx
  )
  
  expect(result.user.id).toBe('1')
  expect(result.user.name).toBe('Alice')
})
```

### Using a Test Helper

Create a test utilities module:

```ts
// test/mock-context.ts
import type { ActionContext } from '@mobtakronio/capskit'

export function createMockContext(
  overrides: Partial<ActionContext['deps']> = {}
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
    deps: { ...defaultDeps, ...overrides },
    emit: () => {},
    call: async () => ({ }),
    use: () => ({ })
  }
}

// test/capsules/user/actions/create.test.ts
import { createMockContext } from '../../../../test/mock-context'
import create from './create'

test('creates user', async () => {
  const ctx = createMockContext()
  const result = await create(
    { name: 'Bob', email: 'bob@test.com' },
    ctx
  )
  expect(result.user.email).toBe('bob@test.com')
})
```

## Advanced: Lazy Initialization

Sometimes dependencies need async initialization:

```ts
const capskit = await createCapsKit({
  capsules: [...],
  dependencies: {
    // Sync dependencies are passed directly
    config: loadConfig(),
    
    // Async dependencies can be initialized in a boot action
  }
})

// Use boot action to set up async deps
await capskit.call('system.initialize')
```

In your initialization capsule:

```ts
// system-capsule/actions/initialize.ts
export default async function initialize(payload, ctx) {
  const db = await Database.connect(process.env.DATABASE_URL)
  const redis = await Redis.connect(process.env.REDIS_URL)
  
  // Attach to capskit singleton (or store in a shared state)
  ctx.deps.database = db
  ctx.deps.redis = redis
  
  return { initialized: true }
}
```

Alternatively, use dependency injection containers like `bottle` or `typedi` for more complex scenarios.

## Best Practices

1. **Declare all dependencies explicitly** in `createCapsKit()`. Avoid circular dependencies.
2. **Use interfaces** for dependency objects to enable mocking.
3. **Keep dependencies stateless** where possible. State should live in databases, caches, etc.
4. **Document each dependency** in your project's README or架构文档.
5. **Mock thoroughly** in tests. Actions shouldn't depend on real databases in unit tests.

## Troubleshooting

### "Dependency not found"

```
Error: Required dependency 'database' not provided
```

Solution: Ensure you passed it in `createCapsKit()`:

```ts
createCapsKit({
  dependencies: {
    database: myDatabaseInstance // ✓
  }
})
```

### "ctx.deps is undefined in action"

Make sure the action signature is correct:

```ts
// ✓ Correct
export default async function handler(payload, ctx) { ... }

// ✗ Missing ctx
export default async function handler(payload) { ... }
```

### "Cannot mutate deps in action"

Dependencies are read-only during action execution. If you need to dynamically attach resources (e.g., per-request DB connection), use a factory pattern in your dependency:

```ts
const dbFactory = {
  getConnection: () => new Database(ctx.deps.config)
}

// In action:
const db = ctx.deps.dbFactory.getConnection()
```

## Next Steps

- **Actions**: Deep dive into action implementation patterns
- **Events**: Decouple with pub/sub
- **Interceptors**: Add cross-cutting concerns globally
- **Adapters**: Learn how adapters inject additional context
