---
title: Start with project directories setup
type: chore
status: done
created: 2026-03-11
---

## Objective
Initialize the base directory structure for the CapsKit monorepo. CapsKit uses a monorepo architecture with an ecosystem of core platform packages and example applications. Setting up the correct structure ensures that independent capsules and system components remain correctly separated and can be published or linked via workspace configuration.

## Plan
We will scaffold the root workspace and construct the required folders as defined in the `CapsKit.md` capability-centric architecture. 
The directory tree will look like this:
```text
capskit/
├── packages/
│   ├── core/
│   ├── types/
│   └── system-capsules/
└── examples/
    ├── trading-platform/
    │   └── capsules/
    └── accounting-platform/
        └── capsules/
```
We will also initialize `package.json` configurations using standard npm workspaces to manage dependencies between the core packages and the example applications.

## Tasks
- [x] Initialize the root monorepo `package.json` defining the `packages/*` and `examples/*` workspaces.
- [x] Scaffolding: Create `packages/core`, `packages/types`, and `packages/system-capsules` with placeholder `package.json` files and empty src directories.
- [x] Scaffolding: Create `examples/trading-platform` and `examples/accounting-platform` and their starting `capsules/` folders, along with baseline `package.json` configurations.

## Verification
- Running `npm install` at the root successfully links all internal workspaces.
- Directory structure correctly matches the definitions in `.brain/knowledge/CapsKit.md`.
