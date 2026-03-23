# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Test Commands

- `npm run build` - Build with tsup (outputs CJS + ESM to dist/)
- `npm run dev` - Watch mode with tsup
- `npm run test` - Run tests with bun (executes test/verify.test.ts only)
- `npm run docs:dev` - VitePress dev server for documentation

## Critical Capsule Patterns

**Capsule Export**: Capsules MUST export a `service` constant (not `manifest` or `default`) containing the CapsuleManifest

**Action Handler Registration**: Action handlers can be either:
- Direct function imports: `handler: sum` (from `import { sum } from './actions/sum'`)
- String paths for dynamic loading: `handler: './actions/sum'`

**Action Naming Convention**: Actions are referenced as `capsuleName.actionName` (e.g., `calculator.sum`)

**Capsule Loading Order** (platform.ts):
1. Built-in capsules (statically imported: system, http, calculator, websocket)
2. Auto-discovered capsules from src/capsules directory
3. Custom capsules from config.capsuleDirs

**Manifest Extension**: CapsuleManifest allows arbitrary properties via index signature (routes, sockets, traits, etc.)

**Event System**: Events are fire-and-forget with automatic error catching to prevent unhandled promise rejections

**Interceptor Chain**: Interceptors run before pre-hooks, then handler, then post-hooks. Interceptors must call `next()` exactly once.

**Trait Handlers**: Route traits require external traitHandlers to be provided in boot config (e.g., `traitHandlers: { auth: (role, ctx) => { ... } }`)

**Internal API Access**: Adapters use `@ts-ignore` to access internal `getManifests()` method from CapsKit instance

**Proxy-based Capsule Access**: The `use()` method creates a Proxy that automatically prefixes action calls with the capsule name

**Boot Action**: The boot action in config executes after all capsules are loaded and returns merged with the CapsKit instance

**Dependency Injection**: Capsules declare dependencies in `requires` array, and the CapsKit instance is automatically injected as `capskit` dependency

## Code Style

- TypeScript strict mode enabled
- ESNext target with ESNext modules
- Module resolution: Bundler
- Path alias: `@mobtakronio/capskit` maps to `./src/index.ts`
- Test files in test/ directory (not alongside source files)
- Build output: dist/ with CJS, ESM, and TypeScript declarations