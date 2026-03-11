---
title: Prepare CapsKit for NPM Publishing
type: configuration
status: done
created: 2026-03-11
---

## Objective
Prepare the `@capskit/core` package to be legally and technically ready for publication to the public npm registry. This involves configuring build scripts, optimizing package exports, and writing a solid root README.

## Plan
1. Clean up `package.json` at the root and inside `packages/core`.
2. Ensure the `@capskit/core` package specifies proper CommonJS and ESModule `exports`, `main`, and `types`.
3. Add a TypeScript compilation step (using `tsc` or a bundler like `tsup` or `bun build`) to compile the source to `/dist`.
4. Create a `.npmignore` to prevent publishing test files, `.brain`, and examples.
5. Add scripts (`build`, `prepublishOnly`) to automate the build check before a user runs `npm publish`.
6. Draft a professional `README.md` for both the GitHub repository root and the NPM package.

## Tasks
- [x] Install a bundler or configure `tsconfig.json` to output `/dist`.
- [x] Update `package.json` `exports` mapping so `import { createPlatform } from '@capskit/core'` works cleanly.
- [x] Draft a high-quality `README.md` introducing the framework.
- [x] Verify build output and type declarations.

## Verification
- Running `npm run build` succeeds perfectly.
- Running `npm pack` inside `packages/core` produces a lean `.tgz` archive containing only the `dist/` files, `package.json`, and `README.md`.
