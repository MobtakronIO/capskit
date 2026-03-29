# Resiliency Patterns (Fallbacks + Circuit Breaker)

## Pattern
Action-level fallback behavior to improve offline and failure handling, with minimal circuit breaker to prevent cascading failures.

## Implementation

### Resiliency Metadata Schema
```typescript
interface ResiliencyConfig {
  fallback?: {
    type: 'cache' | 'action';
    target?: string;           // action name (for 'action' type) or cache key prefix (for 'cache' type)
    maxAge?: number;           // cache TTL in ms (for 'cache' type)
  };
  breaker?: {
    enabled: boolean;
    failureThreshold: number;  // consecutive failures before opening
    resetTimeout: number;      // ms before attempting recovery
  };
}

interface ActionDefinition {
  // ... other fields
  resiliency?: ResiliencyConfig;
}
```

### Fallback Execution in Call Pipeline
```typescript
async function handleFailure(
  ctx: CallContext,
  error: Error,
  action: ActionDefinition,
  actionState: Map<string, ActionState>
): Promise<CallResponse> {
  const resiliency = action.resiliency;
  
  // Circuit breaker check
  if (resiliency?.breaker?.enabled) {
    const state = actionState.get(action.name) ?? createInitialState();
    if (state.breakerState === 'open') {
      if (Date.now() - state.lastFailure < resiliency.breaker.resetTimeout) {
        return failureResponse(error, 'CIRCUIT_OPEN');
      }
      // Half-open: allow one attempt
      state.breakerState = 'half-open';
    }
  }

  // Apply fallback
  if (resiliency?.fallback?.type === 'cache') {
    const cached = await ctx.cache.get(resiliency.fallback.target || action.name);
    if (cached) return successResponse(cached);
  }

  if (resiliency?.fallback?.type === 'action' && resiliency.fallback.target) {
    return ctx.call(resiliency.fallback.target, ctx.params);
  }

  // No fallback: propagate error
  return failureResponse(error, 'NO_FALLBACK');
}
```

### Circuit Breaker State Transitions
```
CLOSED → (failureThreshold consecutive failures) → OPEN
OPEN → (resetTimeout elapsed) → HALF_OPEN
HALF_OPEN → (success) → CLOSED
HALF_OPEN → (failure) → OPEN
```

## Key Decisions
- Fallback action loop guard: Not implemented in v1 (document as risk)
- Error categorization: Not implemented in v1 (all errors treated same)
- Breaker state: Per-action, in-memory only (not persisted)
- Cache fallback uses action name as default cache key prefix

## v2 Improvements Identified
- Better error categorization (transient vs permanent)
- More sophisticated breaker state transitions with half-open success tracking
- Configurable recovery policies
- Fallback chain support (try cache, then action, then static response)
- Persisted breaker state for distributed systems

## Related
- Task: 030-resiliency-fallbacks
- Docs: docs/resiliency.md
- Tests: packages/capskit/test/suites/resiliency.test.ts
