// Types
export * from './types/cap-input.type';
export * from './types/cap-meta.type';
export * from './types/capsule-definition.type';
export * from './types/capsule-manifest.type';
export * from './types/capskit.type';
export * from './types/hook.type';
export * from './types/result.type';
export * from './types/platform.types';

// Errors
export * from './errors';

// Constants
export * from './constants';

// Repository
export { filesystemRepository } from './repository/filesystem.repository';

// Rules
export { validateCapMeta } from './rules/validate-cap-meta.rule';
export { validateDepGraph } from './rules/validate-deps-graph.rule';
export { detectCycle } from './rules/detect-cycle.rule';

// Helpers
export { discoverCaps } from './helpers/discover-caps.helper';
export { parseCapPath } from './helpers/parse-cap-path.helper';
export { topologicalSort } from './helpers/topological-sort.helper';
export { buildHooksPipeline, resolveHooks } from './helpers/build-hooks-pipeline.helper';
export { buildContext } from './helpers/build-context.helper';

// Caps
export { default as bootCap, meta as bootCapMeta } from './caps/boot.cap';
export { default as callCap, meta as callCapMeta } from './caps/call.cap';
export { default as registerCap, meta as registerCapMeta } from './caps/register.cap';
export { default as useCap, meta as useCapMeta } from './caps/use.cap';
export { default as shutdownCap, meta as shutdownCapMeta } from './caps/shutdown.cap';
export { default as describeCap, meta as describeCapMeta } from './caps/describe.cap';
export { default as rpcCap, meta as rpcCapMeta } from './caps/rpc.cap';

// Platform
export { createCapsKitPlatform, createCapsKitAdapter } from './caps/platform.cap';
export type { PreBuiltCap } from './caps/platform.cap';
export type { CapsKitInstance, InternalState } from './types/platform.types';

// Error mapping (for adapters)
export * from './error-mapping';

// Capsule definition
export { default as kernelCapsuleDef } from './capsule';
