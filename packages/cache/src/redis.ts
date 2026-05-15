import type { CacheAdapter } from './adapters';

/**
 * Redis cache adapter using ioredis.
 * 
 * Provides distributed caching suitable for multi-process or
 * containerized deployments. Requires a running Redis server.
 * 
 * Key format: capskit:cache:{key}
 * 
 * Requires: ioredis package
 */
export class RedisCacheAdapter implements CacheAdapter {
  private redis: any;
  private keyPrefix: string;

  constructor(redisClient?: any, keyPrefix: string = 'capskit:cache:') {
    this.keyPrefix = keyPrefix;

    if (redisClient) {
      this.redis = redisClient;
    } else {
      let Redis: any;
      try {
        Redis = require('ioredis');
      } catch (error) {
        throw new Error(
          'ioredis is required for Redis caching. ' +
          'Install it with: npm install ioredis'
        );
      }

      const redisUrl = process.env.CAPSKIT_REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl);
    }
  }

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

  async set(key: string, value: any, ttl: number): Promise<void> {
    const fullKey = this.keyPrefix + key;
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttl > 0) {
      await this.redis.set(fullKey, serializedValue, 'PX', ttl);
    } else {
      await this.redis.set(fullKey, serializedValue);
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.redis.del(fullKey);
  }

  async clear(): Promise<void> {
    const pattern = this.keyPrefix + '*';
    
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  getClient(): any {
    return this.redis;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async health(): Promise<{ backend: string; connected: boolean }> {
    try {
      const result = await this.redis.ping();
      return { backend: 'redis', connected: result === 'PONG' };
    } catch {
      return { backend: 'redis', connected: false };
    }
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
