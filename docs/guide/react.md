# React Integration

The `@mobtakronio/capskit-react` package provides React hooks and a context provider for using CapsKit clients in React applications.

---

## Installation

```bash
npm install @mobtakronio/capskit-react @mobtakronio/capskit-client
```

---

## CapsKitProvider

Wrap your app (or a subtree) with `CapsKitProvider` to make the client available to all hooks.

```tsx
import { createCapsKitClient } from '@mobtakronio/capskit-client';
import { CapsKitProvider } from '@mobtakronio/capskit-react';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto',
});

function App() {
  return (
    <CapsKitProvider client={client}>
      <Dashboard />
    </CapsKitProvider>
  );
}
```

---

## useCapsKit()

Access the client from anywhere in the tree.

```tsx
import { useCapsKit } from '@mobtakronio/capskit-react';

function ManualButton() {
  const client = useCapsKit();

  const handleClick = async () => {
    const result = await client.call('orders.sum', { a: 1, b: 2 });
    console.log(result);
  };

  return <button onClick={handleClick}>Sum</button>;
}
```

---

## `useAction<T>`(path, payload?, options?)

Execute a CapsKit action and track its state.

```tsx
import { useAction } from '@mobtakronio/capskit-react';

function OrderSummary() {
  const { data, loading, error, refetch } = useAction<{ total: number }>(
    'orders.get-summary',
    { orderId: '123' },
    { immediate: true },
  );

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <p>Total: {data?.total}</p>;
}
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `immediate` | `boolean` | `false` | Execute immediately on mount |
| `deps` | `unknown[]` | `[]` | Re-execute when these dependencies change |

### Return Value

```ts
interface UseActionResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

### Examples

**Lazy execution (no immediate call):**

```tsx
function CreateOrderButton() {
  const { data, loading, refetch } = useAction('orders.create', {
    items: [{ id: 1, qty: 2 }],
  });

  return (
    <button onClick={() => refetch()} disabled={loading}>
      {loading ? 'Creating...' : 'Create Order'}
    </button>
  );
}
```

**Re-execute on dependency change:**

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { data, loading } = useAction('users.get-profile', { userId }, {
    immediate: true,
    deps: [userId],
  });

  if (loading) return <p>Loading...</p>;
  return <p>{data?.name}</p>;
}
```

---

## `useSubscription<T>`(pattern, options?)

Subscribe to real-time events via WebSocket.

```tsx
import { useSubscription } from '@mobtakronio/capskit-react';

function OrderFeed() {
  const { events, latest, error } = useSubscription('order.*');

  return (
    <div>
      {latest && <p>Latest: {JSON.stringify(latest)}</p>}
      <ul>
        {events.map((event, i) => (
          <li key={i}>{JSON.stringify(event)}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable/disable the subscription |

### Return Value

```ts
interface UseSubscriptionResult<T> {
  events: T[];    // Last 100 events
  latest: T | null; // Most recent event
  error: Error | null;
}
```

### Examples

**Conditional subscription:**

```tsx
function LiveDashboard({ live }: { live: boolean }) {
  const { latest } = useSubscription('metrics.*', { enabled: live });
  return <p>Latest metric: {JSON.stringify(latest)}</p>;
}
```

---

## `useCapsule<T>`(name)

Get a typed proxy for a capsule, memoized for performance.

```tsx
import { useCapsule } from '@mobtakronio/capskit-react';

function OrdersPanel() {
  const orders = useCapsule('orders');

  const handleSum = async () => {
    const result = await orders.sum({ a: 10, b: 20 });
    console.log(result);
  };

  return <button onClick={handleSum}>Sum</button>;
}
```

### With Generated Types

```tsx
import { useCapsule } from '@mobtakronio/capskit-react';
import type { OrdersCapsule } from './capskit-types';

function OrdersPanel() {
  const orders = useCapsule<OrdersCapsule>('orders');
  // orders.sum, orders.createOrder, etc. are fully typed
}
```

---

## Complete Example

```tsx
import { createCapsKitClient } from '@mobtakronio/capskit-client';
import { CapsKitProvider, useAction, useSubscription, useCapsule } from '@mobtakronio/capskit-react';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto',
  offline: { enabled: true },
});

function App() {
  return (
    <CapsKitProvider client={client}>
      <OrderDashboard />
    </CapsKitProvider>
  );
}

function OrderDashboard() {
  const orders = useCapsule('orders');
  const { data: orderList, loading } = useAction('orders.list', undefined, { immediate: true });
  const { latest: newOrder } = useSubscription('order.created');

  const handleCreate = async () => {
    await orders.create({ items: [{ id: 1, qty: 1 }] });
  };

  return (
    <div>
      <button onClick={handleCreate}>New Order</button>
      {newOrder && <p>New order: {JSON.stringify(newOrder)}</p>}
      {loading ? <p>Loading...</p> : <OrderTable data={orderList} />}
    </div>
  );
}
```

---

## Next Steps

- [Client SDK](./client.md) — Full client package documentation
- [Vue](./vue.md) — Vue composables
- [Type Generator](./type-generator.md) — Generate TypeScript types from server manifest
