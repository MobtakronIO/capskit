# Interceptors

Interceptors are global middleware that wrap every action call in the system. They're perfect for cross-cutting concerns like logging, metrics, authentication, and error handling.

> **Note**: Interceptors work identically in both the Cap model and legacy manifest format. They are kernel-level middleware and are register-independent.

## Overview

Unlike hooks (which are action-specific), interceptors run for **every** action call. They form a chain around the action execution:

```
Request → Interceptor 1 → Interceptor 2 → ... → Pre-hooks → Handler → Post-hooks → Response
```

## Basic Interceptor

An interceptor is a function that receives the action name, input, context, and a `next()` function:

```ts
import { ActionInterceptor } from '@mobtakronio/capskit';

const loggingInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  console.log(`[Call] ${actionName}`);
  
  // Call next() to continue the chain
  const result = await next();
  
  console.log(`[Result] ${actionName}`, result);
  
  return result;
};
```

## Registering Interceptors

Add interceptors to the CapsKit instance before calling actions:

```ts
import { CapsKit } from '@mobtakronio/capskit';

const capskit = new CapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ]
});

// Register interceptors
capskit.addInterceptor(loggingInterceptor);
capskit.addInterceptor(metricsInterceptor);

await capskit.start();
```

## Interceptor Chain

Interceptors run in registration order. Each must call `next()` exactly once:

```ts
const timerInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  const start = Date.now();
  
  const result = await next();
  
  const duration = Date.now() - start;
  console.log(`${actionName} took ${duration}ms`);
  
  return result;
};

const authInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  // Check authentication before proceeding
  if (!context.deps.user) {
    throw new AuthorizationError('Not authenticated');
  }
  
  return next();
};

// Order matters: timer runs first, then auth
capskit.addInterceptor(timerInterceptor);
capskit.addInterceptor(authInterceptor);
```

## Common Patterns

### Logging Interceptor

```ts
const loggingInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  const logger = context.deps.logger;
  
  logger.info(`Calling ${actionName}`, { 
    body: input.body,
    params: input.params,
    query: input.query
  });
  
  try {
    const result = await next();
    logger.info(`Completed ${actionName}`, { result });
    return result;
  } catch (error) {
    logger.error(`Failed ${actionName}`, { error });
    throw error;
  }
};
```

### Metrics Interceptor

```ts
const metricsInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  const metrics = context.deps.metrics;
  const start = Date.now();
  
  try {
    const result = await next();
    
    metrics.timing('action.duration', Date.now() - start, {
      action: actionName,
      status: 'success'
    });
    
    metrics.increment('action.calls', 1, {
      action: actionName,
      status: 'success'
    });
    
    return result;
  } catch (error) {
    metrics.increment('action.calls', 1, {
      action: actionName,
      status: 'error'
    });
    
    throw error;
  }
};
```

### Error Handling Interceptor

```ts
const errorInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  try {
    return await next();
  } catch (error) {
    // Transform errors to standard format
    if (error instanceof ValidationError) {
      throw { code: 'VALIDATION_ERROR', message: error.message };
    }
    if (error instanceof NotFoundError) {
      throw { code: 'NOT_FOUND', message: error.message };
    }
    
    // Log unexpected errors
    console.error(`[Error] ${actionName}:`, error);
    
    // Re-throw with generic message
    throw { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
  }
};
```

### Caching Interceptor

```ts
const cacheInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  const cache = context.deps.cache;
  
  // Only cache GET-like actions
  if (!actionName.includes('.get') && !actionName.includes('.list')) {
    return next();
  }
  
  const cacheKey = `${actionName}:${JSON.stringify(input.body)}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`[Cache] Hit for ${actionName}`);
    return cached;
  }
  
  const result = await next();
  
  // Cache for 5 minutes
  await cache.set(cacheKey, result, { ttl: 300 });
  
  return result;
};
```

### Rate Limiting Interceptor

```ts
const rateLimitInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  const limiter = context.deps.rateLimiter;
  const userId = context.deps.user?.id || 'anonymous';
  
  const key = `rate:${userId}:${actionName}`;
  const allowed = await limiter.check(key, { 
    maxRequests: 100, 
    windowMs: 60000 
  });
  
  if (!allowed) {
    throw new Error('Rate limit exceeded');
  }
  
  return next();
};
```

## Interceptor vs Hooks

| Interceptors | Hooks |
|--------------|-------|
| Global scope | Action-specific scope |
| Registered on CapsKit | Defined in manifest |
| Run for all actions | Run for specific actions |
| Can short-circuit chain | Cannot prevent handler |
| Good for: logging, metrics, auth | Good for: validation, transformation |

## Execution Order

The complete execution flow:

1. **Interceptors** (in registration order)
2. **Pre-hooks** (in definition order)
3. **Handler**
4. **Post-hooks** (in definition order)
5. **Interceptors** (unwinding, in reverse order)

```ts
// Example execution trace:
// 1. metricsInterceptor.before()
// 2. loggingInterceptor.before()
// 3. preHook1()
// 4. preHook2()
// 5. handler()
// 6. postHook1()
// 7. postHook2()
// 8. loggingInterceptor.after()
// 9. metricsInterceptor.after()
```

## Best Practices

### 1. Keep Interceptors Focused

Each interceptor should handle one concern:

```ts
// Good: Single responsibility
capskit.addInterceptor(loggingInterceptor);
capskit.addInterceptor(metricsInterceptor);
capskit.addInterceptor(authInterceptor);

// Bad: Multiple concerns in one
capskit.addInterceptor(loggingAndMetricsAndAuthInterceptor);
```

### 2. Always Call next()

Interceptors must call `next()` exactly once:

```ts
// Good: Always calls next
const goodInterceptor: ActionInterceptor = async (name, input, ctx, next) => {
  try {
    return await next();
  } catch (error) {
    // Handle error, but next() was already called
    throw error;
  }
};

// Bad: Forgets to call next
const badInterceptor: ActionInterceptor = async (name, input, ctx, next) => {
  if (someCondition) {
    return { blocked: true }; // next() never called!
  }
  return next();
};
```

### 3. Use Dependencies

Access shared services via `context.deps`:

```ts
const dbInterceptor: ActionInterceptor = async (name, input, context, next) => {
  const db = context.deps.database;
  
  // Start transaction
  const tx = await db.startTransaction();
  context.deps.tx = tx;
  
  try {
    const result = await next();
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};
```

### 4. Handle Errors Gracefully

Don't swallow errors unless intentional:

```ts
const errorInterceptor: ActionInterceptor = async (name, input, context, next) => {
  try {
    return await next();
  } catch (error) {
    // Log but re-throw
    console.error(`Error in ${name}:`, error);
    throw error;
  }
};
```

## Related

- [Hooks](/guide/hooks) - Action-specific middleware
- [Errors](/guide/errors) - Error handling patterns
- [Architecture](/guide/architecture) - System overview
