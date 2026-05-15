# Event Bus (Pub/Sub)

The built-in event bus allows capsules to communicate asynchronously through a publish-subscribe pattern. Capsules can publish events that other capsules subscribe to, enabling loose coupling and reactive architectures.

> **Note**: The examples below use the legacy `CapsuleManifest` format. In the recommended **Cap model**, event subscriptions are declared in each Cap's `cap.meta.ts`. See [Capsules](./capsules.md) for Cap model details.

## Overview

The event bus works by:
1. **Publishing**: Capsules emit events with data
2. **Subscribing**: Capsules declare which events they want to listen to
3. **Delivery**: When an event is published, all subscribed actions are called asynchronously

## Declaring Event Subscriptions

Subscriptions are declared in the capsule manifest:

```ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'notifications',
  actions: {
    sendWelcomeEmail: {
      handler: './actions/sendWelcomeEmail',
      description: 'Send welcome email to new user'
    },
    logUserActivity: {
      handler: './actions/logUserActivity',
      description: 'Log user activity for analytics'
    }
  },
  events: {
    subscribes: [
      { event: 'user.created', action: 'sendWelcomeEmail' },
      { event: 'user.created', action: 'logUserActivity' }
    ]
  }
};
```

## Publishing Events

Publish events using the `emit()` method from the ActionContext:

```ts
import { ActionHandler } from '@mobtakronio/capskit';

export const createUser: ActionHandler = async (payload, context) => {
  // Create user in database
  const user = await context.deps.db.users.create(payload);
  
  // Publish event (fire-and-forget)
  context.emit('user.created', {
    userId: user.id,
    email: user.email,
    timestamp: new Date().toISOString()
  });
  
  return user;
};
```

## Event Flow

When an event is published:

1. **Emit**: `context.emit('event.name', data)` is called
2. **Lookup**: Event bus finds all subscriptions for 'event.name'
3. **Dispatch**: Each subscribed action is called with the event data
4. **Fire-and-forget**: Errors are caught and logged but don't block publishing

```ts
// Internal execution flow:
context.emit('user.created', userData)
  ↓
Event bus finds subscriptions:
  - notifications.sendWelcomeEmail
  - notifications.logUserActivity
  ↓
Both actions are called:
  capskit.call('notifications.sendWelcomeEmail', userData)
  capskit.call('notifications.logUserActivity', userData)
  ↓
Errors in either action are caught and logged
```

## Event Data

Event data can be any serializable value:

```ts
// Simple payload
context.emit('user.login', userId);

// Object payload
context.emit('order.created', {
  orderId: '123',
  userId: '456',
  amount: 9999,
  items: [{ productId: 'abc', quantity: 2 }]
});

// Array payload
context.emit('batch.processed', [
  { id: 1, status: 'success' },
  { id: 2, status: 'failed' }
]);

// Primitive payload
context.emit('cache.cleared', true);
```

## Event Subscription Validation

CapsKit validates event subscriptions during capsule loading:

```ts
// This will throw an error during start():
export const service: CapsuleManifest = {
  name: 'notifications',
  actions: {
    sendWelcomeEmail: { handler: './actions/sendWelcomeEmail' }
  },
  events: {
    subscribes: [
      { event: 'user.created', action: 'sendWelcomeEmail' }, // ✅ Valid
      { event: 'user.created', action: 'nonExistentAction' } // ❌ Invalid
    ]
  }
};
// Error: Capsule "notifications" subscribes to event "user.created" with non-existent action "nonExistentAction".
```

## Complete Example

### User Capsule (Publisher)

```ts
// src/capsules/users/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'users',
  actions: {
    create: {
      handler: './actions/create',
      description: 'Create a new user'
    },
    login: {
      handler: './actions/login',
      description: 'Authenticate user'
    }
  }
};

// src/capsules/users/actions/create.ts
import { ActionHandler } from '@mobtakronio/capskit';

export const create: ActionHandler = async (payload, context) => {
  const { email, password, name } = payload.body;
  
  // Create user
  const user = await context.deps.db.users.create({
    email,
    password: await hashPassword(password),
    name,
    createdAt: new Date()
  });
  
  // Publish event
  context.emit('user.created', {
    userId: user.id,
    email: user.email,
    name: user.name
  });
  
  // Also publish login event for audit
  context.emit('user.registered', {
    userId: user.id,
    timestamp: new Date().toISOString()
  });
  
  return { id: user.id, email: user.email };
};
```

### Notifications Capsule (Subscriber)

