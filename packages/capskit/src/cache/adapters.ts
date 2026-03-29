/**
 * Cache adapter interface for multi-backend caching support.
 * Implement this interface to add new cache storage backends.
 */
export interface CacheAdapter {
  /**
   * Retrieve a cached value by key.
   * @param key - The cache key
   * @returns The cached value, or null if not found or expired
   */
  get(key: string): Promise<any | null>;

  /**
   * Store a value in the cache with TTL.
   * @param key - The cache key
   * @param value - The value to cache (will be JSON serialized)
   * @param ttl - Time-to-live in milliseconds. If 0 or undefined, no expiration.
   */
  set(key: string, value: any, ttl: number): Promise<void>;

  /**
   * Delete a specific cache entry.
   * @param key - The cache key to delete
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cache entries.
   * Use with caution - this clears the entire cache.
   */
  clear(): Promise<void>;
}

/**
 * Type for cache storage backends.
 */
export type CacheStorageType = 'memory' | 'sqlite' | 'redis';
