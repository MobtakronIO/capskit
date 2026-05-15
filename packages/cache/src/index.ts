/**
 * @mobtakronio/capskit-cache — Pluggable cache adapters for CapsKit.
 *
 * Provides multi-backend caching with support for:
 * - Memory: In-process Map-based cache (default, zero setup)
 * - SQLite: Persistent cache using better-sqlite3
 * - Redis: Distributed cache using ioredis
 *
 * Usage:
 * ```ts
 * import { createMemoryCache } from '@mobtakronio/capskit-cache';
 * const adapter = createMemoryCache();
 * capsKit.cacheAdapter = adapter;
 * ```
 */

// Cache adapter interface + storage type
export type { CacheAdapter, CacheStorageType } from './adapters';

// Adapter implementations
export { MemoryCacheAdapter, createMemoryCache } from './memory';
export { SqliteCacheAdapter, createSqliteCache } from './sqlite';
export { RedisCacheAdapter, createRedisCache } from './redis';

// Factory and env utilities
export { createCacheAdapter, parseCacheEnvDefault } from './factory';
