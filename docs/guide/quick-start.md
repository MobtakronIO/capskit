# Quick Start

Initialize a completely pure business engine in under a minute.

## Installation

Currently, CapsKit is managed internally. Install the core package (assuming NPM publishing is configured!):

```bash
npm install @mobtakronio/capskit elysia
```

## 1. Create Your First Cap

CapsKit applications are composed of **Caps** — classes whose methods are pure business logic — and grouped into **Capsules** via a registry. Start by creating a simple calculator cap:

```bash
mkdir -p src/capsules/math-capsule/.cap/calculator
```

Create the business logic in `cap.ts`:

```ts
// src/capsules/math-capsule/.cap/calculator/cap.ts
import { ActionInput, CapContext } from '@mobtakronio/capskit';

export default class CalculatorCap {
  // Index signature required for dynamic dispatch
  [action: string]: any;

  async sum(input: ActionInput, _ctx: CapContext): Promise<{ result: number }> {
    const { a, b } = input.body;
    return { result: a + b };
  }
}
```

Create the metadata contract in `cap.meta.ts`:

```ts
// src/capsules/math-capsule/.cap/calculator/cap.meta.ts
import { CapMeta } from '@mobtakronio/capskit';

export const meta: CapMeta = {
  name: 'calculator',
  routes: [
    { method: 'POST', path: '/sum', action: 'sum' },
  ],
  actions: {
    sum: {
      description: 'Adds two numbers together',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
    },
  },
};
```

Compose the cap into a capsule via `caps.ts`:

```ts
// src/capsules/math-capsule/caps.ts
import { CapsuleRegistry } from '@mobtakronio/capskit';
import CalculatorCap from './.cap/calculator/cap';
import { meta as calcMeta } from './.cap/calculator/cap.meta';

const mathCapsule: CapsuleRegistry = {
  name: 'math-capsule',
  caps: [
    { class: CalculatorCap, meta: calcMeta },
  ],
};

export default mathCapsule;
```

## 2. Boot the Platform

In your host application (`index.ts`), initialize the system Kernel and inject external dependencies. Pass your `CapsuleRegistry` directly:

```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';

async function bootstrap() {
  const { capskit } = await createCapsKit({
    capsules: [
      { type: 'caps-registry', path: 'src/capsules/math-capsule' },
      // Or load an entire directory:
      // { type: 'directory', path: 'src/capsules' },
    ],
    dependencies: { database: {} },
  });

  // 1. Generate an Elysia router automatically!
  const { router } = await capskit.use('http').buildRouter({ adapter: 'elysia' });

  // 2. Start specific framework listeners
  new Elysia()
    .use(router)
    .listen(3000);
}

bootstrap();
```

Done! You now have a framework-agnostic capability system wrapped gracefully in an Elysia server. The HTTP route `POST /sum` is automatically bound from your cap's `cap.meta.ts` route definition.

## 3. Invoke Capabilities Internally

If you need to call a capability explicitly from code (e.g., inside an automated CRON job or a terminal tool), never write framework logic. Simply instantiate a **Capsule Client**:

```ts
const math = capskit.use('math-capsule');

// Look! It acts just like a native Javascript module!
const { result } = await math.sum({ a: 15, b: 30 });
console.log('Result:', result);
```

## Next Steps

- **Capsules & Caps**: Learn the full Cap model — [Capsules & Caps](./capsules.md)
- **Architecture**: Understand the three-layer design — [Architecture Overview](./architecture.md)
- **Adapters**: Configure HTTP, WebSocket, and more — [HTTP Adapters](./adapters/http.md)
- **Testing**: Write tests for your caps — [Testing](./testing.md)
