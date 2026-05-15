import type { CacheAdapter } from './adapters';

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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_expires_at ON ${this.tableName} (expires_at)
    `);
  }

  async get(key: string): Promise<any | null> {
    const stmt = this.db.prepare(
      `SELECT value, expires_at FROM ${this.tableName} WHERE key = ?`
    );
    const row = stmt.get(key);

    if (!row) {
      return null;
    }

    if (row.expires_at > 0 && Date.now() > row.expires_at) {
      this.delete(key);
      return null;
    }

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO ${this.tableName} (key, value, expires_at) VALUES (?, ?, ?)`
    );
    stmt.run(key, serializedValue, expiresAt);
  }

  async delete(key: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE key = ?`);
    stmt.run(key);
  }

  async clear(): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName}`);
    stmt.run();
  }

  cleanup(): void {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE expires_at > 0 AND expires_at < ?`
    );
    stmt.run(Date.now());
  }

  close(): void {
    this.db.close();
  }

  async health(): Promise<{ backend: string; connected: boolean }> {
    try {
      const stmt = this.db.prepare('SELECT 1');
      stmt.get();
      return { backend: 'sqlite', connected: true };
    } catch {
      return { backend: 'sqlite', connected: false };
    }
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
