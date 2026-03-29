# Adapter Plugin Compatibility Validation

## Pattern
Validate third-party adapter plugins at load time using semver-based version compatibility checks.

## Implementation

### Manifest Contract
```typescript
interface AdapterPluginManifest {
  name: string;
  version: string;           // semver
  capskitVersion: {
    min: string;            // inclusive
    max?: string;           // exclusive (use "max" not "maxVersion")
  };
  capabilities: ('http' | 'websocket')[];
}
```

### Version Compatibility Check
```typescript
import semver from 'semver';

function checkVersionCompatibility(
  adapterVersion: string,
  capsKitVersion: { min: string; max?: string }
): boolean {
  const range = capsKitVersion.max
    ? `${capsKitVersion.min} - ${capsKitVersion.max}`
    : `>=${capsKitVersion.min}`;
  return semver.satisfies(capsKitVersion, range);
}
```

### Error Message Pattern
Provide actionable error messages with npm install commands:
```typescript
function buildIncompatibilityError(adapter: AdapterPluginManifest, currentVersion: string): string {
  return [
    `Adapter '${adapter.name}' v${adapter.version} is not compatible`,
    `with CapsKit v${currentVersion}.`,
    ``,
    `Required: ^${adapter.capskitVersion.min}`,
    adapter.capskitVersion.max 
      ? `Supported: <${adapter.capskitVersion.max}`
      : ``,
    ``,
    `npm install ${adapter.name}@^<compatible-version>`,
  ].join('\n');
}
```

## Key Decisions
- `max` is **exclusive** (not inclusive) to allow smooth minor version transitions
- Adapters without manifests are allowed (backwards compatible)
- Use `semver.satisfies()` not naive string comparison

## Related
- Task: 034-plugin-contract-governance
- Docs: docs/plugins/adapter-contract.md
