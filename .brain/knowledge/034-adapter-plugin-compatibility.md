# Adapter Plugin Version Compatibility

## Key Learnings

### semver.satisfies() for Range Checking
When checking if a version is within a compatible range, use `semver.satisfies()`:
```typescript
import semver from 'semver';

// For ranges like "1.0.0 - 2.0.0"
semver.satisfies('1.5.0', '>=1.0.0 <2.0.0'); // true

// Building ranges dynamically
const range = max 
  ? `${min} - ${max}` 
  : `>=${min}`;
semver.satisfies(currentVersion, range);
```

### Backwards Compatibility
Always design plugin systems to be backwards compatible:
```typescript
// Adapters without manifests should still work
if (!manifest) {
  console.warn(`Adapter ${pkgName} has no manifest - compatibility unchecked`);
  return; // Allow to load
}
```

### Error Message Design
Error messages should be actionable - include exact commands to fix:
```typescript
`npm install ${adapter.name}@^<compatible-version>`
```

## Glossary
- **Manifest**: JSON file declaring adapter metadata and compatibility requirements
- **capskitVersion.max**: Exclusive upper bound (adapter supported below this version)
- **semver.satisfies()**: Checks if a version satisfies a range

## Related
- Task: 034-plugin-contract-governance
- Pattern: 034-adapter-plugin-compatibility.md
- Docs: docs/plugins/adapter-contract.md
