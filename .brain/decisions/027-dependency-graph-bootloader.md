# Dependency Graph Bootloader Decisions

## Decision 1: Kahn's Algorithm over DFS-based Topo Sort
**Chosen**: Kahn's BFS algorithm
**Alternatives**: DFS with post-order numbering
**Reasoning**: 
- Kahn's naturally detects cycles via remaining edges
- DFS cycle path extraction requires additional bookkeeping
- BFS order is more predictable for debugging

## Decision 2: Sequential Boot Over Parallel Boot
**Chosen**: Sequential in topological order
**Alternatives**: Parallel boot with dependency barriers
**Reasoning**:
- Simpler implementation
- Deterministic boot order aids debugging
- Capsules with init() Promises need sequential anyway
- Performance difference negligible during boot phase

## Decision 3: Dual Readiness Signaling
**Chosen**: Support both init Promise and ready event
**Alternatives**: Force all capsules to return Promises
**Reasoning**:
- Not all resources need async initialization
- Forcing Promises onto sync-only capsules adds boilerplate
- Event-based readiness is valid for reactive initialization

## Decision 4: Infinity Timeout Handling
**Chosen**: setTimeout(0) for Infinity timeout
**Alternatives**: No timeout, sentinel value approach
**Reasoning**:
- setTimeout(0) yields to event loop once, allows boot to continue
- No sentinel values needed in public API
- Consistent with JavaScript async patterns

## Decision 5: Cycle Path Included in Error
**Chosen**: Include full cycle path in CyclicDependencyError
**Alternatives**: Just indicate "cycle detected"
**Reasoning**:
- Developers need to know where to break the cycle
- Path format `A → B → C → A` is immediately actionable
- Minimal additional implementation cost

## Decision 6: Error on Missing Dependencies
**Chosen**: Fail fast with MissingDependencyError
**Alternatives**: Skip missing capsules, warn-only
**Reasoning**:
- Missing dependency usually indicates broken configuration
- Silent skipping leads to hard-to-debug runtime failures
- Fail-fast is principle of least astonishment
