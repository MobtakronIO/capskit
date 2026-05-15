export * from './kernel/platform';
export { loadCapsules, loadCapCapsules } from './kernel/loader';
export { loadCapsFromDirectory, loadCapFromDir, convertCapToManifest, convertCapsToManifests, validateCapMeta, validateCapClass, validateCapsuleRegistry, loadCapsRegistry, convertRegistryToManifest, convertRegistriesToManifests, loadCapsRegistriesFromDirectory, detectCapsuleFormat, CapLoadError } from './kernel/cap-loader';
export * from './types';
export * from './kernel/errors';
export * from './kernel/error-mapping';

// Export capsule-specific types for adapter implementations
export * from './capsules/http/src/types';
export * from './capsules/websocket/src/types';

// Cache module exports
export * from './cache';

// Invoke/Tell proxy handlers
export { createInvokeProxy, createTellProxy } from './kernel/invoke-proxy';
export type { InvokeProxy, TellProxy, KernelCallFn } from './kernel/invoke-proxy';

// ESLint rules
export { rule as noDirectCallRule } from './lint/no-direct-call';
export { rule as noCapMetaMissingRule } from './lint/no-cap-meta-missing';
export { rule as noCapLogicMissingRule } from './lint/no-cap-logic-missing';
export { rule as capsRegistryRequiredRule } from './lint/caps-registry-required';
