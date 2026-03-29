# Dependency Graph Bootloader Learnings

## Kahn's Algorithm Works Well for Cycles
Kahn's BFS-based topological sort naturally exposes cycles - remaining edges after processing all zero-indegree nodes indicate cycles. No need for separate cycle detection pass.

## Dual Readiness Signaling is Necessary
- Some resources (DB connections, network sockets) block until established
- Others (message queues, event emitters) are "ready" immediately
- Supporting both prevents forcing async patterns onto sync-initialized capsules

## Infinity Timeout Requires Special Handling
```typescript
// Naive approach fails
await new Promise(r => setTimeout(r, Infinity)); // never resolves!

// Correct approach
await new Promise(r => 
  timeout === Infinity 
    ? setTimeout(r, 0)  // yield once, continue
    : setTimeout(r, timeout)
);
```

## DAG Building Requires Manifests First
Cannot build dependency graph until all manifests are parsed. This means:
- Parallel manifest loading is fine
- Graph construction is a separate phase
- Boot sequence is sequential by necessity

## Cycle Path Extraction is Non-Trivial
Finding the actual cycle path (not just "cycle detected") requires DFS from cycle nodes. The path `A → B → C → A` tells developers exactly where to break the cycle.

## Blocking vs Non-Blocking Capsules
- **Blocking**: init() returns Promise - boot waits
- **Non-blocking**: ready event emitted - boot continues

This distinction matters for resource initialization order. A DB capsule should block subsequent HTTP capsules that depend on it.

## Error Classes Should Include Context
```typescript
class CyclicDependencyError extends Error {
  constructor(
    message: string,
    public readonly cyclePath: string[]
  ) { super(message); }
}
```

The cyclePath enables actionable error messages.
