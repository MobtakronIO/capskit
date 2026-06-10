// ── New kernel type system and capsule loader (Phase 1 refactor) ──
export * from './capsule/kernel';

// WebSocket protocol types
export * from './capsule/websocket';

// EventBus factory
export { createEventBus } from './capsule/events';
export type { EventBus, EventSubscriber } from './capsule/events';

// ESLint rules
export * from './lint';
