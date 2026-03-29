import type { CacheAdapter } from './adapters';

/**
 * In-memory cache adapter using a Map with LRU eviction.
 * 
 * This is the default cache adapter and is suitable for single-process
 * applications or testing. Cache entries are not shared across processes
 * and are lost on application restart.
 * 
 * Expired entries are cleaned up on access.
 * When maxSize is set, LRU eviction is applied when capacity is reached.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private accessOrder: string[] = []; // Track access order for LRU
  private readonly maxSize?: number;

  /**
   * @param maxSize - Optional maximum number of entries. When reached, least recently used entries are evicted.
   */
  constructor(maxSize?: number) {
    this.maxSize = maxSize;
  }

  /**
   * Retrieve a cached value by key.
   * Cleans up expired entries on access.
   * Updates LRU order on access.
   */
  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    // Update LRU order
    this.updateAccessOrder(key);
    return entry.value;
  }

  /**
   * Store a value in the cache.
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Time-to-live in milliseconds. If 0 or undefined, no expiration.
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    // If key exists, update it
    if (this.cache.has(key)) {
      const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
      this.cache.set(key, { value, expiresAt });
      this.updateAccessOrder(key);
      return;
    }

    // Evict LRU entries if at capacity
    if (this.maxSize && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    this.cache.set(key, { value, expiresAt });
    this.accessOrder.push(key);
  }

  /**
   * Delete a specific cache entry.
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Update access order for LRU tracking.
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order tracking.
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict the least recently used entry.
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      // If no access order, just remove the first key (arbitrary)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
      return;
    }
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }
}

/**
 * Create a new memory cache adapter instance.
 * @param maxSize - Optional maximum number of entries. When reached, least recently used entries are evicted.
 */
export function createMemoryCache(maxSize?: number): CacheAdapter {
  return new MemoryCacheAdapter(maxSize);
}
