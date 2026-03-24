# Route Traits

Traits allow you to declare transport-specific metadata on your capsule routes. They're processed by adapters (like HTTP) to add cross-cutting concerns like authentication, rate limiting, and authorization.

## Overview

Traits are declared in your capsule manifest's `routes` configuration. They're not processed by CapsKit directly—instead, adapters receive them and apply the appropriate behavior.

```ts
export const service: CapsuleManifest = {
  name: 'api',
  routes: [
    {
      method: 'GET',
      path: '/users/:id',
      action: 'getUser',
      traits: {
        auth: { required: true },
        rateLimit: { max: 100, window: '1m' }
      }
    }
  ],
  actions: {
    getUser: {
      handler: './actions/getUser',
      description: 'Get user by ID'
    }
  }
};
```

## How Traits Work

1. **Declaration**: You declare traits in the `routes` array
2. **Registration**: CapsKit loads the manifest with routes
3. **Adapter Processing**: When building an HTTP router, the adapter processes traits
4. **Handler Execution**: Trait handlers run before the action

## Built-in Trait Types

Traits are flexible key-value pairs. Common patterns include:

### Authentication

```ts
routes: [
  {
    method: 'GET',
    path: '/profile',
    action: 'getProfile',
    traits: {
      auth: { required: true }
    }
  }
]
```

### Authorization (Roles)

```ts
routes: [
  {
    method: 'DELETE',
    path: '/admin/users/:id',
    action: 'deleteUser',
    traits: {
      auth: { required: true },
      role: 'admin'
    }
  }
]
```

### Rate Limiting

```ts
routes: [
  {
    method: 'POST',
    path: '/api/search',
    action: 'search',
    traits: {
      rateLimit: { max: 10, window: '1m' }
    }
  }
]
```

### Caching

```ts
routes: [
  {
    method: 'GET',
    path: '/public/data',
    action: 'getPublicData',
    traits: {
      cache: { ttl: 300 }
    }
  }
]
```

## Providing Trait Handlers

Trait handlers are provided when building the HTTP router:

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit } = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ]
});

// Build HTTP router with trait handlers
const http = capskit.use('http');
const { router } = await http.buildRouter({
  adapter: 'elysia',
  traitHandlers: {
    // Auth trait handler
    auth: async (config, context) => {
      const token = context.headers?.authorization;
      
      if (config.required && !token) {
        throw new AuthorizationError('Authentication required');
      }
      
      // Verify and attach user
      const user = await verifyToken(token);
      context.user = user;
    },
    
    // Role trait handler
    role: async (requiredRole, context) => {
      const user = context.user;
      
      if (!user || user.role !== requiredRole) {
        throw new AuthorizationError(`Requires role: ${requiredRole}`);
      }
    },
    
    // Rate limit trait handler
    rateLimit: async (config, context) => {
      const limiter = getLimiter();
      const key = context.ip || 'anonymous';
      
      const allowed = await limiter.check(key, {
        max: config.max,
        window: parseWindow(config.window)
      });
      
      if (!allowed) {
        throw new Error('Rate limit exceeded');
      }
    },
    
    // Cache trait handler
    cache: async (config, context) => {
      // Set cache headers
      context.set?.headers?.['Cache-Control'] = `max-age=${config.ttl}`;
    }
  }
});
```

## HTTP Adapter Integration

The HTTP adapter (Elysia) processes traits in `beforeHandle` hooks:

```ts
// Internal: How the HTTP adapter processes traits
manifest.routes.forEach(route => {
  const hooks = { beforeHandle: [] };
  
  if (route.traits) {
    for (const [traitName, traitValue] of Object.entries(route.traits)) {
      if (traitHandlers[traitName]) {
        hooks.beforeHandle.push(async (ctx) => {
          await traitHandlers[traitName](traitValue, ctx);
        });
      } else {
        console.warn(`No handler for trait "${traitName}"`);
      }
    }
  }
  
  // Register route with hooks
  app.get(route.path, handler, hooks);
});
```

## Complete Example

### Capsule with Traits

```ts
// src/capsules/api/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'api',
  routes: [
    // Public endpoint
    {
      method: 'GET',
      path: '/health',
      action: 'health',
      traits: {
        cache: { ttl: 60 }
      }
    },
    
    // Authenticated endpoint
    {
      method: 'GET',
      path: '/users/me',
      action: 'getCurrentUser',
      traits: {
        auth: { required: true }
      }
    },
    
    // Admin-only endpoint
    {
      method: 'DELETE',
      path: '/users/:id',
      action: 'deleteUser',
      traits: {
        auth: { required: true },
        role: 'admin'
      }
    },
    
    // Rate-limited endpoint
    {
      method: 'POST',
      path: '/search',
      action: 'search',
      traits: {
        auth: { required: true },
        rateLimit: { max: 10, window: '1m' }
      }
    }
  ],
  actions: {
    health: {
      handler: './actions/health',
      description: 'Health check'
    },
    getCurrentUser: {
      handler: './actions/getCurrentUser',
      description: 'Get current user profile'
    },
    deleteUser: {
      handler: './actions/deleteUser',
      description: 'Delete a user'
    },
    search: {
      handler: './actions/search',
      description: 'Search with rate limiting'
    }
  }
};
```

### Application Setup

```ts
// src/index.ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';

