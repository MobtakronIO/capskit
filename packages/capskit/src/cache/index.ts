/**
 * Cache module — kernel-side cache bridge.
 *
 * The kernel owns the CacheAdapter contract (defined in types.ts)
 * and connects adapters to the interceptor chain via CacheMiddleware.
 *
 * All adapter implementations live in @mobtakronio/capskit-cache.
 * Cache is an injectable dependency — pass cacheAdapter via config.dependencies.
 */

// Re-export contract from types
export type { CacheAdapter, CacheStorageType } from '../types';

// Kernel-side middleware bridge
export { CacheMiddleware } from './middleware';
