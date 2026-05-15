import { ActionInput, CapContext, CacheAdapter } from '../../types';

/**
 * Cap: cache — Action-level caching with multi-backend support.
 *
 * Uses the injected cache adapter from `ctx.deps.cacheAdapter`.
 * If none is provided, falls back to an inline in-memory cache.
 *
 * Cache is an injectable dependency — the kernel does NOT
 * auto-initialize a cache adapter. Users provide one via
 * CapsKitConfig.cacheAdapter or set capsKit.cacheAdapter
 * before calling start().
 *
 * Actions:
 * - get     — Retrieve a cached value by key
 * - set     — Store a value with optional TTL
 * - delete  — Remove a cached entry by key
 * - clear   — Clear all cached entries
 * - health  — Check cache backend connectivity
 */
export default class CacheCap {
  [action: string]: any;

  private _adapter: CacheAdapter | null = null;
  private _initialized = false;

  /** Lazy-init: use injected deps.cacheAdapter, or fall back to in-memory. */
  private _ensureAdapter(ctx: CapContext): CacheAdapter {
    if (!this._initialized) {
      // 1. Prefer injected adapter from deps (set via config.cacheAdapter or .cacheAdapter setter)
      if (ctx.deps?.cacheAdapter) {
        this._adapter = ctx.deps.cacheAdapter as CacheAdapter;
      } else {
        // 2. Fallback: inline minimal in-memory cache
        this._adapter = this._createFallbackMemoryAdapter();
      }
      this._initialized = true;
    }
    if (!this._adapter) {
      this._adapter = this._createFallbackMemoryAdapter();
    }
    return this._adapter;
  }

  /** Minimal in-memory adapter when no cache adapter is injected. */
  private _createFallbackMemoryAdapter(): CacheAdapter {
    const store = new Map<string, { value: any; expiresAt: number | null }>();
    return {
      get: async (key: string) => {
        const entry = store.get(key);
        if (!entry) return null;
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
          store.delete(key);
          return null;
        }
        return entry.value;
      },
      set: async (key: string, value: any, ttl: number) => {
        store.set(key, {
          value,
          expiresAt: ttl > 0 ? Date.now() + ttl : null,
        });
      },
      delete: async (key: string) => { store.delete(key); },
      clear: async () => { store.clear(); },
      health: async () => ({ backend: 'memory (inline fallback)', connected: true }),
    };
  }

  async get(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ found: boolean; value?: any }> {
    const adapter = this._ensureAdapter(ctx);
    const key = payload.body?.key;
    if (!key || typeof key !== 'string') {
      throw new Error('get requires a string "key" in payload body');
    }
    const value = await adapter.get(key);
    return { found: value !== undefined && value !== null, value };
  }

  async set(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ ok: boolean }> {
    const adapter = this._ensureAdapter(ctx);
    const { key, value, ttlMs } = payload.body ?? {};
    if (!key || typeof key !== 'string') {
      throw new Error('set requires a string "key" in payload body');
    }
    await adapter.set(key, value, ttlMs);
    return { ok: true };
  }

  async delete(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ ok: boolean }> {
    const adapter = this._ensureAdapter(ctx);
    const key = payload.body?.key;
    if (!key || typeof key !== 'string') {
      throw new Error('delete requires a string "key" in payload body');
    }
    await adapter.delete(key);
    return { ok: true };
  }

  async clear(
    _payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ ok: boolean }> {
    const adapter = this._ensureAdapter(ctx);
    await adapter.clear();
    return { ok: true };
  }

  async health(
    _payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ status: string; backend: string; connected: boolean; error?: string }> {
    const adapter = this._ensureAdapter(ctx);
    try {
      await adapter.get('__health_check__');
      return {
        status: 'healthy',
        backend: 'connected',
        connected: true,
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        backend: 'unknown',
        connected: false,
        error: err.message,
      };
    }
  }
}
