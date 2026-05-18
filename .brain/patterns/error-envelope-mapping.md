# Pattern: Error-to-Envelope Mapping

## Context
capskit needs a uniform `ErrorEnvelope` shape for responses, logs, and event propagation, while preserving the original error type internally.

## Solution
Base class `FrameworkError` with `toEnvelope()` and `toErrorEnvelope()`. Typed subclasses (`ValidationError`, `NotFoundError`, etc.) override `code` and `status`. A standalone `toErrorEnvelope()` function handles native `Error` instances as a fallback.

## Key Insight
`toErrorEnvelope` for native Errors returns `{ code: 'UNKNOWN_ERROR', message: error.message, status: 500 }`, which is safe for external responses but loses the original error type unless `shouldExposeStack()` is enabled.

## Trade-offs
- `toErrorEnvelope` does not populate the optional `stack` field even when `shouldExposeStack()` is true; this is a gap for debugging
- Losing native Error types in envelopes means downstream telemetry must rely on `code` strings, not instanceof checks

## Related Files
- `packages/capskit/src/kernel/errors.ts`
