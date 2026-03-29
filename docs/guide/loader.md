# Loader & Discovery

The CapsKit kernel discovers and loads capsules from various sources. This guide covers capsule sources, load precedence, and customization options.

## Capsule Sources

Capsules can be loaded from three types of sources:

### 1. Directory

Load all capsules from a folder:

```ts
const capskit = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ]
})
```

The loader scans the directory for subfolders containing `manifest.ts` or `manifest.js`:

```
src/capsules/
├── user/
│   ├── manifest.ts
│   └── actions/
├── order/
│   ├── manifest.ts
│   └── actions/
└── payment/
    ├── manifest.ts
    └── actions/
```

### 2. Manifest Inline

Define a capsule directly in the config:

```ts
const capskit = await createCapsKit({
  capsules: [
    {
      type: 'manifest',
      manifest: {
        name: 'math',
        actions: {
          sum: {
            handler: async (payload) => ({
              result: payload.a + payload.b
            }),
            schema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' }
              }
            }
          }
        }
      }
    }
  ]
})
```

Useful for quick prototypes or tiny capsules.

### 3. NPM Package

Import a capsule from an npm package:

```ts
const capskit = await createCapsKit({
  capsules: [
    { type: 'package', name: '@myorg/auth-capsule' },
    { type: 'package', name: '@myorg/logging-capsule' }
  ]
})
```

The package must export a `CapsuleManifest` as `service` or `default`:

```ts
// @myorg/auth-capsule/dist/index.js
export const service = {
  name: 'auth-capsule',
  actions: { /* ... */ }
}

// OR
export default {
  name: 'auth-capsule',
  actions: { /* ... */ }
}
```

## Load Precedence

Sources are loaded in the order they appear in the `capsules` array. Later sources **override** earlier ones:

```ts
const capskit = await createCapsKit({
  capsules: [
    { type: 'directory', path: './src/capsules' }, // Loaded first
    { type: 'manifest', manifest: localMath },     // Overrides if same name
    { type: 'package', name: '@myorg/analytics' }  // Loaded last, highest priority
  ]
})
```

### Name Collision Policy

If two capsules have the same name:
- The **later** one wins
- The earlier one is **not** registered
- A warning is logged (enable debug logging to see)

### Dependency Resolution

Dependencies (`requires`) are resolved **after** all capsules are loaded. If a capsule declares `requires: ['auth']`, the kernel ensures `auth-capsule` is loaded first.

If a required capsule is not found, boot fails with `DependencyError`.

## Validation

The loader performs several validations on capsule manifests during the loading process. Invalid manifests are rejected with descriptive errors to help you quickly identify and fix issues.

### Action Key Uniqueness

Each action key within a capsule must be unique. The loader rejects manifests with duplicate action keys:

```
Error: Capsule 'my-capsule' has duplicate action key: 'create'
```

**Fix**: Ensure each action in the `actions` object has a unique key.

### Name Format Validation

Capsule names and action names must follow strict format rules. Names must match the pattern `^[a-zA-Z0-9_-]+$`:

```
Error: Invalid capsule name 'my-capsule!' - must match ^[a-zA-Z0-9_-]+$
Error: Invalid action name 'create-user' - must match ^[a-zA-Z0-9_-]+$
```

**Allowed characters**:
- Letters (a-z, A-Z)
- Numbers (0-9)
- Underscores (_)
- Hyphens (-)

**Fix**: Rename your capsule or action to use only allowed characters.

### Non-Empty Actions

A capsule must define at least one action:

```
Error: Capsule 'empty-capsule' has no actions defined
```

**Fix**: Add at least one action to your capsule's `actions` object.

### Requires Array Validation

If a capsule specifies `requires`, it must be an array of strings:

```
Error: Capsule 'my-capsule' requires field must be an array of strings
```

**Fix**: Ensure `requires` is an array:

```ts
{
  name: 'my-capsule',
  requires: ['auth-capsule', 'logging-capsule'], // Correct
  actions: { /* ... */ }
}
```

### Events Structure Validation

If a capsule defines `events`, it must be a properly structured object with `subscribes` and/or `publishes`:

```
Error: Capsule 'my-capsule' events must be an object with 'subscribes' and/or 'publishes'
```

**Valid event structures**:

