# Adapter Plugin Contract

CapsKit supports third-party adapter plugins that provide HTTP and WebSocket transport capabilities. Adapters must follow a defined contract to ensure compatibility with the CapsKit kernel.

> **Note**: This document covers the adapter plugin contract. Adapters work with both the **Cap model** (`caps.ts` + `.cap/` directories) and the legacy `manifest.ts` format — they introspect the kernel's manifest registry regardless of the source format. See [Capsules](../guide/capsules.md) for Cap model details.

## Manifest Contract

Adapters can export an `AdapterPluginManifest` to declare their compatibility and capabilities. This manifest enables CapsKit to:

- Verify version compatibility at load time
- Provide actionable error messages when incompatibilities are detected
- Support future capability discovery

### Required Fields

```typescript
interface AdapterPluginManifest {
  /** Adapter package name */
  name: string;
  
  /** Adapter version (semver) */
  version: string;
  
  /** Compatible capskit version range */
  capskitVersion: {
    /** Minimum compatible capskit version (inclusive) */
    min: string;
    /** Maximum compatible capskit version (inclusive), undefined = no upper bound */
    max?: string;
  };
  
  /** Capabilities: 'http', 'websocket', or ['http', 'websocket'] */
  capabilities: string[];
  
  /** Optional description */
  description?: string;
}
```

### Example Manifest

```typescript
// my-adapter/index.ts
export const manifest = {
  name: '@myorg/capskit-http-myframework',
  version: '1.2.0',
  capskitVersion: {
    min: '0.3.0',
    max: '1.0.0'
  },
  capabilities: ['http'],
  description: 'MyFramework adapter for CapsKit HTTP transport'
};

export default createRouter;
```

## Version Compatibility Policy

CapsKit uses semantic versioning (semver) for compatibility:

- **Major version** (X.0.0): Breaking changes
- **Minor version** (0.X.0): New features, backwards compatible
- **Patch version** (0.0.X): Bug fixes, backwards compatible

### Compatibility Rules

1. **Adapters declare minimum capskit version**: The `capskitVersion.min` field specifies the oldest CapsKit version the adapter supports.

2. **Adapters can declare maximum version**: The optional `capskitVersion.max` field specifies the newest CapsKit version the adapter has been tested against.

3. **CapsKit checks compatibility at load time**: When an adapter is loaded, CapsKit validates that the current kernel version falls within the declared range.

4. **Actionable error messages**: If incompatibility is detected, CapsKit provides a clear error message with upgrade instructions.

### Example Compatibility Declarations

```typescript
// Compatible with capskit 0.3.0 through 0.9.x
capskitVersion: {
  min: '0.3.0',
  max: '1.0.0'
}

// Compatible with capskit 0.3.0 and above (no upper limit)
capskitVersion: {
  min: '0.3.0'
}
```

## Publishing an Adapter

### 1. Create the Adapter Package

```typescript
// src/index.ts
import type { ICapsKit } from '@mobtakronio/capskit';

export const manifest = {
  name: '@myorg/capskit-http-myframework',
  version: '1.0.0',
  capskitVersion: {
    min: '0.3.0',
    max: '1.0.0'
  },
  capabilities: ['http'],
  description: 'MyFramework adapter for CapsKit'
};

export function createRouter(capskit: ICapsKit, options?: any) {
  // Your adapter implementation
  return myFrameworkApp;
}
```

### 2. Package.json Configuration

```json
{
  "name": "@myorg/capskit-http-myframework",
  "version": "1.0.0",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "@mobtakronio/capskit": ">=0.3.0 <1.0.0"
  }
}
```

### 3. Export the Manifest

Ensure your package exports the manifest:

```typescript
// Named export for manifest
export { manifest };

// Default export for the adapter function
export default createRouter;
```

## Error Messages

When an incompatibility is detected, CapsKit throws an actionable error:

### Version Too Low

```
Adapter '@myorg/capskit-http-myframework@1.0.0' requires capskit@^0.3.0 
but you're using @0.2.0. Run 'npm install @mobtakronio/capskit@^0.3.0' to upgrade.
```

### Version Too High

```
Adapter '@myorg/capskit-http-myframework@1.0.0' supports capskit@<1.0.0 
but you're using @1.5.0. The adapter may not be compatible with this capskit version.
```

## Backwards Compatibility

Adapters **without** a manifest continue to work exactly as before. CapsKit only performs compatibility checks when a manifest is present. This ensures:

- Existing adapters work without modification
- Gradual ecosystem migration to the manifest contract
- No breaking changes for current users

## Capabilities

The `capabilities` array indicates what transport mechanisms the adapter supports:

| Capability | Description |
|-----------|-------------|
| `'http'` | HTTP request/response handling |
| `'websocket'` | WebSocket bidirectional communication |

A single adapter can support both:

```typescript
capabilities: ['http', 'websocket']
```

## Testing Your Adapter

### Validate the Manifest

```typescript
import { validateAdapterManifest } from '@mobtakronio/capskit';

const manifest = {
  name: '@myorg/capskit-http-myframework',
  version: '1.0.0',
  capskitVersion: { min: '0.3.0' },
  capabilities: ['http']
};

const result = validateAdapterManifest(manifest);
if (!result) {
  throw new Error('Invalid manifest format');
}
```

### Test Version Compatibility

```typescript
import { checkVersionCompatibility } from '@mobtakronio/capskit';

const result = checkVersionCompatibility(
  '1.0.0',          // adapter version
  '0.3.5',          // capskit version in use
  { min: '0.3.0', max: '1.0.0' }
);

if (!result.compatible) {
  console.error(result.reason);
}
```

## Best Practices

1. **Always export a manifest**: Even if you're starting with simple adapters, the manifest enables better error handling and future compatibility.

2. **Use conservative version ranges**: Start with tight bounds and expand as you test newer CapsKit versions.

3. **Update the manifest when you test new versions**: When you verify compatibility with a new CapsKit version, update your `max` field.

4. **Provide clear error messages**: The manifest's `description` field helps users understand your adapter's purpose.

5. **Declare all capabilities**: If your adapter supports both HTTP and WebSocket, declare both in the `capabilities` array.

## See Also

- [CapsKit Documentation](../index.md)
- [HTTP Capsule](./http-capsule.md)
- [WebSocket Capsule](./websocket-capsule.md)
