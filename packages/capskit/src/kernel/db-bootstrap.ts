/**
 * Database Bootstrap for CapsKit.
 *
 * Constructs a Drizzle ORM instance from CAPSKIT_DB_* environment variables.
 * Supports Postgres (via @neondatabase/serverless) and SQLite (via better-sqlite3).
 *
 * Extracted from platform.ts to reduce the god class size.
 */

import { kernelLogger } from './logger';

/**
 * Pool configuration for Postgres (neon).
 * Parsed from CAPSKIT_DB_POOL_* environment variables.
 * Not applicable to SQLite (better-sqlite3 is synchronous).
 */
export interface PoolConfig {
  min?: number;
  max?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
}

/**
 * Safely extract default export from a dynamically imported module.
 * Handles both ESM ({ default: ... }) and CJS (direct export) interop.
 */
function getDefaultExport<T = unknown>(module: Record<string, unknown>): T {
  return ('default' in module ? module.default : module) as T;
}

/**
 * Parse pool configuration from environment variables.
 */
export function parsePoolConfig(): PoolConfig {
  const config: PoolConfig = {};

  const min = process.env.CAPSKIT_DB_POOL_MIN;
  if (min !== undefined) {
    const parsed = parseInt(min, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.min = parsed;
    }
  }

  const max = process.env.CAPSKIT_DB_POOL_MAX;
  if (max !== undefined) {
    const parsed = parseInt(max, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      config.max = parsed;
    }
  }

  const idleTimeout = process.env.CAPSKIT_DB_POOL_IDLE_TIMEOUT;
  if (idleTimeout !== undefined) {
    const parsed = parseInt(idleTimeout, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.idleTimeout = parsed;
    }
  }

  const connectionTimeout = process.env.CAPSKIT_DB_POOL_CONNECTION_TIMEOUT;
  if (connectionTimeout !== undefined) {
    const parsed = parseInt(connectionTimeout, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.connectionTimeout = parsed;
    }
  }

  return config;
}

/**
 * Construct a Drizzle instance from CAPSKIT_DB_* environment variables.
 *
 * Supports:
 * - Postgres: via @neondatabase/serverless (CAPSKIT_DB_URL must start with postgres://)
 * - SQLite:   via better-sqlite3 (CAPSKIT_DB_URL is a file path)
 *
 * The required packages are dynamically imported so they remain optional.
 * Returns undefined if packages are not installed or URL is not configured.
 *
 * @returns A Drizzle ORM instance, or undefined if not configured.
 */
export async function createDrizzleFromEnv(): Promise<unknown> {
  const dbUrl = process.env.CAPSKIT_DB_URL;

  if (!dbUrl) {
    return undefined;
  }

  // Auto-detect provider from URL if not explicitly set
  const provider =
    process.env.CAPSKIT_DB_PROVIDER ||
    (dbUrl.startsWith('postgres') || dbUrl.startsWith('postgresql')
      ? 'postgres'
      : 'sqlite');

  const poolConfig = parsePoolConfig();
  const hasPoolConfig = Object.keys(poolConfig).length > 0;

  try {
    if (provider === 'postgres') {
      const neonModule = await import('@neondatabase/serverless');
      const neon = getDefaultExport(neonModule) as (
        url: string,
        config?: { poolConfig?: PoolConfig },
      ) => unknown;
      const drizzleModule = await import('drizzle-orm');

      const sql = neon(dbUrl, hasPoolConfig ? { poolConfig } : undefined);
      const drizzle = (
        drizzleModule as unknown as Record<string, (db: unknown) => unknown>
      ).drizzle;
      return drizzle(sql);
    } else if (provider === 'sqlite') {
      if (hasPoolConfig) {
        kernelLogger.warn(
          'Pool settings (CAPSKIT_DB_POOL_*) are not applicable for SQLite (better-sqlite3 is synchronous).',
        );
      }

      const betterSqlite3Module = await import('better-sqlite3');
      const drizzleModule2 = await import('drizzle-orm');

      const BetterSQLite3 = getDefaultExport(
        betterSqlite3Module,
      ) as new (path: string) => unknown;
      const db = new BetterSQLite3(dbUrl);
      const drizzle = (
        drizzleModule2 as unknown as Record<string, (db: unknown) => unknown>
      ).drizzle;
      return drizzle(db);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    kernelLogger.warn(
      `Failed to initialize ${provider} database: ${message}`,
    );
    return undefined;
  }

  return undefined;
}
