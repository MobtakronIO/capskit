# Review: capskit-calculator

## Overview
- Capsule that exposes a single action to compute the sum of two numbers. Implemented as a small OpenCode-style capsule with a manifest, a single action (sum), and a route for invoking the action via POST /calculate/sum. Emits an event when calculation completes.

## Structure
- Directory: `/src/capsules/capskit-calculator/`
- Files:
  - `index.ts` — re-exports `manifest` and `sum` for external usage.
  - `manifest.ts` — defines the CapsuleManifest with one action (sum), route, and emitted event.
  - `src/actions/sum.ts` — action handler that sums two numbers from the payload and emits `calculator.calculated`.
- Routes:
  - POST `/calculate/sum` with trait: `auth: admin`.
- Events:
  - Publishes: `calculator.calculated`.

## Key Patterns
- Capsule pattern: `service` object (name, actions, routes, events) following a small, self-contained contract.
- Action hooks: pre and post hooks around the main `sum` action to log activity and side effects.
- Lightweight event-driven: Emits `calculator.calculated` after computing a result.
- TypeScript throughout, with a consistent module boundary and relative imports.

## Issues Found
- Input validation is minimal. The action checks that `a` and `b` are numbers, but it could be more explicit about required fields and shapes (e.g., presence checks for `payload.body.a` and `payload.body.b`).
- Error handling is purely throwing errors when inputs are invalid; depending on the framework, this could surface as unhandled exceptions instead of friendly error responses.
- No unit tests are present for the `sum` action or the capsule manifest.
- Documentation is minimal; onboarding a new contributor might require a quick README per capsule for expected payload formats.
- The `_types` import path in `sum.ts` relies on a particular relative location; refactors could break this import.

## Recommendations
- Improve input validation:
  - Validate presence and numeric type of both `a` and `b`.
  - Provide clearer error messages when inputs are missing.
- Add tests:
  - Unit tests for `sum` covering valid input, non-numeric input, and missing fields.
  - Integration test for the POST `/calculate/sum` route if the surrounding framework supports it.
- Add small capsule README to describe payload shape and example requests.
- Consider handling errors gracefully by returning structured error payloads instead of throwing generic errors.
- If you plan to expand capabilities, add more actions and demonstrate shared hooks (pre/post) for consistency.

## Worth Preserving
- The capsule pattern (service with actions, routes, and events) is clean and separation-friendly.
- Pre/post hooks provide a good extension point for observability and side effects without polluting core logic.
- Simple, predictable API surface (single action) makes maintenance straightforward.

## How to Proceed (Optional)
- I can convert these notes into concrete tasks and add them to a task list.
- If you want, I can also add an initial unit test scaffold and a minimal README per capsule.

Note: This review is saved to `.brain/knowledge/capskit-calculator-review.md` as part of the project knowledge repository.
