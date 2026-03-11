# 🧠 .brain/ — Project Memory

This directory is the project's living memory. The AI reads it before doing any work and writes to it after completing work.

## Directories

### `patterns/`
Reusable code and architecture patterns discovered in this project. One pattern per file.

### `rules/`
Project constitution and constraints. Start with `constitution.md` — the governing principles that guide all development decisions.

### `knowledge/`
Captured learnings, code reviews, domain-specific context, and discussion summaries. Anything the AI (or you) should remember.

### `tasks/`
Active task breakdowns. Each file represents a work item (feature, bugfix, refactor, chore). Completed tasks move to `tasks/archive/` to keep context lean.

### `decisions/`
Architectural Decision Records (ADRs). Significant choices with context, alternatives considered, and consequences.

## Context Management
The AI only reads files in `tasks/` root — never in `tasks/archive/`. This prevents old completed work from consuming context. If you need to reference old work, explicitly ask the AI to check the archive.
