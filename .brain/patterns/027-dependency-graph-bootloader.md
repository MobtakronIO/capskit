# Dependency Graph Bootloader Pattern

## Problem
Capsules must boot in dependency order, but naive parallel or insertion-order boot can start a capsule before its dependencies are ready.

## Solution
Build a DAG from capsule manifest `dependencies`, topologically sort it with Kahn's algorithm, and boot capsules sequentially in sorted order.

## Key Components

### 1. DAG Construction
```typescript
interface DependencyGraph {
  nodes: Map<string, CapsuleManifest>;
  edges: Map<string, Set<string>>; // capsule -> its dependencies
}
```

### 2. Kahn's Algorithm (Topological Sort)
- Uses BFS to find nodes with zero in-degree (no unsatisfied dependencies)
- Naturally handles cycles: if edges remain after processing all zero-indegree nodes, a cycle exists
- Returns ordered list plus cycle path for error reporting

### 3. Readiness Signaling (Dual Mode)
Capsules can signal readiness via:
- **Blocking**: Return `init()` Promise - boot waits for resolution
- **Non-blocking**: Emit `ready` event - boot proceeds immediately

```typescript
// Blocking capsule
const capsule = {
  init: async () => { await db.connect(); return true; }
};

// Non-blocking capsule  
const capsule = {
  onReady: (cb) => { db.on('connected', cb); }
};
```

### 4. Boot Sequence
```typescript
async function bootCapsules(manifests: CapsuleManifest[]): Promise<void> {
  const graph = buildGraph(manifests);
  validateGraph(graph); // checks missing deps + cycles
  
  const order = topologicalSort(graph);
  
  for (const id of order) {
    const capsule = manifests.get(id);
    await bootCapsule(capsule);
  }
}
```

## Cycle Detection
Kahn's algorithm naturally detects cycles:
- Track remaining edges after processing all zero-indegree nodes
- Path from cycle node back to itself via DFS
- Format: `A → B → C → A`

## Error Handling
| Error | Signal | Recovery |
|-------|--------|----------|
| Missing dependency | `MissingDependencyError` | Add missing capsule |
| Cycle detected | `CyclicDependencyError` | Break cycle in manifest |
| Init throws | Propagates | Fix capsule init |

## Timeouts
- `bootTimeout: Infinity` - Wait indefinitely for init Promise
- Uses `setTimeout(0)` pattern to yield to event loop between capsules

## Usage
```typescript
const kernel = new Kernel();
kernel.options.bootTimeout = 5000; // override per-boot timeout
await kernel.boot();
```
