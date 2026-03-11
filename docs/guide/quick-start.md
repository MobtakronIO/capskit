# Quick Start

Initialize a completely pure business engine in under a minute.

## Installation

Currently, CapsKit is managed internally. Install the core package (assuming NPM publishing is configured!):

```bash
npm install @capskit/core elysia
```

## 1. Create a Capsule Manifest

Create a basic capsule (e.g., `src/capsules/math/manifest.ts`) and define its actions in a declarative manner.

```ts
import { CapsuleManifest } from '@capskit/core';

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
import { createPlatform } from '@capskit/core';
import { Elysia } from 'elysia';
import * as path from 'path';

async function bootstrap() {
  const platform = await createPlatform({
    capsuleDirs: [ path.join(process.cwd(), 'src/capsules') ],
    dependencies: { database: {} } 
  });

  await platform.start();

  // 1. Generate an Elysia router automatically!
  const { router } = await platform.call('http.buildRouter', { adapter: 'elysia' });

  // 2. Start specific framework listeners
  new Elysia()
    .use(router)
    .listen(3000);
}

bootstrap();
```

Done! You now have a framework-agnostic capability system wrapped gracefully in an Elysia server.
