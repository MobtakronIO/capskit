// ── New kernel type system and capsule loader (Phase 1 refactor) ──
export * from './capsule/kernel';

// Platform factory (Phase 2)
export { createCapsKitPlatform } from './capsule/kernel/caps/platform.cap';
export type { CapsKitInstance } from './capsule/kernel/types/platform.types';

// High-level CapsKit factory (returns full ICapsKit + router)
export { createCapsKit } from './kernel/platform';
export type { CreateCapsKitOptions } from './kernel/platform';

// WebSocket protocol types
export * from './capsule/websocket';

// EventBus factory
export { createEventBus } from './capsule/events';
export type { EventBus, EventSubscriber } from './types';

// ESLint rules
export * from './lint';
