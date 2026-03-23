# Action Hooks

Hooks allow you to run logic before and after an action handler executes. They're perfect for cross-cutting concerns like validation, logging, authentication, and result transformation.

## Overview

CapsKit supports two types of hooks:

| Hook Type | When it Runs | Use Case |
|------------|--------------|----------|
| **Pre-hooks** | Before the handler | Validation, authentication, logging |
| **Post-hooks** | After the handler | Result transformation, caching, auditing |

## Pre-Hooks

Pre-hooks run before the action handler. They receive the input payload and context, but cannot modify the result.

### Basic Pre-Hook

```ts
import { CapsuleManifest } from '@mobtakronio/capskit';

const loggingHook = async (input, context) => {
  console.log(`[Action] Called with:`, input.body);
};

export const service: CapsuleManifest = {
  name: 'users',
  actions: {
    create: {
      handler: './actions/create',
      pre: [loggingHook],
      description: 'Create a new user'
    }
  }
};
```

### Validation Pre-Hook

```ts
const validateEmail = async (input, context) => {
  const { email } = input.body;
  
  if (!email || !email.includes('@')) {
    throw new Error('Invalid email address');
  }
};

export const service: CapsuleManifest = {
  name: 'users',
  actions: {
    create: {
      handler: './actions/create',
      pre: [validateEmail],
      description: 'Create a new user'
    }
  }
};
```

### Authentication Pre-Hook

```ts
const requireAuth = async (input, context) => {
  const token = context.deps.token;
  
  if (!token) {
    throw new AuthorizationError('Authentication required');
  }
  
  // Verify token and attach user to context
  const user = await verifyToken(token);
  context.deps.user = user;
};

export const service: CapsuleManifest = {
  name: 'billing',
  actions: {
    charge: {
      handler: './actions/charge',
      pre: [requireAuth],
      description: 'Charge a user'
    }
  }
};
```

## Post-Hooks

Post-hooks run after the action handler completes. They receive the input, the result, and context. They can transform the result by returning a new value.

### Basic Post-Hook

```ts
const logResult = async (input, result, context) => {
  console.log(`[Action] Result:`, result);
  // Return undefined to keep original result
};

export const service: CapsuleManifest = {
  name: 'calculator',
  actions: {
    sum: {
      handler: './actions/sum',
      post: [logResult],
      description: 'Sum two numbers'
    }
  }
};
```

### Result Transformation

```ts
const addTimestamp = async (input, result, context) => {
  return {
    ...result,
    timestamp: new Date().toISOString()
  };
};

export const service: CapsuleManifest = {
  name: 'api',
  actions: {
    getData: {
      handler: './actions/getData',
      post: [addTimestamp],
      description: 'Get data with timestamp'
    }
  }
};
```

### Caching Post-Hook

```ts
const cacheResult = async (input, result, context) => {
  const cache = context.deps.cache;
  const key = `action:${input.body.id}`;
  
  await cache.set(key, result, { ttl: 3600 });
  
  // Return undefined to keep original result
};

export const service: CapsuleManifest = {
  name: 'products',
  actions: {
    get: {
      handler: './actions/get',
      post: [cacheResult],
      description: 'Get product by ID'
    }
  }
};
```

## Multiple Hooks

Hooks run in the order they're defined. Pre-hooks run sequentially, post-hooks run sequentially and can chain transformations.

```ts
const validateInput = async (input, context) => {
  // Validation logic
};

const logStart = async (input, context) => {
  console.log('Starting action...');
};

const logEnd = async (input, result, context) => {
  console.log('Action completed');
};

const transformResult = async (input, result, context) => {
  return { data: result, success: true };
};

export const service: CapsuleManifest = {
  name: 'orders',
  actions: {
    process: {
      handler: './actions/process',
      pre: [validateInput, logStart],
      post: [logEnd, transformResult],
      description: 'Process an order'
    }
  }
};
```

## Hook Context

Hooks receive the same `ActionContext` as handlers:

```ts
interface ActionContext {
  params?: any;           // Route parameters (HTTP adapter)
  body?: any;             // Request body
  query?: Record<string, any>; // Query parameters
  deps: Record<string, any>;   // Injected dependencies
  emit: (event: string, data: any) => void;  // Event emitter
  call: (action: string, payload: any) => Promise<any>; // Call other actions
  use: <TCapsule = any>(capsuleName: string) => TCapsule; // Get capsule client
}
```

## Error Handling

If a pre-hook throws an error, the action handler is never called. If a post-hook throws, the error propagates to the caller.

```ts
const checkRateLimit = async (input, context) => {
  const limiter = context.deps.rateLimiter;
  const userId = context.deps.user?.id;
  
  if (userId && await limiter.isLimited(userId)) {
    throw new Error('Rate limit exceeded');
  }
};

export const service: CapsuleManifest = {
  name: 'api',
  actions: {
    search: {
      handler: './actions/search',
      pre: [checkRateLimit],
      description: 'Search with rate limiting'
    }
  }
};
```

## Best Practices

1. **Keep hooks focused** - Each hook should do one thing
2. **Use dependencies** - Access shared services via `context.deps`
3. **Handle errors gracefully** - Throw meaningful errors
4. **Document side effects** - Make it clear when hooks modify results
5. **Order matters** - Put validation hooks before logging hooks

## When to Use Hooks vs. Interceptors

| Use Hooks When | Use Interceptors When |
|----------------|----------------------|
| Logic is action-specific | Logic applies to all actions |
| You need result transformation | You need global logging/metrics |
| You want per-action control | You want centralized control |
| Logic varies by capsule | Logic is consistent everywhere |

See [Interceptors](/guide/interceptors) for global middleware patterns.
