# Learning: In-Memory Circuit Breaker State is Not Shared Across Instances

## Observation
`circuitBreakerState` is a module-level `Map`. Each `createCapsKit` call sees the same Map, but multiple server processes or workers do not.

## Lesson
This is fine for a single-node deployment, but any horizontal scaling requires an external state store (Redis, etc.). The half-open logic also has a TODO and does not check `successThreshold`.

## Recommendation
Before production release, either:
- Document that circuit breaker is single-node only
- Implement a pluggable state adapter interface
- Add tests that force the breaker to open and verify behavior

## Related Files
- `packages/capskit/src/kernel/platform.ts`
