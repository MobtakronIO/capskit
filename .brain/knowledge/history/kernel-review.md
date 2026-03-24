# Review: src/kernel

## Overview
- Core runtime module for CapsKit, a capsule-based plugin/service system.
- Composed of two files:
  - `loader.ts` — dynamically discovers and loads capsule manifests from a directory.
  - `platform.ts` — main `CapsKit` class that registers capsules, manages actions, interceptors, and an event bus.

## Structure
- `/src/kernel/`
  - `loader.ts` — `loadCapsules(capsulesDir)` reads subdirectories, looks for `manifest.ts` or `manifest.js`, then dynamically imports them.
  - `platform.ts` — `CapsKit` class implementing `ICapsKit`:
    - `start()` boots built-in capsules, loads custom capsules from config, optionally runs a boot action.
    - `registerCapsule(manifest)` validates deps, registers the manifest and its actions.
    - `call(actionName, payload)` runs an action with pre/post hooks and interceptors.
    - `emit(event, data)` dispatches events to registered subscribers.
    - `use(capsuleName)` returns a proxy for calling capsule actions.
    - `describe(capsuleName)` returns a capsule manifest.

## Key Patterns
- **Capsule pattern**: each capsule declares a manifest (name, actions, routes, events).
- **Dependency injection**: dependencies passed via `CapsKitConfig` and merged with a built-in `capskit` reference.
- **Interceptor pipeline**: middleware-style chain for wrapping action calls.
- **Event-driven**: publish/subscribe via `emit()` and `subscribes` in manifests.
- **Dynamic loading**: discovers capsules at runtime from filesystem.
- **Proxy-based API**: `use('capsuleName')` returns a typed proxy for ergonomic action calls.

## Issues Found
- **Platform-specific path handling**: `loader.ts:30` uses `file://${finalPath}` which only works on Windows. On Unix, this creates invalid URLs (`file:///absolute/path`). Should detect `process.platform` or use `pathToFileURL` from the `url` module.
- **Silent failure on missing manifests**: if a directory lacks a manifest, `loader.ts` silently skips it with no warning; could make debugging harder.
- **No error propagation from boot action**: `platform.ts:42` calls `this.call()` but if it throws, the error is not caught or logged before `start()` returns.
- **Event emission is fire‑and‑forget**: `emit()` logs asynchronously but doesn't return a Promise or allow awaiting subscribers; downstream actions run in the background.
- **Partial implementation comment**: line 57 in `platform.ts` has a comment "In a real implementation, we would dynamic import here based on string path" — indicates unfinished code for string-based action handlers.
- **validateDependencies only checks manifest.requires**: the `config.dependencies` aren't validated for completeness; a missing required dependency could surface later at runtime.
- **No unit tests** for loader or platform.
- **Type safety gaps**: `dependencies: Record<string, any>` uses `any`; could be stronger.
- **Console logging in production**: heavy use of `console.log` / `console.error` — may want a proper logger interface.

## Recommendations
1. **Fix Windows‑only dynamic import**:
   - Use `import('file://' + finalPath)` conditionally, or use Node's `pathToFileURL(finalPath)` from the `url` module for cross‑platform compatibility.
2. **Add logging for skipped directories** in `loader.ts` when no manifest is found.
3. **Wrap boot action call in try/catch** and surface errors clearly (or let them propagate with context).
4. **Consider async event emission**: return a `Promise` that resolves after all subscribers complete, or provide a `emitAsync` variant.
5. **Complete the string‑path action handler** at `platform.ts:57` or remove the comment if not planned.
6. **Add validation for config.dependencies** against known required deps, or document that `manifest.requires` is the only source of truth.
7. **Introduce a logger interface** (e.g., `config.logger`) and replace `console.*` calls throughout.
8. **Add unit tests** for `loadCapsules` (mock fs) and for `CapsKit.call` with interceptors.
9. **Strengthen typing**: replace `Record<string, any>` for dependencies with a generic `Record<string, unknown>` or a typed interface.
10. **Document the `use()` proxy pattern** and ensure it matches the expected usage in documentation.

## Worth Preserving
- Clean separation between loading (`loader.ts`) and runtime (`platform.ts`).
- Interceptor middleware pattern is elegant and reusable.
- Event bus provides a useful decoupled communication channel.
- The `use()` proxy gives a very ergonomic API for calling capsule actions.
- Config-driven startup (`capsuleDirs`, `boot`, `dependencies`) keeps the core flexible.

## How to Proceed (Optional)
- I can convert these findings into a task list (e.g., fix cross‑platform import, add tests, introduce logger).
- If you want, I can implement the cross‑platform fix in `loader.ts` and add a small test scaffold.

Note: This review is saved to `.brain/knowledge/kernel-review.md` as part of the project knowledge repository.
