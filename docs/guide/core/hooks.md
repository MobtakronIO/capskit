# Action Pre/Post Hooks

Hooks allow you to run logic before and after an action handler.

> **Note**: Hooks work identically in both the **Cap model** (`caps.ts` + `.cap/` directories) and the legacy `manifest.ts` format. In the Cap model, hooks are configured per-action in `cap.meta.ts`. See the detailed [Hooks](../hooks.md) guide and [Capsules](../capsules.md) for Cap model documentation.

## Pre Hooks

Use pre-hooks for validation or logging.

## Post Hooks

Use post-hooks to transform the result before it returns to the caller.
