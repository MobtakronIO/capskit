# Type Generator

The type generator CLI creates TypeScript types from your server's manifest, enabling fully typed `call()` and `use()` operations with IDE autocomplete.

> [!NOTE]
   > The CapsKit Type Generator CLI (`npx capskit generate`) is currently in active development and not yet published. The examples below demonstrate the target syntax and generated output schema for when it is released. For current projects, please write interfaces manually.

---

## Usage

```bash
npx capskit generate --url <server-url> --output <output-file>
```

### Options

| Option | Alias | Description |
|---|---|---|
| `--url` | `-u` | Server URL to fetch manifest from (required) |
| `--output` | `-o` | Output file path (required) |

### Example

```bash
npx capskit generate --url http://localhost:3000 --output src/capskit-types.ts
```

---

## What It Generates

The generator fetches your server manifest via `GET /describe` and produces:

1. **Capsule interfaces** — One interface per capsule with typed action methods
2. **Event type unions** — All published event names per capsule
3. **`call()` overloads** — Typed overloads for `client.call()`
4. **`use()` overloads** — Typed overloads for `client.use()`
5. **Combined client type** — A `TypedCapsKitClient` type combining all overloads

### Generated Output Example

```ts
// ──────────────────────────────────────────────────────────────
// Auto-generated CapsKit types — do not edit manually
// Generated at: 2026-05-16T10:00:00.000Z
// ──────────────────────────────────────────────────────────────

// ── Capsule Interfaces ──

export interface OrdersCapsule {
  sum(input: { a: number; b: number }): Promise<{ result: number }>;
  create(input: { items: Array<{ id: number; qty: number }> }): Promise<{ order: Order }>;
  list(input?: unknown): Promise<{ orders: Order[] }>;
}

export interface UsersCapsule {
  getProfile(input: { userId: string }): Promise<{ name: string; email: string }>;
}

// ── Event Types ──

export type OrdersEvents = 'order.created' | 'order.cancelled' | 'order.shipped';

// ── Call Overloads ──

export interface CapsKitCallOverloads {
  call(action: 'orders.sum', input: { a: number; b: number }): Promise<{ result: number }>;
  call(action: 'orders.create', input: { items: Array<{ id: number; qty: number }> }): Promise<{ order: Order }>;
  call(action: 'orders.list', input?: unknown): Promise<{ orders: Order[] }>;
  call(action: 'users.getProfile', input: { userId: string }): Promise<{ name: string; email: string }>;
}

// ── Use Overloads ──

export interface CapsKitUseOverloads {
  use(name: 'orders'): OrdersCapsule;
  use(name: 'users'): UsersCapsule;
}

// ── Combined Client Type ──

export type TypedCapsKitClient = CapsKitCallOverloads & CapsKitUseOverloads;
```

---

## Using Generated Types

### With `call()`

```ts
import { createCapsKitClient } from '@mobtakronio/capskit-client';
import type { CapsKitCallOverloads } from './capskit-types';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
}) as CapsKitCallOverloads;

// Fully typed — IDE shows autocomplete for action names
const result = await client.call('orders.sum', { a: 15, b: 30 });
// result is { result: number }
```

### With `use()`

```ts
import { createCapsKitClient } from '@mobtakronio/capskit-client';
import type { CapsKitUseOverloads, OrdersCapsule } from './capskit-types';

const client = createCapsKitClient({
  baseUrl: 'http://localhost:3000',
}) as CapsKitUseOverloads;

const orders = client.use('orders');
// orders.sum, orders.create, orders.list are all typed
const result = await orders.sum({ a: 15, b: 30 });
```

### With React Hooks

```tsx
import { useAction, useCapsule } from '@mobtakronio/capskit-react';
import type { OrdersCapsule } from './capskit-types';

function OrdersPanel() {
  const orders = useCapsule<OrdersCapsule>('orders');

  const { data } = useAction<{ orders: Order[] }>('orders.list');

  return <div>{/* ... */}</div>;
}
```

### With Vue Composables

```ts
// In your <script setup> block:
import { useCapsule } from '@mobtakronio/capskit-vue';
import type { OrdersCapsule } from './capskit-types';

const orders = useCapsule<OrdersCapsule>('orders');
// All actions are typed
```

---

## Schema-to-Type Conversion

The generator converts JSON Schema to TypeScript types:

| JSON Schema | TypeScript |
|---|---|
| `{ "type": "string" }` | `string` |
| `{ "type": "number" }` | `number` |
| `{ "type": "integer" }` | `number` |
| `{ "type": "boolean" }` | `boolean` |
| `{ "type": "null" }` | `null` |
| `{ "type": "array", "items": {...} }` | `Array<ItemType>` |
| `{ "type": "object", "properties": {...} }` | `{ key: Type }` |
| `{ "oneOf": [...] }` | `Type1 \| Type2` |
| `{ "anyOf": [...] }` | `Type1 \| Type2` |
| `{ "allOf": [...] }` | `Type1 & Type2` |

### Required vs Optional Properties

Properties in the `required` array are typed as required; others get the `?` suffix:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "number" }
  },
  "required": ["name"]
}
```

Generates:
```ts
{
  name: string;
  age?: number;
}
```

### JSDoc Descriptions

Schema `description` fields become JSDoc comments:

```json
{
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "description": "User email address"
    }
  }
}
```

Generates:
```ts
{
  /** User email address */
  email: string;
}
```

---

## Regenerating Types

Re-run the generator whenever your server manifest changes:

```bash
# Add to package.json scripts
{
  "scripts": {
    "generate:types": "npx capskit generate --url http://localhost:3000 --output src/capskit-types.ts"
  }
}
```

```bash
npm run generate:types
```

---

## Next Steps

- [Client SDK](./client.md) — Full client package documentation
- [React](./react.md) — React hooks and provider
- [Vue](./vue.md) — Vue composables
