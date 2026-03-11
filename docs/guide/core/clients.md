# Capsule Clients

When your architecture scales, managing raw string events like `capskit.call('billing.chargeUser', payload)` can become cumbersome and untyped.

To drastically improve developer experience, CapsKit provides the **Capsule Client Proxy**. 

This feature allows you to instantly generate a local, native-feeling object that transparently points back to the Kernel's capability engine.

## Instantiating a Client

You can request a Capsule Client anywhere you have access to the `capskit` instance:

```ts
const userCapsule = capskit.use('users');

// Internally, this automatically translates to:
// capskit.call('users.create', { email: "..." })
const newUser = await userCapsule.create({ email: "hello@world.com" });
```

## Internal Invocation (Capsule-to-Capsule)

If you are writing the business logic for an Action and need to perform an operation defined in *another* capsule, you can pull a client directly from the `ActionContext`. 

This keeps your inter-capsule communication incredibly clean:

```ts
import { ActionHandler } from '@mobtakronio/capskit';

export const processOrder: ActionHandler = async (payload, context) => {
  // 1. Create a client pointing to the 'inventory' capsule
  const inventory = context.use('inventory');

  // 2. Safely trigger a peer capability without knowing how it works!
  const hasStock = await inventory.checkItem({ itemId: payload.item });

  if (hasStock) {
    return { success: true };
  }
}
```

## Adding TypeScript Safety

By default, `.use()` returns a Javascript `Proxy` meaning it lacks intellisense. But it accepts a generic interface, letting your team establish **strict compile-time type safety**.

Simply export a client schema from your domain's `manifest.ts`:

```ts
// src/capsules/inventory/manifest.ts
export type InventoryClient = {
  checkItem: (payload: { itemId: string }) => Promise<boolean>;
}
```

And then pass it to the `.use()` generator where you consume it:

```ts
import type { InventoryClient } from '../inventory/manifest.ts';

// Your IDE now provides precise autocompletion and enforces 
// exactly what payloads are allowed!
const inventory = context.use<InventoryClient>('inventory');
```

## Introspection at Runtime

Need to know exactly what an unknown Capsule does without reading the source code? The Kernel knows all.

```ts
const specs = capskit.describe('capskit-calculator');
console.log(specs.actions); 
// Output: { sum: { description: 'Sums two integers', ... } }
```