const { capskit } = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ],
  dependencies: {
    jwtSecret: process.env.JWT_SECRET,
    redis: createRedisClient()
  }
});

// Build HTTP router
const http = capskit.use('http');
const { router } = await http.buildRouter({
  adapter: 'elysia',
  traitHandlers: {
    auth: async (config, ctx) => {
      const token = ctx.headers?.authorization?.replace('Bearer ', '');
      
      if (config.required && !token) {
        ctx.set.status = 401;
        throw new Error('Unauthorized');
      }
      
      // Verify token and attach user
      const user = await verifyJWT(token, ctx.deps.jwtSecret);
      ctx.user = user;
    },
    
    role: async (requiredRole, ctx) => {
      if (ctx.user?.role !== requiredRole) {
        ctx.set.status = 403;
        throw new Error('Forbidden');
      }
    },
    
    rateLimit: async (config, ctx) => {
      const redis = ctx.deps.redis;
      const key = `ratelimit:${ctx.user?.id || ctx.ip}`;
      const count = await redis.incr(key);
      
      if (count === 1) {
        await redis.expire(key, parseWindow(config.window));
      }
      
      if (count > config.max) {
        ctx.set.status = 429;
        throw new Error('Too many requests');
      }
    },
    
    cache: async (config, ctx) => {
      ctx.set.headers['Cache-Control'] = `public, max-age=${config.ttl}`;
    }
  }
});

// Start server
router.listen(3000);
```

## Trait Handler Signature

Trait handlers receive two arguments:

```ts
type TraitHandler = (
  traitValue: any,      // The value from the manifest
  context: {            // Framework-specific context
    headers: Record<string, string>;
    params: Record<string, string>;
    query: Record<string, string>;
    body: any;
    user?: any;         // Set by auth trait
    ip?: string;
    set: {              // Response modifiers
      status: number;
      headers: Record<string, string>;
    };
    deps: Record<string, any>;  // CapsKit dependencies
  }
) => Promise<void>;
```

## Best Practices

### 1. Keep Traits Declarative

Traits should describe *what*, not *how*:

```ts
// Good: Declarative
traits: {
  auth: { required: true },
  role: 'admin'
}

// Bad: Imperative
traits: {
  checkToken: true,
  verifyAdmin: true
}
```

### 2. Use Consistent Naming

Follow conventions for common traits:

```ts
// Standard trait names
auth: { required: boolean }
role: string
rateLimit: { max: number, window: string }
cache: { ttl: number }
cors: { origins: string[] }
```

### 3. Document Trait Schemas

Create type definitions for your traits:

```ts
type AuthTrait = { required: boolean };
type RoleTrait = string;
type RateLimitTrait = { max: number; window: string };
type CacheTrait = { ttl: number };

type AppTraits = {
  auth?: AuthTrait;
  role?: RoleTrait;
  rateLimit?: RateLimitTrait;
  cache?: CacheTrait;
};
```

### 4. Handle Missing Handlers

The adapter warns if a trait has no handler:

```ts
// Console warning:
// [HTTP Elysia] No handler provided for trait "customTrait" on route GET /path
```

## Related

- [HTTP Adapter](/guide/adapters/http) - HTTP routing
- [WebSocket Adapter](/guide/adapters/websocket) - WebSocket handling
- [Hooks](/guide/hooks) - Action-specific middleware
