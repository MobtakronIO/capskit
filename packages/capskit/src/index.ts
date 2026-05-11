export * from './kernel/platform';
export { loadCapsules, loadCapCapsules } from './kernel/loader';
export { loadCapsFromDirectory, loadCapFromDir, convertCapToManifest, convertCapsToManifests, validateCapMeta, validateCapClass, CapLoadError } from './kernel/cap-loader';
export * from './types';
export * from './kernel/errors';
export * from './kernel/error-mapping';

// Export capsule-specific types for adapter implementations
export * from './capsules/http/src/types';
export * from './capsules/websocket/src/types';

// Cache module exports
export * from './cache';

// ESLint rules
export { rule as noDirectCallRule } from './lint/no-direct-call';
