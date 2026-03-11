# Manifests & Actions

CapsKit is driven by declarative manifests.

## The Manifest

Every capsule must export a `CapsuleManifest`.

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
