export * from './kernel/platform';
export { loadCapsules } from './kernel/loader';
export * from './types';
export * from './kernel/errors';
export * from './kernel/error-mapping';

// Export capsule-specific types for adapter implementations
export * from './capsules/http/src/types';
export * from './capsules/websocket/src/types';
