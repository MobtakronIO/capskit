---
title: Redesign docs to be inspired by ElysiaJS home + docs and cover all CapsKit features
type: refactor
status: active
priority: 🟡 high
created: 2026-03-24
tags: docs,design,branding,information-architecture
dependencies: 021-kernel-contract-hardening
---

## Objective
Rework CapsKit documentation and landing page under `docs/` to be inspired by the ElysiaJS homepage and documentation style, while fully covering all CapsKit ideas and features in a clear, modern information architecture.

## Impact
- Files:
  - docs/index.md
  - docs/.vitepress/config.*
  - docs/.vitepress/theme/*
  - docs/guide/* (new/updated)
  - docs/guide/architecture.md (new)
  - docs/guide/capsules.md (new)
  - docs/guide/actions-and-hooks.md (new)
  - docs/guide/events.md (new)
  - docs/guide/adapters.md (new)
  - docs/guide/configuration.md (new)
  - docs/guide/loader-and-discovery.md (new)
  - docs/guide/errors.md (new)
  - docs/guide/traits.md (new)
  - docs/guide/testing.md (new)
- New patterns:
  - Elysia-inspired hero/feature layout for landing page
  - Feature-driven docs nav (concepts → guides → API reference)
  - “Single source of truth” messaging adapted for CapsKit (contracts + schemas)

## Plan
1. Audit current docs structure and VitePress theme.
2. Define the information architecture that maps CapsKit features → docs sections.
3. Redesign `docs/index.md` to mirror Elysia’s hero + feature sections (without copying), tailored to CapsKit’s value props.
4. Update VitePress config (nav, sidebar, theme) for the new doc structure.
5. Write/expand guides to cover all CapsKit ideas and features.
6. Add quick-start + examples that align with capsules, actions, adapters, traits, events, and loader behavior.

## Tasks
- [ ] Review current docs + VitePress theme and identify reusable sections.
- [ ] Draft new IA: landing page sections, docs nav, guide taxonomy.
- [ ] Build Elysia-inspired landing page layout in `docs/index.md` (hero, CTA, feature grid, benchmarks-style section, contracts/typing focus, DX emphasis).
- [ ] Update VitePress config + sidebar to match new IA.
- [ ] Author core guides:
  - [ ] Architecture overview
  - [ ] Capsules and manifests
  - [ ] Actions, interceptors, hooks
  - [ ] Events and subscriptions
  - [ ] HTTP and WebSocket adapters
  - [ ] Traits and trait handlers
  - [ ] Loader/discovery + capsule sources precedence
  - [ ] Error model and error mapping
  - [ ] Testing and verification
- [ ] Add “Why CapsKit” and “Philosophy” sections aligned with Elysia’s design principles but specific to CapsKit.
- [ ] Add Quick Start and end-to-end example project.

## Acceptance Criteria
- [ ] Landing page is visually and structurally inspired by ElysiaJS, but uniquely CapsKit.
- [ ] Docs cover all CapsKit ideas and features with clear navigation.
- [ ] Every core concept has at least one guide and one runnable example snippet.
- [ ] Sidebar and nav provide a coherent journey from intro → advanced.

## Verification
- npm run docs:dev
- Manual review of landing page + all guide pages in browser

## Risks/Blockers
- Overfitting to Elysia’s design: ensure CapsKit messaging is distinct.
- Doc scope creep: prioritize core feature coverage first, then polish.
