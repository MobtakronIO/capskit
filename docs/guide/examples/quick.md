# Quick Examples

Common patterns and snippets for everyday CapsKit usage.

## Basic Capsule

```ts
// src/capsules/hello/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'hello',
  actions: {
    greet: {
      handler: './actions/greet',
      description: 'Return a greeting message'
    }
  }
};

// src/capsules/hello/actions/greet.ts
import { ActionHandler } from '@mobtakronio/capskit';

export const greet: ActionHandler = async (payload) => {
  const { name } = payload.body || {};
  return { message: `Hello, ${name || 'World'}!` };
};
```

## With Validation Hook

```ts
// src/capsules/users/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

const validateEmail = async (input, context) => {
  const { email } = input.body;
  if (!email || !email.includes('@')) {
    throw new Error('Invalid email format');
  }
};

export type UsersClient = {
  create: (payload: { name: string; email: string }) => Promise<{ id: string }>;
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

## With Type-Safe Client

```ts
// src/capsules/orders/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export type OrdersClient = {
  create: (payload: { userId: string; items: Array<{ productId: string; quantity: number }> }) => Promise<{ id: string }>;
  get: (payload: { id: string }) => Promise<{ id: string; userId: string; total: number }>;
};

export const service: CapsuleManifest = {
  name: 'orders',
  actions: {
    create: {
      handler: './actions/create',
      description: 'Create a new order'
    },
    get: {
      handler: './actions/get',
      description: 'Get order by ID'
    }
  }
};

// Usage:
const orders = capskit.use<OrdersClient>('orders');
const order = await orders.create({
  userId: 'user-123',
  items: [{ productId: 'prod-1', quantity: 2 }]
});
```

## Event Subscription

```ts
// src/capsules/notifications/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'notifications',
  actions: {
    sendWelcome: {
      handler: './actions/sendWelcome',
      description: 'Send welcome email'
    }
  },
  events: {
    subscribes: [
      { event: 'user.created', action: 'sendWelcome' }
    ]
  }
};

// src/capsules/notifications/actions/sendWelcome.ts
import { ActionHandler } from '@mobtakronio/capskit';

export const sendWelcome: ActionHandler = async (payload, context) => {
  const { userId, email } = payload;
  await context.deps.emailService.send({
    to: email,
    subject: 'Welcome!',
    body: `Hello ${userId}, thanks for joining!`
  });
};
```

## HTTP Route with Traits

```ts
// src/capsules/api/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'api',
  routes: [
    {
      method: 'GET',
      path: '/public/data',
      action: 'getPublicData',
      traits: {
        cache: { ttl: 60 }
      }
    },
    {
      method: 'GET',
      path: '/user/profile',
      action: 'getProfile',
      traits: {
        auth: { required: true }
      }
    }
  ],
  actions: {
    getPublicData: {
      handler: './actions/getPublicData',
      description: 'Get public data (cached)'
    },
    getProfile: {
      handler: './actions/getProfile',
      description: 'Get user profile (requires auth)'
    }
  }
};
```

## Dependency Injection

```ts
// src/index.ts
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }],
  dependencies: {
    database: {
      users: {
        find: (id: string) => Promise.resolve({ id, name: 'John Doe' }),
        create: (data: any) => Promise.resolve({ id: 'user-1', ...data })
      }
    },
    logger: {
      info: (msg: string) => console.log('[INFO]', msg),
      error: (msg: string) => console.error('[ERROR]', msg)
    }
  }
});

// In actions:
export const getUser: ActionHandler = async (payload, context) => {
  const db = context.deps.database;
  const logger = context.deps.logger;
  
  logger.info(`Fetching user ${payload.params.id}`);
  const user = await db.users.find(payload.params.id);
  return user;
};
```

## Interceptor for Logging

```ts
// src/index.ts
import { createCapsKit, ActionInterceptor } from '@mobtakronio/capskit';

const loggingInterceptor: ActionInterceptor = async (actionName, input, context, next) => {
  console.log(`→ ${actionName}`);
  const result = await next();
  console.log(`← ${actionName}`, result);
  return result;
};

const { capskit } = await createCapsKit({
  capsules: [{ type: 'directory', path: './src/capsules' }]
});

capskit.addInterceptor(loggingInterceptor);
await capskit.start();

// All actions will now be logged
await capskit.call('users.get', { id: '123' });
// → users.get
// ← users.get { id: '123', name: 'John Doe' }
```

## Error Handling

```ts
// src/capsules/auth/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'auth',
  actions: {
    login: {
      handler: './actions/login',
      description: 'Login user'
    }
  }
};

// src/capsules/auth/actions/login.ts
import { ActionHandler } from '@mobtakronio/capskit';
import { ValidationError, NotFoundError } from '@mobtakronio/capskit/kernel/errors';

export const login: ActionHandler = async (payload, context) => {
  const { email, password } = payload.body;
  
  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }
  
  // Find user
  const user = await context.deps.users.findByEmail(email);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  // Check password
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new ValidationError('Invalid credentials');
  }
  
  return { token: generateToken(user.id) };
};
```

## Calling Between Capsules

```ts
// src/capsules/order-processing/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'order-processing',
  requires: ['orders', 'inventory', 'payments'],
  actions: {
    process: {
      handler: './actions/process',
      description: 'Process an order from start to finish'
    }
  }
};

// src/capsules/order-processing/actions/process.ts
import { ActionHandler } from '@mobtakronio/capskit';

export const process: ActionHandler = async (payload, context) => {
  // Get clients to other capsules
  const orders = context.use('orders');
  const inventory = context.use('inventory');
  const payments = context.use('payments');
  
  // 1. Get order details
  const order = await orders.get({ id: payload.orderId });
  
  // 2. Check inventory
  for (const item of order.items) {
    const stock = await inventory.checkStock({
      productId: item.productId,
      quantity: item.quantity
    });
    if (!stock.available) {
      throw new Error(`Insufficient stock for ${item.productId}`);
    }
  }
  
  // 3. Process payment
  const payment = await payments.charge({
    amount: order.total,
    paymentMethod: payload.paymentMethod
  });
  
  // 4. Reserve inventory
  for (const item of order.items) {
    await inventory.reserveStock({
      productId: item.productId,
      quantity: item.quantity
    });
  }
  
  // 5. Update order status
  await orders.updateStatus({
    id: order.id,
    status: 'processed',
    paymentId: payment.id
  });
  
  return { orderId: order.id, paymentId: payment.id };
};
```