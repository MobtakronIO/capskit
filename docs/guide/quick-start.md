# Quick Start

Initialize a completely pure business engine in under a minute.

## Installation

Currently, CapsKit is managed internally. Install the core package (assuming NPM publishing is configured!):

```bash
npm install @mobtakronio/capskit elysia
```

## 1. Create a Capsule Manifest

Create a basic capsule (e.g., `src/capsules/math/manifest.ts`) and define its actions in a declarative manner.

```ts
import { CapsuleManifest } from '@mobtakronio/capskit';

export const service: CapsuleManifest = {
  name: 'math-capsule',
  actions: {
    sum: {
      handler: async (payload) => ({ result: payload.a + payload.b }),
      description: 'Sums two integers'
    }
  },
  routes: [
    { method: 'POST', path: '/sum', action: 'sum' }
  ]
};
```

## 2. Boot the Platform

In your host application (`index.ts`), initialize the system Kernel and inject external dependencies.

```ts
import { createCapsKit } from '@mobtakronio/capskit';
import { Elysia } from 'elysia';
import * as path from 'path';

async function bootstrap() {
  const { capskit } = await createCapsKit({
    capsules: [
      { type: 'directory', path: path.join(process.cwd(), 'src/capsules') }
    ],
    dependencies: { database: {} } 
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

Done! You now have a framework-agnostic capability system wrapped gracefully in an Elysia server.

## 3. Invoke Capabilities Internally

If you need to call a capability explicitly from code (e.g., inside an automated CRON job or a terminal tool), never write framework logic. Simply instantiate a **Capsule Client**:

```ts
const math = capskit.use('math-capsule');

// Look! It acts just like a native Javascript module!
const { result } = await math.sum({ a: 15, b: 30 });
console.log('Result:', result);
```
