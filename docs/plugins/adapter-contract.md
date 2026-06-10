# Adapter Plugin Contract

CapsKit supports third-party adapter plugins that provide HTTP and WebSocket transport capabilities. Adapters must follow a defined contract to ensure compatibility with the CapsKit kernel.

> **Note**: Adapters work with the function-based `.cap.ts` format. They introspect cap metadata (`CapMeta`) to generate routes and wire hook caps. See [Capsules](../guide/capsules.md) for cap format details.

## Adapter Function Contract

An adapter is a factory function that receives the platform instance and returns a configured server or router.

### Required Signature

```typescript
type AdapterFactory = (
  platform: CapsKitPlatform,
  options?: AdapterOptions,
) => Promise<Server> | Server;
```

### Example Adapter

```typescript
// my-adapter/index.ts
import type { CapsKitPlatform } from '@mobtakronio/capskit';

export interface MyAdapterOptions {
  port?: number;
  prefix?: string;
}

export async function createMyAdapter(
  platform: CapsKitPlatform,
  options: MyAdapterOptions = {},
) {
  const { port = 3000, prefix = '' } = options;

  // Read cap metadata from the platform
  const manifests = platform.getManifests();

  // Build routes from cap manifests
  for (const manifest of manifests) {
    for (const cap of manifest.caps || []) {
      if (cap.routes) {
        for (const route of cap.routes) {
          // Register route with the framework
        }
      }
    }
  }

  return server;
}
```

## Version Compatibility

CapsKit uses semantic versioning (semver) for compatibility:

- **Major version** (X.0.0): Breaking changes
- **Minor version** (0.X.0): New features, backwards compatible
- **Patch version** (0.0.X): Bug fixes, backwards compatible

### Compatibility Rules

1. **Adapters declare peer dependency**: Use `peerDependencies` in `package.json` to declare the compatible CapsKit version range.
2. **CapsKit validates at load time**: When an adapter is loaded, CapsKit validates that the current kernel version is compatible.
3. **Actionable error messages**: If incompatibility is detected, CapsKit provides a clear error message with upgrade instructions.

### Example package.json

```json
{
  "name": "@myorg/capskit-http-myframework",
  "version": "1.0.0",
  "peerDependencies": {
    "@mobtakronio/capskit": ">=0.3.0 <1.0.0"
  }
}
```

## Capabilities

Adapters indicate what transport mechanisms they support:

| Capability | Description |
|-----------|-------------|
| `'http'` | HTTP request/response handling |
| `'websocket'` | WebSocket bidirectional communication |

A single adapter can support both HTTP and WebSocket.

## How Adapters Work with Caps

Adapters read `CapMeta` from each cap to determine:

1. **Routes** — `meta.routes` defines HTTP method + path mappings
2. **Hooks** — `meta.hooks` lists hook caps to chain
3. **Input validation** — `meta.inputSchema` defines the expected payload shape
4. **Events** — `meta.events` declares published/subscribed events

The adapter's job is to translate these declarations into framework-specific middleware and handlers.

## Testing Your Adapter

```typescript
import { createCapsKitPlatform } from '@mobtakronio/capskit';
import { createMyAdapter } from '@myorg/capskit-http-myframework';

test('adapter builds routes from cap metadata', async () => {
  const platform = await createCapsKitPlatform();
  await platform.boot({ body: { capsuleDirs: ['./test-caps'] } });

  const server = await createMyAdapter(platform, { port: 0 });

  // Verify routes were registered
  expect(server.routes).toHaveLength(3);
});
```

## Best Practices

1. **Read cap metadata, don't assume structure**: Use `platform.getManifests()` to discover capsules and their caps at runtime.
2. **Respect hook chains**: Apply hook caps in the order declared by `meta.hooks`.
3. **Validate input schemas**: Use `meta.inputSchema` to validate incoming requests before calling caps.
4. **Handle errors gracefully**: Wrap cap calls in try/catch and translate `FrameworkError` to appropriate HTTP status codes.
5. **Keep adapters thin**: The adapter should only translate between framework conventions and the CapsKit platform. Business logic stays in caps.

## See Also

- [CapsKit Documentation](../index.md)
- [Quick Start](../guide/quick-start.md)
- [Architecture](../guide/architecture.md)
