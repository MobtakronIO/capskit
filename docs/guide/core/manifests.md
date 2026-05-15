# Manifests & Caps

CapsKit supports two formats for defining capsules. The **Cap model** (recommended) uses `caps.ts` registries and `.cap/<name>/` directories. The **legacy manifest** format uses a standalone `manifest.ts` file.

## The Cap Model (Recommended)

Caps are composed via a `CapsuleRegistry` in `caps.ts`:

```ts
// caps.ts
import { HelloCap } from './.cap/hello/cap'
import { CapsuleRegistry } from '@mobtakronio/capskit'

export const registry: CapsuleRegistry = {
  name: 'my-capsule',
  registry: {
    'hello': HelloCap
  }
}
```

Each Cap has a class (`cap.ts`) and metadata (`cap.meta.ts`):

```ts
// .cap/hello/cap.ts
export default class HelloCap {
  async greet(payload: { name?: string }) {
    return { message: `Hello, ${payload.name || 'World'}!` }
  }
}
```

```ts
// .cap/hello/cap.meta.ts
import { CapMeta } from '@mobtakronio/capskit'

export const meta: CapMeta = {
  name: 'hello',
  description: 'Greeting cap',
  actions: {
    greet: { description: 'Return a greeting message' }
  }
}
```

See [Capsules](/guide/capsules) for the full Cap model documentation.

## Legacy Manifest (Backward Compatible)

Every legacy capsule exports a `CapsuleManifest` in a `manifest.ts` file:

```ts
export const service: CapsuleManifest = {
  name: 'my-capsule',
  actions: {
    hello: {
      handler: async (payload) => {
        return `Hello ${payload.name}`;
      }
    }
  }
}
```

The legacy format is fully supported and will continue to work. New projects should prefer the Cap model for its better organization and richer metadata.
