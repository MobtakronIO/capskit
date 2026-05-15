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
  private accessOrder: string[] = [];
  private readonly maxSize?: number;

  /**
   * @param maxSize - Optional maximum number of entries. When reached, least recently used entries are evicted.
   */
  constructor(maxSize?: number) {
    this.maxSize = maxSize;
  }

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    this.updateAccessOrder(key);
    return entry.value;
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    if (this.cache.has(key)) {
      const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
      this.cache.set(key, { value, expiresAt });
      this.updateAccessOrder(key);
      return;
    }

    if (this.maxSize && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    this.cache.set(key, { value, expiresAt });
    this.accessOrder.push(key);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
  }

  async health(): Promise<{ backend: string; connected: boolean }> {
    return { backend: 'memory', connected: true };
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
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
 * @param maxSize - Optional maximum number of entries.
 */
export function createMemoryCache(maxSize?: number): CacheAdapter {
  return new MemoryCacheAdapter(maxSize);
}
