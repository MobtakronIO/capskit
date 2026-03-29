/**
 * Cache module for CapsKit action-level caching.
 * 
 * Provides multi-backend caching with support for:
 * - Memory: In-process Map-based cache (default)
 * - SQLite: Persistent cache using better-sqlite3
 * - Redis: Distributed cache using ioredis
 */

// Re-export all cache types and functions
export type { CacheAdapter, CacheStorageType } from './adapters';
export { MemoryCacheAdapter, createMemoryCache } from './memory';
export { SqliteCacheAdapter, createSqliteCache } from './sqlite';
export { RedisCacheAdapter, createRedisCache } from './redis';
export { CacheMiddleware, createCacheAdapter, parseCacheEnvDefault } from './middleware';
