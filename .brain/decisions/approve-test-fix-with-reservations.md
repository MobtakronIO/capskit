# Decision: Approve Test-Fix PR with Production-Readiness Reservations

## Context
Reviewer identified 14 issues across critical, risk, and improvement categories. All 327+ tests pass, but the net-new runtime code (~1200 lines) introduces production-grade features with minimal negative-test coverage.

## Decision
Approve the changes to unblock the green build, but require a follow-up reliability review before tagging a release.

## Rationale
- The changes are focused on observable test failures (invoke/tell proxy type checks, loader edge cases, payload normalization, error envelopes)
- The platform layer was missing and needed restoration
- None of the identified issues cause test failures today

## Follow-up Actions
1. Replace hand-rolled schema validator with `ajv` or document subset
2. Unify payload normalization into single exported helper
3. Make `writeTrace` async or queue-based
4. Add circuit breaker negative tests
5. Remove `@ts-nocheck` from test suites
6. Consider `Symbol.for` branding for invoke/tell proxies
7. Make `redactPayload` configurable
8. Extract system capsule path into configurable option

## Related Files
- `.brain/reviews/2026-05-18-2100-capskit-test-fixes-review.md`
