import type { CacheAdapter } from './adapters';

// Note: better-sqlite3 is a synchronous SQLite library
// The types are included with the package itself

/**
 * SQLite cache adapter using better-sqlite3.
 * 
 * Provides persistent caching across application restarts.
 * Cache entries are stored in a SQLite database file.
 * 
 * Requires: better-sqlite3 package
 */
export class SqliteCacheAdapter implements CacheAdapter {
  private db: any;
  private tableName: string;

  constructor(dbPath: string = './.capsule_cache.db', tableName: string = 'cache') {
    // Validate tableName to prevent SQL injection
    // Only allow alphanumeric characters and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error(`Invalid tableName "${tableName}": must start with letter or underscore and contain only alphanumeric characters and underscores`);
    }
    this.tableName = tableName;
    
    // Dynamic require to avoid hard dependency on better-sqlite3
    // The package will only be loaded if SQLite cache is actually used
    let betterSqlite3: any;
    try {
      betterSqlite3 = require('better-sqlite3');
    } catch (error) {
      throw new Error(
        'better-sqlite3 is required for SQLite caching. ' +
        'Install it with: npm install better-sqlite3'
      );
    }

    this.db = new betterSqlite3(dbPath);
    this.initializeTable();
  }

  private initializeTable(): void {
    // Create table if not exists
    // Using TEXT for expires_at - 0 means no expiration
    // NOTE: tableName is validated in constructor, so this interpolation is safe
    // The tableName is intentionally restricted to internal use only (alphanumeric + underscore)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    // Create index for expiration cleanup
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_expires_at ON ${this.tableName} (expires_at)
    `);
  }

  /**
   * Retrieve a cached value by key.
   */
  async get(key: string): Promise<any | null> {
    const stmt = this.db.prepare(
      `SELECT value, expires_at FROM ${this.tableName} WHERE key = ?`
    );
    const row = stmt.get(key);

    if (!row) {
      return null;
    }

    // Check if expired (expires_at = 0 means no expiration)
    if (row.expires_at > 0 && Date.now() > row.expires_at) {
      // Clean up expired entry
      this.delete(key);
      return null;
    }

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  /**
   * Store a value in the cache with TTL.
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO ${this.tableName} (key, value, expires_at) VALUES (?, ?, ?)`
    );
    stmt.run(key, serializedValue, expiresAt);
  }

  /**
   * Delete a specific cache entry.
   */
  async delete(key: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE key = ?`);
    stmt.run(key);
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName}`);
    stmt.run();
  }

  /**
   * Clean up expired entries.
   * Can be called periodically to reclaim disk space.
   */
  cleanup(): void {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE expires_at > 0 AND expires_at < ?`
    );
    stmt.run(Date.now());
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Create a new SQLite cache adapter instance.
 * 
 * @param dbPath - Path to the SQLite database file. Defaults to .capsule_cache.db
 */
export function createSqliteCache(dbPath?: string): CacheAdapter {
  return new SqliteCacheAdapter(dbPath);
}
