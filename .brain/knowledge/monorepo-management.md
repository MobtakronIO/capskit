# Monorepo Management & Publishing Guide

## Architecture

The CapsKit project is structured as a workspace-based monorepo using `npm workspaces`. This allows for a clean separation between the core kernel and its extension ecosystem (adapters, capsules).

### Package Naming Convention

- Core package: `@mobtakronio/capskit` (located in `packages/capskit`)
- Ecosystem packages: `@mobtakronio/capskit-<transport>-<framework>` or `@mobtakronio/capskit-<extension>`
  - Example: `@mobtakronio/capskit-http-elysia`
  - Example: `@mobtakronio/capskit-websocket-elysia`

## Registry Configuration

Ensure each package in `packages/*/package.json` includes:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

## Build and Test Workflows

### Build Everything
```bash
npm run build
```
This runs the `build` script in all workspaces.

### Test Everything
```bash
npm run test
```

### Build a Specific Package
```bash
npm run build -w @mobtakronio/capskit
```

## Creating New Adapters

1. Create a new directory in `packages/capskit-<type>-<name>`.
2. Initialize `package.json` with the naming convention.
3. Depend on `@mobtakronio/capskit` as a peer dependency.
4. Export a factory function (e.g., `createRouter` or `createSocket`) as the default export.
5. Follow the adapter contracts defined in the core transport capsules.

## Publishing

Use a tool like `lerna` or `changesets` for monorepo versioning (not yet integrated, to be decided).
Currently, manual publishing is done by:

1. Update versions in workspaces.
2. Build all.
3. `npm publish -w <package-name>`.