```ts
// src/capsules/notifications/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'notifications',
  actions: {
    sendWelcomeEmail: {
      handler: './actions/sendWelcomeEmail',
      description: 'Send welcome email'
    },
    logUserActivity: {
      handler: './actions/logUserActivity',
      description: 'Log activity for analytics'
    },
    updateProfileStats: {
      handler: './actions/updateProfileStats',
      description: 'Update user profile statistics'
    }
  },
  events: {
    subscribes: [
      { event: 'user.created', action: 'sendWelcomeEmail' },
      { event: 'user.created', action: 'logUserActivity' },
      { event: 'user.registered', action: 'updateProfileStats' }
    ]
  }
};

// src/capsules/notifications/actions/sendWelcomeEmail.ts
import { ActionHandler } from '@mobtakronio/capskit';

export const sendWelcomeEmail: ActionHandler = async (payload, context) => {
  const { userId, email, name } = payload;
  
  // Send email via service
  await context.deps.emailService.send({
    to: email,
    subject: 'Welcome to our platform!',
    template: 'welcome',
    data: { name }
  });
  
  // Log sent email
  await context.deps.db.notificationLog.create({
    userId,
    type: 'welcome_email',
    sentAt: new Date()
  });
};
```

### Analytics Capsule (Multiple Subscriptions)

```ts
// src/capsules/analytics/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'analytics',
  actions: {
    trackEvent: {
      handler: './actions/trackEvent',
      description: 'Track analytics event'
    },
    updateMetrics: {
      handler: './actions/updateMetrics',
      description: 'Update real-time metrics'
    }
  },
  events: {
    subscribes: [
      { event: 'user.created', action: 'trackEvent' },
      { event: 'user.login', action: 'trackEvent' },
      { event: 'order.created', action: 'updateMetrics' },
      { event: 'payment.processed', action: 'updateMetrics' }
    ]
  }
};
```

## Event Bus Characteristics

### Asynchronous Delivery

Events are delivered asynchronously:
- Publishing doesn't wait for subscribers to finish
- Subscriber errors don't affect the publisher
- Events are processed in the order they're emitted

### Fire-and-Forget

- No acknowledgment or retry mechanism
- Errors in subscribers are caught and logged
- If a subscriber throws, it doesn't block other subscribers

### No Guarantees

- **At-least-once**: Events may be delivered multiple times in edge cases
- **No ordering**: Different event types may be processed out of order
- **No persistence**: Events are lost if the process crashes

## Best Practices

### 1. Use Descriptive Event Names

Use past-tense names that describe what happened:

```ts
// Good: Descriptive, past tense
context.emit('user.created', data);
context.emit('order.payment.processed', data);
context.emit('cache.cleared', data);

// Bad: Present tense or imperative
context.emit('createUser', data);
context.emit('processPayment', data);
context.emit('clearCache', data);
```

### 2. Keep Events Small

Only include necessary data:

```ts
// Good: Minimal payload
context.emit('user.created', {
  userId: user.id,
  email: user.email
});

// Bad: Over-sharing
context.emit('user.created', {
  user: { // Entire user object with password hash, etc.
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash, // Don't do this!
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    preferences: user.preferences,
    // ... lots more data
  }
});
```

### 3. Document Events

Create an event registry for your system:

```ts
// docs/events.md
# System Events

## user.created
Published when a new user registers.

**Payload:**
- `userId` (string): Unique user identifier
- `email` (string): User's email address
- `name` (string): User's full name

**Subscribers:**
- notifications.sendWelcomeEmail
- notifications.logUserActivity
- analytics.trackEvent
- audit.logUserCreation

## order.payment.processed
Published when an order payment is successfully processed.

**Payload:**
- `orderId` (string): Order identifier
- `amount` (number): Payment amount in cents
- `paymentMethod` (string): Credit card, PayPal, etc.
- `timestamp` (ISO string): When payment processed
```

### 4. Handle Idempotency

Design subscribers to handle duplicate events:

```ts
export const sendWelcomeEmail: ActionHandler = async (payload, context) => {
  const { userId } = payload;
  
  // Check if we already sent welcome email
  const existing = await context.deps.db.notificationLog.findFirst({
    where: { userId, type: 'welcome_email' }
  });
  
  if (existing) {
    // Already sent, skip
    return;
  }
  
  // Send email...
  await context.deps.emailService.send({ /* ... */ });
  
  // Log that we sent it
  await context.deps.db.notificationLog.create({
    userId,
    type: 'welcome_email',
    sentAt: new Date()
  });
};
```

### 5. Use Events for Loose Coupling

Events let you add functionality without modifying existing code:

```ts
// Original user creation
export const create: ActionHandler = async (payload, context) => {
  const user = await context.deps.db.users.create(payload);
  context.emit('user.created', user); // ← Extension point
  return user;
};

// Months later, add notifications without touching user capsule:
// 1. Create notifications capsule
// 2. Subscribe to 'user.created'
// 3. Deploy - no changes to user capsule needed!
```

## Related

- [Actions](/guide/actions) - Define action handlers
- [Hooks](/guide/hooks) - Action-specific middleware
- [Interceptors](/guide/interceptors) - Global middleware
- [Architecture](/guide/architecture) - System overview
