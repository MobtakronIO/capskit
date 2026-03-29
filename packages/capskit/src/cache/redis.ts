import type { CacheAdapter } from './adapters';

/**
 * Redis cache adapter using ioredis.
 * 
 * Provides distributed caching suitable for multi-process or
 * containerized deployments. Requires a running Redis server.
 * 
 * Uses SETEX or SET with PX for TTL support.
 * Key format: capskit:cache:{action}:{hash}
 * 
 * Requires: ioredis package
 */
export class RedisCacheAdapter implements CacheAdapter {
  private redis: any;
  private keyPrefix: string;

  constructor(redisClient?: any, keyPrefix: string = 'capskit:cache:') {
    this.keyPrefix = keyPrefix;

    if (redisClient) {
      // Use provided Redis client
      this.redis = redisClient;
    } else {
      // Create new Redis client from environment or default
      let Redis: any;
      try {
        Redis = require('ioredis');
      } catch (error) {
        throw new Error(
          'ioredis is required for Redis caching. ' +
          'Install it with: npm install ioredis'
        );
      }

      // Get Redis URL from environment or use default
      const redisUrl = process.env.CAPSKIT_REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl);
    }
  }

  /**
   * Retrieve a cached value by key.
   */
  async get(key: string): Promise<any | null> {
    const fullKey = this.keyPrefix + key;
    const value = await this.redis.get(fullKey);

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Store a value in the cache with TTL.
   * Uses SET with PX for millisecond precision.
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    const fullKey = this.keyPrefix + key;
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttl > 0) {
      // Use SETEX for TTL in seconds (rounded) or PX for milliseconds
      await this.redis.set(fullKey, serializedValue, 'PX', ttl);
    } else {
      // No expiration - use SET without EX/PX
      await this.redis.set(fullKey, serializedValue);
    }
  }

  /**
   * Delete a specific cache entry.
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.redis.del(fullKey);
  }

  /**
   * Clear all cache entries with the configured prefix.
   * Uses SCAN to find matching keys to avoid blocking.
   */
  async clear(): Promise<void> {
    const pattern = this.keyPrefix + '*';
    
    // Use SCAN to find all matching keys without blocking
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  /**
   * Get the underlying Redis client for direct access if needed.
   */
  getClient(): any {
    return this.redis;
  }

  /**
   * Close the Redis connection.
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Create a new Redis cache adapter instance.
 * 
 * @param redisClient - Optional pre-configured Redis client
 * @param keyPrefix - Prefix for all cache keys (default: 'capskit:cache:')
 */
export function createRedisCache(redisClient?: any, keyPrefix?: string): CacheAdapter {
  return new RedisCacheAdapter(redisClient, keyPrefix);
}
