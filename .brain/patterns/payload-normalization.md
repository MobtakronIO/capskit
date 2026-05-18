# Pattern: Payload Normalization for Action Execution

## Context
capskit accepts payloads from multiple sources (HTTP body, direct function calls, events). The internal platform expects a `{ body, params?, query? }` shape, but callers may pass the raw payload directly.

## Solution
Normalize at entry points:
- If payload already has a `body` property, keep as-is
- Otherwise, wrap: `{ body: payload }`

## Key Insight
This alignment with HTTP-like semantics lets the same handler work across HTTP routers, direct invocations, and event subscriptions without branching inside business logic.

## Code Sketch
```typescript
function normalizePayload(payload: unknown) {
  if (payload && typeof payload === 'object' && 'body' in payload) {
    return payload as { body: unknown; params?: unknown; query?: unknown };
  }
  return { body: payload };
}
```

## Trade-offs
- Duplicated in `executeAction`, event handlers, and HTTP router; should be extracted into a single exported helper
- Schema validation in `platform.ts` runs on the *original* payload, not the normalized one, which can cause subtle mismatches if normalization changes the object graph

## Related Files
- `packages/capskit/src/kernel/platform.ts`
