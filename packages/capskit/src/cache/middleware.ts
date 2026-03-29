import * as crypto from 'crypto';
import type { CacheAdapter, CacheStorageType } from './adapters';
import { ActionDefinition, ActionInput, ActionContext } from '../types';
import { createMemoryCache } from './memory';
import { createSqliteCache } from './sqlite';
import { createRedisCache } from './redis';

/**
 * Cache middleware for action-level caching.
 * 
 * This middleware intercepts action calls and:
 * 1. Checks if the action has cache configuration
 * 2. If so, derives a cache key from action name + payload
 * 3. On cache hit: returns cached result immediately
 * 4. On cache miss: calls next() and stores result in cache
 * 
 * Uses write-through caching (store on every successful call).
 */
export class CacheMiddleware {
  private adapter: CacheAdapter;
  private actions: Map<string, ActionDefinition>;

  constructor(adapter: CacheAdapter, actions: Map<string, ActionDefinition>) {
    this.adapter = adapter;
    this.actions = actions;
  }

  /**
   * Check if an action has cache configuration.
   */
  private getCacheConfig(actionName: string): ActionDefinition['cache'] | undefined {
    const actionDef = this.actions.get(actionName);
    return actionDef?.cache;
  }

  /**
   * Derive a stable cache key from action name and payload.
   * Uses SHA-256 hash of sorted JSON for stable key derivation.
   */
  deriveCacheKey(actionName: string, payload: any): string {
    // Sort keys for stable JSON serialization
    const stablePayload = this.stableStringify(payload);
    const payloadHash = crypto
      .createHash('sha256')
      .update(stablePayload)
      .digest('hex')
      .substring(0, 16);
    return `${actionName}:${payloadHash}`;
  }

  /**
   * Stable JSON stringify - sorts object keys alphabetically.
   * Ensures {b:1, a:1} produces same string as {a:1, b:1}.
   * Detects circular references to prevent infinite recursion.
   */
  private stableStringify(value: any, visited = new WeakSet()): string {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value !== 'object') {
      return JSON.stringify(value);
    }

    // Detect circular references
    if (visited.has(value)) {
      throw new Error('Circular reference detected in cache key payload');
    }

    if (Array.isArray(value)) {
      return '[' + value.map(item => this.stableStringify(item, visited)).join(',') + ']';
    }

    // Mark this object as visited before processing
    visited.add(value);
    try {
      // Sort keys
      const sortedKeys = Object.keys(value).sort();
      const pairs = sortedKeys.map(key => {
        return JSON.stringify(key) + ':' + this.stableStringify(value[key], visited);
      });
      return '{' + pairs.join(',') + '}';
    } finally {
      // Ensure we remove from visited even if an error occurs
      visited.delete(value);
    }
  }

  /**
   * Create the interceptor function for use in the call() pipeline.
   */
  createInterceptor(): (actionName: string, input: ActionInput, context: ActionContext, next: () => Promise<any>) => Promise<any> {
    return async (actionName: string, input: ActionInput, context: ActionContext, next: () => Promise<any>): Promise<any> => {
      const cacheConfig = this.getCacheConfig(actionName);

      // If no cache config, skip caching
      if (!cacheConfig) {
        return next();
      }

      // Get cache key - either custom or derived
      // Use :: as delimiter to avoid collision with : in action names or user keys
      const baseKey = cacheConfig.key 
        ? `${cacheConfig.key}::${this.deriveCacheKey(actionName, input.body)}`
        : this.deriveCacheKey(actionName, input.body);

      // Check cache hit
      const cached = await this.adapter.get(baseKey);
      if (cached !== null) {
        return cached;
      }

      // Cache miss - call next
      const result = await next();

      // Only cache successful results (no errors)
      // If set() fails, log but don't propagate - caching is best-effort
      try {
        await this.adapter.set(baseKey, result, cacheConfig.ttl || 0);
      } catch (setError) {
        console.error('[CacheMiddleware] Failed to cache result:', setError);
      }

      return result;
    };
  }
}

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
