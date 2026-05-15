import { CapMeta } from '../../types';

/**
 * Metadata for the cache cap.
 *
 * Provides action-level caching with multiple backends:
 * - memory: In-process Map-based cache (default, zero setup)
 * - sqlite: Persistent SQLite-based cache using better-sqlite3
 * - redis: Distributed Redis-based cache using ioredis
 */
export const meta: CapMeta = {
  name: 'cache',
  actions: {
    get: {
      description: 'Retrieve a cached value by key.',
    },
    set: {
      description: 'Store a value in the cache with optional TTL.',
    },
    delete: {
      description: 'Remove a cached entry by key.',
    },
    clear: {
      description: 'Clear all entries from the cache.',
    },
    health: {
      description: 'Check cache backend connectivity.',
    },
  },
};