```ts
{
  name: 'my-capsule',
  events: {
    subscribes: ['user.created', 'order.placed'],   // Valid
    publishes: ['notification.sent']                // Valid
  },
  actions: { /* ... */ }
}

// Or with both:
events: {
  subscribes: ['user.created'],
  publishes: ['notification.sent']
}
```

## Loader Behavior

### Detailed Loading Process

1. **Built-in capsules** are registered first (hardcoded list for packaging safety)
2. **Custom sources** are processed in declared order
3. For each source:
   - **Directory**: Scan subfolders → import `manifest.ts` → extract `service`/`manifest`/`default` → store `__capsuleDir` for handler resolution
   - **Manifest**: Use provided object directly
   - **Package**: Import package → extract `service`/`default` → register
4. **Dependency validation**: Check all `requires` are satisfied
5. **Boot action** (if specified) is executed

### Handler Resolution

When a manifest uses a relative path for handler:

```ts
{
  handler: './actions/create'
}
```

The loader resolves it relative to the capsule's directory (`__capsuleDir`). This enables:

```
my-capsule/
├── manifest.ts
├── actions/
│   └── create.ts  ← './actions/create' resolves here
└── utils/
    └── db.ts
```

## Customization

### `capsuleDirs` (Deprecated)

Older code uses `capsuleDirs` instead of `capsules`:

```ts
// Legacy (still supported)
const capskit = await createCapsKit({
  capsuleDirs: ['./src/capsules']
})
```

This is equivalent to:

```ts
{
  capsules: [
    { type: 'directory', path: './src/capsules' }
  ]
}
```

**New code should use `capsules`** for explicit precedence.

### Skipping Files

The loader only looks for:
- `manifest.ts` (TypeScript)
- `manifest.js` (JavaScript)

Other files in the capsule folder are ignored unless imported by actions.

### Dynamic Loading

For advanced scenarios, capsules can be loaded programmatically:

```ts
const { loadCapsules } = await import('@mobtakronio/capskit/kernel/loader')
const manifests = await loadCapsules('./path/to/capsules')
for (const manifest of manifests) {
  await capskit.registerCapsule(manifest, capsuleDir)
}
```

## Best Practices

### 1. Explicit Source Order

Be explicit about precedence. Don't rely on directory scanning order:

```ts
// Good: explicit, predictable
capsules: [
  { type: 'package', name: '@myorg/core-capsules' },
  { type: 'directory', path: './src/capsules' },
  { type: 'manifest', manifest: hotfixPatch }
]

// Bad: ambiguous
capsuleDirs: ['./src', './overrides', './vendor']
```

### 2. Atomic Capsules

Each capsule folder should be a complete, self-contained unit. Avoid splitting a single concept across multiple capsules.

### 3. Use Package Source for Shared Capsules

If you have capsules used across multiple projects, publish them as npm packages:

```ts
// monorepo: packages/auth-capsule
// apps/api: 
{
  capsules: [
    { type: 'package', name: '@myorg/auth-capsule' }
  ]
}
```

### 4. Version Pinning

When using package sources, pin versions in `package.json` to avoid breaking changes.

## Troubleshooting

### "Failed to load capsule manifest"

```
Error: Failed to load capsule manifest at ./src/capsules/user/manifest.ts: 
  Cannot find module 'typescript'
```

**Cause**: TypeScript not installed or `manifest.ts` can't be compiled.

**Fix**: Either:
- Install TypeScript: `npm install typescript`
- Use `manifest.js` (transpile before boot)
- Use `ts-node` register hook if available

### "Capsule 'X' not found"

```
Error: Capsule 'auth-capsule' required by 'order-capsule' not found
```

**Fix**:
- Check spelling of capsule names
- Ensure the capsule source is in `capsules` array
- Verify load order—`auth-capsule` must be loaded before `order-capsule`

### "Handler file not found"

```
Error: Cannot find module './actions/create'
```

**Fix**: Handler paths are relative to the capsule directory. Ensure the file exists at:
```
capsule-dir/
├── manifest.ts (handler: './actions/create')
└── actions/
    └── create.ts
```

## Next Steps

- **Architecture**: Review overall system design
- **Capsules**: Deep dive into manifest structure
- **Adapters**: Learn how capsules are exposed via HTTP/WebSocket
- **Interceptors**: Add global middleware
- **Events**: Implement pub/sub patterns
