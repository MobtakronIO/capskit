---
title: Add kernel-level call tracing (observability v1)
type: feature
status: done
priority: 🟡 medium
created: 2026-03-29
completed: 2026-03-29
tags: observability,tracing,kernel,dx
dependencies: 
---

## Objective
Add built-in trace logging for `context.call()` so developers can debug capsule-to-capsule request flows without manual logging.

## Impact
- Files: (to be confirmed during implementation)
  - packages/capskit/src/kernel/* (platform call path)
  - packages/capskit/src/types.ts (trace record types)
  - packages/capskit/src/index.ts (exports if needed)
  - tests/ (new or updated trace tests)
- New patterns:
  - Kernel trace pipeline
  - Trace record schema (line-delimited JSON)
  - Default payload redaction

## Plan
- Implement a kernel-level trace wrapper around the `context.call()` path.
- Emit line-delimited JSON Trace Records to a configurable sink (stdout default, file path optional).
- Include trace IDs and parent span IDs for nested calls.
- Redact sensitive keys in input and output payloads.
- Ensure tracing never throws or blocks action execution.

## Trace Record Schema (v1)
Line-delimited JSON, one record per call:
- `traceId`: string (new UUID per top-level call)
- `spanId`: string (new UUID per call)
- `parentSpanId`: string | null
- `timestampStart`: ISO string
- `timestampEnd`: ISO string
- `durationMs`: number
- `action`: string (`capsule.action`)
- `caller`: string | null (capsule name if available)
- `status`: "ok" | "error"
- `input`: redacted object
- `output`: redacted object | null
- `error`: { name, message, stack? } | null

## Tasks
- [x] Define Trace Record schema and trace context shape.
- [x] Add trace pipeline in kernel call path (start/end + error capture).
- [x] Implement sink selection (stdout default, file optional via env).
- [x] Implement default payload redaction (deep, input + output).
- [x] Add tests for: trace emission, nesting, redaction, and sink fallback.
- [x] Add minimal docs section describing trace usage and env vars.

## Acceptance Criteria
- [x] When `CAPSKIT_TRACE=1`, every `context.call()` emits a JSON trace line.
- [x] Records include timing, action name, status, input/output (redacted).
- [x] Nested calls include `traceId` and `parentSpanId` correctly.
- [x] If sink fails, action still succeeds and tracing does not throw.
- [x] Optional `CAPSKIT_TRACE_FILE` writes line-delimited JSON to file.

## Verification
- npm run test ✅ (all 8 trace tests pass + all existing tests)

## Risks/Blockers
- Trace logging could add overhead; keep implementation lightweight. ✅ Addressed with fire-and-forget emit
- File sink needs safe, non-blocking append behavior. ✅ Addressed with async write + error handling

## Patterns Captured
- **AsyncLocalStorage for trace context**: Used to propagate traceId/parentSpanId through nested async calls without explicit parameter passing
- **Fire-and-forget tracing**: `emitTrace()` uses `queueMicrotask` to never block action execution
- **Redaction depth limiting**: Deep redaction capped at 10 levels to prevent infinite loops on circular refs
- **19 sensitive key patterns**: password, token, secret, key, authorization, cookie, ssn, credit, api, access, auth, credential, private, ssl, cert, bearer, refresh, csrf, x-api
