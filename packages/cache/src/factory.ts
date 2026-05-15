import type { CacheAdapter, CacheStorageType } from './adapters';
import { createMemoryCache } from './memory';
import { createSqliteCache } from './sqlite';
import { createRedisCache } from './redis';

/**
 * Create a cache adapter based on storage type.
 * 
 * @param storage - The storage backend type ('memory', 'sqlite', 'redis')
 * @param options - Optional configuration for the adapter
 */
export function createCacheAdapter(storage: CacheStorageType = 'memory', options?: {
  redisClient?: any;
  redisKeyPrefix?: string;
  sqliteDbPath?: string;
}): CacheAdapter {
  switch (storage) {
    case 'memory':
      return createMemoryCache();
    case 'sqlite':
      return createSqliteCache(options?.sqliteDbPath);
    case 'redis':
      return createRedisCache(options?.redisClient, options?.redisKeyPrefix);
    default:
      throw new Error(`Unknown cache storage type: ${storage}`);
  }
}

/**
 * Parse the CAPSKIT_CACHE_DEFAULT environment variable.
 * Returns 'memory' if not set or invalid.
 */
export function parseCacheEnvDefault(): CacheStorageType {
  const envValue = process.env.CAPSKIT_CACHE_DEFAULT?.toLowerCase();
  
  if (envValue === 'sqlite' || envValue === 'redis' || envValue === 'memory') {
    return envValue;
  }
  
  return 'memory';
}
