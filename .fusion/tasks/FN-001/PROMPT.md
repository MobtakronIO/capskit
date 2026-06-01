# Task: FN-001 — Audit Uncommitted Changes Before Commit

**Created:** 2026-06-01
**Size:** S

## Review Level: 0 (None)

**Assessment:** Pure review/documentation task — no code is written, only existing uncommitted changes are audited and described.
**Score:** 0/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Mission

Audit and document all uncommitted working-tree changes across the project so the user understands exactly what was modified before they commit. The task catalogs each changed file, explains what each change does, groups related changes into logical categories, runs the test suite to confirm nothing is broken, and delivers a structured change summary.

## Dependencies

- **None**

## Context to Read First

Run `git diff` and `git status` at the start to see the full uncommitted picture. The bulk of the changes live in:

- `packages/capskit/src/capsule/events/helpers/match-event-pattern.helper.ts`
- `packages/capskit/src/capsule/events/index.ts`
- `packages/capskit/src/capsule/kernel/helpers/execute-cap.helper.ts`
- `packages/capskit/src/capsule/kernel/helpers/validate-schema.helper.ts`
- `packages/capskit/test/suites/schema-validation.suite.ts`
- `packages/drizzle/src/capsule/drizzle/capsule.ts`

## File Scope

No files will be modified. The following are inspected/inventory only:

- `packages/capskit/src/capsule/events/helpers/match-event-pattern.helper.ts`
- `packages/capskit/src/capsule/events/index.ts`
- `packages/capskit/src/capsule/kernel/helpers/execute-cap.helper.ts`
- `packages/capskit/src/capsule/kernel/helpers/validate-schema.helper.ts`
- `packages/capskit/test/suites/schema-validation.suite.ts`
- `packages/drizzle/src/capsule/drizzle/capsule.ts`

## Steps

### Step 0: Preflight

- [ ] Confirm `git` is available and the working tree has uncommitted changes
- [ ] Run `git status --short` and `git diff --stat` to inventory all modified files

### Step 1: Catalog the Changes

- [ ] Run `git diff` to get the complete diff of all modified files
- [ ] For each file, read the modified sections and write a concise bullet describing what changed and why it matters
- [ ] Group changes into logical categories:
  - **Event pattern fix** — `match-event-pattern.helper.ts`: wildcard `*` now matches across dots (`.`) instead of stopping at the next segment
  - **EventBus resilience** — `events/index.ts`: subscriber `onEvent` callbacks are wrapped in try/catch so one failing subscriber doesn't kill the emit loop
  - **Type safety cleanups** — `execute-cap.helper.ts` and `drizzle/capsule.ts`: replaced `@ts-expect-error` annotations with targeted `as any` casts
  - **Schema type coercion** — `validate-schema.helper.ts` + test suite: new `coerceTypes()` function automatically converts string values to `number`, `integer`, or `boolean` when the input schema declares those types; also improves structured-payload extraction for `{body, query, params}` shapes
- [ ] Note any change that looks incomplete, risky, or unrelated to the others

**Artifacts:**
- Change summary saved as task document via `fn_task_document_write` (key="change-summary", content=...)

### Step 2: Run Full Test Suite

- [ ] Run `cd packages/capskit && npx vitest run` to execute the caps kit test suite (includes the schema-validation suite with the new coercion tests)
- [ ] Confirm all tests pass — zero failures
- [ ] If any test fails, document the failure in the change summary (do NOT attempt to fix)

### Step 3: Documentation & Delivery

- [ ] Save the final structured change audit as a task document via `fn_task_document_write` (key="audit-report", content=...). The report must include:
  - A high-level summary (2-3 sentences of what this batch of changes achieves)
  - Per-category breakdown with file paths and plain-English descriptions
  - Test results (pass/fail count)
  - A recommended commit message that captures the full scope
- [ ] Present the audit report to the user

## Completion Criteria

- [ ] All uncommitted changes cataloged and categorized
- [ ] Full test suite executed and results recorded
- [ ] Audit report saved and presented
- [ ] No uncommitted changes remain undocumented

## Git Commit Convention

This task does NOT make commits — it only documents existing changes. No commits should be created.

## Do NOT

- Commit any changes
- Modify any source files
- Revert any changes
- Fix any test failures (only document them)
- Expand scope beyond auditing the existing diff
