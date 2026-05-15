# Capsule Clients

Capsule Clients provide a type-safe, ergonomic way to call actions from other capsules. Instead of using raw string-based `call()` methods, you get native-feeling objects with IDE autocompletion.

> **Note**: Examples use the legacy `CapsuleManifest` format. In the Cap model, `context.use()` works identically — the only difference is how capsules are loaded. See [Capsules](./capsules.md) for full Cap model details.

## The Problem

Without capsule clients, calling actions across capsules is verbose and untyped:

```ts
// Verbose, untyped, error-prone
const result = await capskit.call('inventory.checkItem', { itemId: 'abc123' });

// Typos in action names won't be caught until runtime
const result2 = await capskit.call('inventory.checkIten', { itemId: 'abc123' }); // Bug!
```

## The Solution

Capsule Clients use JavaScript Proxies to create intuitive, chainable APIs:

```ts
// Clean, intuitive, type-safe
const inventory = capskit.use('inventory');
const result = await inventory.checkItem({ itemId: 'abc123' });
```

## Basic Usage

### From Application Code

When you have access to the CapsKit instance:

```ts
import { createCapsKit } from '@mobtakronio/capskit';

const { capskit } = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ]
});

// Get a capsule client
const users = capskit.use('users');

// Call actions naturally
const user = await users.create({ 
  email: 'hello@example.com',
  name: 'John Doe'
});

const profile = await users.getProfile({ userId: user.id });
```

### From Action Handlers

Inside action handlers, use the context's `use()` method:

```ts
import { ActionHandler } from '@mobtakronio/capskit';

export const processOrder: ActionHandler = async (payload, context) => {
  // Get clients to other capsules
  const inventory = context.use('inventory');
  const billing = context.use('billing');
  
  // Check stock
  const hasStock = await inventory.checkItem({ 
    itemId: payload.itemId 
  });
  
  if (!hasStock) {
    throw new Error('Item out of stock');
  }
  
  // Process payment
  const charge = await billing.charge({
    userId: payload.userId,
    amount: payload.amount
  });
  
  return { success: true, charge };
};
```

## TypeScript Integration

### Defining Client Types

Export a type interface from your capsule:

```ts
// src/capsules/inventory/manifest.ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export type InventoryClient = {
  checkItem: (payload: { itemId: string }) => Promise<boolean>;
  reserveItem: (payload: { itemId: string; quantity: number }) => Promise<{ reserved: boolean }>;
  releaseItem: (payload: { reservationId: string }) => Promise<void>;
};

export const service: CapsuleManifest = {
  name: 'inventory',
  actions: {
    checkItem: {
      handler: './actions/checkItem',
      description: 'Check if item is in stock'
    },
    reserveItem: {
      handler: './actions/reserveItem',
      description: 'Reserve an item'
    },
    releaseItem: {
      handler: './actions/releaseItem',
      description: 'Release a reservation'
    }
  }
};
```

### Using Typed Clients

Import the type and pass it to `use()`:

```ts
import type { InventoryClient } from '../inventory/manifest';

export const processOrder: ActionHandler = async (payload, context) => {
  // Full IDE autocompletion and type checking
  const inventory = context.use<InventoryClient>('inventory');
  
  // TypeScript knows exactly what methods and payloads are valid
  const hasStock = await inventory.checkItem({ itemId: payload.itemId });
  const reservation = await inventory.reserveItem({ 
    itemId: payload.itemId, 
    quantity: 2 
  });
  
  return reservation;
};
```

## Introspection

### Describe a Capsule

Get metadata about any registered capsule:

```ts
const manifest = capskit.describe('inventory');

console.log(manifest?.name);        // 'inventory'
console.log(manifest?.actions);      // { checkItem: {...}, reserveItem: {...} }
console.log(manifest?.events);       // { publishes: [...], subscribes: [...] }
```

### List All Capsules

Get all registered manifests:

```ts
// Access internal API (for diagnostics, testing)
const manifests = capskit.getManifests();

manifests.forEach(manifest => {
  console.log(`Capsule: ${manifest.name}`);
  console.log(`Actions: ${Object.keys(manifest.actions).join(', ')}`);
});
```

## Dependency Injection

Capsule clients automatically have access to injected dependencies:

```ts
// In your boot config
const { capskit } = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ],
  dependencies: {
    database: createDatabase(),
    logger: createLogger(),
    cache: createCache()
  }
});

// Dependencies are available in context.deps
export const getUser: ActionHandler = async (payload, context) => {
  const db = context.deps.database;
  const cache = context.deps.cache;
  
  // Check cache first
  const cached = await cache.get(`user:${payload.userId}`);
  if (cached) return cached;
  
  // Query database
  const user = await db.users.find(payload.userId);
  await cache.set(`user:${payload.userId}`, user);
  
  return user;
};
```

## Capsule-to-Capsule Communication

### Direct Calls

```ts
export const createOrder: ActionHandler = async (payload, context) => {
  const users = context.use('users');
  const inventory = context.use('inventory');
  const notifications = context.use('notifications');
  
  // Validate user
  const user = await users.validate({ userId: payload.userId });
  
  // Check inventory
  const stock = await inventory.check({ itemId: payload.itemId });
  
  // Send notification
  await notifications.send({
    userId: user.id,
    message: 'Order created!'
  });
  
  return { orderId: '...' };
};
```

### Using call() Directly

For dynamic action names or when you don't need a client:

```ts
export const dynamicAction: ActionHandler = async (payload, context) => {
  // Call action by string name
  const result = await context.call('users.getProfile', { 
    userId: payload.targetUserId 
  });
  
  return result;
};
```

## Best Practices

### 1. Export Client Types

Always export a client type from your capsule:

```ts
// Good: Type-safe consumption
export type UsersClient = {
  create: (payload: CreateInput) => Promise<User>;
  get: (payload: { id: string }) => Promise<User>;
  update: (payload: UpdateInput) => Promise<User>;
};
```

### 2. Use Typed Clients

Always use the generic parameter for type safety:

```ts
// Good: Full type checking
const users = context.use<UsersClient>('users');

// Bad: No type checking
const users = context.use('users');
```

### 3. Keep Capsules Focused

Each capsule should have a clear domain boundary:

```ts
// Good: Clear separation
const billing = context.use('billing');
const inventory = context.use('inventory');
const shipping = context.use('shipping');

// Bad: Mixing concerns
const utils = context.use('utils'); // Too broad
```

### 4. Document Client Interfaces

Add JSDoc comments to your client types:

```ts
export type BillingClient = {
  /**
   * Charge a user's payment method
   * @param payload.userId - The user to charge
   * @param payload.amount - Amount in cents
   */
  charge: (payload: { userId: string; amount: number }) => Promise<ChargeResult>;
};
```

## Limitations

- **Runtime validation**: Client types are compile-time only; runtime validation requires schemas
- **No circular dependencies**: Capsules cannot have circular `requires` dependencies
- **Proxy overhead**: Each `use()` call creates a new Proxy (minimal performance impact)

## Related

- [Actions](/guide/actions) - Define action handlers
- [Dependencies](/guide/dependencies) - Inject shared services
- [Architecture](/guide/architecture) - System overview
