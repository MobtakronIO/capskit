# Vue Integration

The `@mobtakronio/capskit-vue` package provides Vue composables for using CapsKit clients in Vue 3 applications.

---

## Installation

```bash
npm install @mobtakronio/capskit-vue @mobtakronio/capskit-client
```

---

## provideCapsKit(client)

Provide the client at the app or component level.

```ts
import { createApp } from 'vue';
import { createCapsKitClient } from '@mobtakronio/capskit-client';
import { provideCapsKit } from '@mobtakronio/capskit-vue';
import App from './App.vue';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto',
});

const app = createApp(App);
app.use({
  install() {
    provideCapsKit(client);
  },
});
app.mount('#app');
```

Or within a component's `setup()`:

```ts
// In your <script setup> block:
import { provideCapsKit } from '@mobtakronio/capskit-vue';
import { createCapsKitClient } from '@mobtakronio/capskit-client';

const client = createCapsKitClient({ baseUrl: 'http://localhost:3000' });
provideCapsKit(client);
```

---

## injectCapsKit()

Access the client from any component.

```ts
// In your <script setup> block:
import { injectCapsKit } from '@mobtakronio/capskit-vue';

const client = injectCapsKit();

async function sum() {
  const result = await client.call('orders.sum', { a: 1, b: 2 });
  console.log(result);
}
```

---

## `useAction<T>`(path, payload?, options?)

Execute a CapsKit action with reactive state.

```ts
// In your <script setup> block:
import { useAction } from '@mobtakronio/capskit-vue';

const { data, loading, error, refetch } = useAction<{ total: number }>(
  'orders.get-summary',
  { orderId: '123' },
  { immediate: true },
);
```

```html
<!-- In your template: -->
<div>
  <p v-if="loading">Loading...</p>
  <p v-else-if="error">Error: {{ error.message }}</p>
  <p v-else>Total: {{ data?.total }}</p>
  <button @click="refetch">Refresh</button>
</div>
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `immediate` | `boolean` | `false` | Execute on component mount |
| `watch` | `Ref<unknown>[]` | `[]` | Re-execute when these refs change |

### Return Value

```ts
interface UseActionResult<T> {
  data: Readonly<Ref<T | null>>;
  loading: Readonly<Ref<boolean>>;
  error: Readonly<Ref<Error | null>>;
  refetch: () => Promise<void>;
}
```

All refs are readonly — use `refetch()` to trigger re-execution.

### Examples

**Lazy execution:**

```ts
// In your <script setup> block:
import { useAction } from '@mobtakronio/capskit-vue';

const { data, loading, refetch } = useAction('orders.create', {
  items: [{ id: 1, qty: 2 }],
});
```

```html
<!-- In your template: -->
<button @click="refetch" :disabled="loading">
  {{ loading ? 'Creating...' : 'Create Order' }}
</button>
```

**Watch reactive dependencies:**

```ts
// In your <script setup> block:
import { ref } from 'vue';
import { useAction } from '@mobtakronio/capskit-vue';

const userId = ref('123');

const { data, loading } = useAction('users.get-profile', { userId: userId.value }, {
  watch: [userId],
});
```

---

## `useSubscription<T>`(pattern, options?)

Subscribe to real-time events via WebSocket.

```ts
// In your <script setup> block:
import { useSubscription } from '@mobtakronio/capskit-vue';

const { events, latest, error } = useSubscription('order.*');
```

```html
<!-- In your template: -->
<div>
  <p v-if="latest">Latest: {{ JSON.stringify(latest) }}</p>
  <ul>
    <li v-for="(event, i) in events" :key="i">
      {{ JSON.stringify(event) }}
    </li>
  </ul>
</div>
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `Ref<boolean> \| boolean` | `true` | Enable/disable the subscription |

### Return Value

```ts
interface UseSubscriptionResult<T> {
  events: Readonly<Ref<T[]>>;
  latest: Readonly<Ref<T | null>>;
  error: Readonly<Ref<Error | null>>;
}
```

### Examples

**Reactive enable/disable:**

```ts
// In your <script setup> block:
import { ref } from 'vue';
import { useSubscription } from '@mobtakronio/capskit-vue';

const liveMode = ref(true);

const { latest } = useSubscription('metrics.*', { enabled: liveMode });
```

```html
<!-- In your template: -->
<div>
  <button @click="liveMode = !liveMode">
    {{ liveMode ? 'Live' : 'Paused' }}
  </button>
  <p>{{ JSON.stringify(latest) }}</p>
</div>
```

---

## `useCapsule<T>`(name)

Get a typed, computed proxy for a capsule.

```ts
// In your <script setup> block:
import { useCapsule } from '@mobtakronio/capskit-vue';

const orders = useCapsule('orders');

async function handleSum() {
  const result = await orders.sum({ a: 10, b: 20 });
  console.log(result);
}
```

```html
<!-- In your template: -->
<button @click="handleSum">Sum</button>
```

Returns a `ComputedRef<TCapsule>` that stays in sync with the client.

### With Generated Types

```ts
import { useCapsule } from '@mobtakronio/capskit-vue';
import type { OrdersCapsule } from './capskit-types';

const orders = useCapsule<OrdersCapsule>('orders');
```

---

## Complete Example

**App.vue:**

```ts
// In your <script setup> block:
import { createCapsKitClient } from '@mobtakronio/capskit-client';
import { provideCapsKit } from '@mobtakronio/capskit-vue';
import OrderDashboard from './OrderDashboard.vue';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
  transport: 'auto',
  offline: { enabled: true },
});

provideCapsKit(client);
```

```html
<!-- In your template: -->
<OrderDashboard />
```

**OrderDashboard.vue:**

```ts
// In your <script setup> block:
import { useAction, useSubscription, useCapsule } from '@mobtakronio/capskit-vue';

const orders = useCapsule('orders');
const { data: orderList, loading } = useAction('orders.list', undefined, { immediate: true });
const { latest: newOrder } = useSubscription('order.created');

async function handleCreate() {
  await orders.create({ items: [{ id: 1, qty: 1 }] });
}
```

```html
<!-- In your template: -->
<div>
  <button @click="handleCreate">New Order</button>
  <p v-if="newOrder">New order: {{ JSON.stringify(newOrder) }}</p>
  <p v-if="loading">Loading...</p>
  <OrderTable v-else :data="orderList" />
</div>
```

---

## Next Steps

- [Client SDK](./client.md) — Full client package documentation
- [React](./react.md) — React hooks and provider
- [Type Generator](./type-generator.md) — Generate TypeScript types from server manifest