---
title: Build CapsKit Documentation Site
type: feature
status: done
created: 2026-03-11
---

## Objective
Create a professional, interactive documentation website for the CapsKit framework. This is essential for developer onboarding and establishing CapsKit as a legitimate open-source platform.

## Plan
1. Initialize a modern documentation site generator like **VitePress** in the project root under `/docs`.
2. Configure the site title, layout, and sidebar navigation to mimic a premium framework.
3. Establish the core documentation sections: 
   - Introduction (What is CapsKit? Capability vs. Controller architecture)
   - Quick Start (Installation, `index.ts` setup)
   - Concepts (Manifests, Actions, `pre`/`post` hooks)
   - Advanced (Kernel Interceptors, Event Bus, HTTP Route Traits)
4. Ensure the site looks excellent in dark mode and includes responsive code snippets.

## Tasks
- [x] Initialize `/docs` using `npx vitepress init` (or equivalent).
- [x] Configure `config.mts` (or equivalent config) for navigation and theming.
- [x] Write the `index.md` landing page.
- [x] Add the `introduction.md` and `quick-start.md` files.

## Verification
- Running `npm run docs:dev` starts a server serving a beautiful, fully functional documentation website locally.
