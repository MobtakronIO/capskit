// ── New kernel type system and capsule loader (Phase 1 refactor) ──
export * from './capsule/kernel';

// Platform factory (Phase 2)
export { createCapsKitPlatform } from './capsule/kernel/caps/platform.cap';
export type { CapsKitInstance } from './capsule/kernel/types/platform.types';

// WebSocket protocol types
export * from './capsule/websocket';

// ESLint rules
export * from './lint';
