import { ActionInput, CapContext } from '@mobtakronio/capskit';

/**
 * Cap: drizzle — Drizzle ORM database operations.
 *
 * Provides query, execute, transaction, migration, health check,
 * and connection-close actions against the injected Drizzle instance.
 *
 * Actions:
 * - query       — SELECT queries
 * - execute     — INSERT / UPDATE / DELETE statements
 * - transaction — multi-statement transactional execution
 * - migrate     — migration stub (delegates to drizzle-kit CLI)
 * - health      — connectivity check via SELECT 1
 * - close       — closes the underlying connection pool
 */
export default class DrizzleCap {
  [action: string]: any;

  /**
   * Execute a SELECT query using the injected Drizzle instance.
   * Supports raw SQL strings and Drizzle sql` template literal results.
   */
  async query(payload: ActionInput, ctx: CapContext): Promise<any> {
    const drizzle = ctx.deps.drizzle;

    if (!drizzle) {
      throw new Error(
        'Drizzle instance not found in dependencies. Ensure CAPSKIT_DB_URL is configured.',
      );
    }

    const { sql, params } = payload.body;

    if (!sql) {
      throw new Error('Query action requires "sql" in payload body');
    }

    try {
      let result: any;
      if (typeof sql === 'string') {
        result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
      } else if (typeof sql === 'object' && (sql as any)?.constructor?.name === 'SQL') {
        result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
      } else {
        throw new Error('sql parameter must be a string or Drizzle sql template literal');
      }

      const rows = result instanceof Promise ? await result : result;

      return {
        success: true,
        rows: Array.isArray(rows) ? rows : (rows?.rows ?? rows),
      };
    } catch (error: any) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  /**
   * Execute INSERT, UPDATE, or DELETE statements.
   */
  async execute(payload: ActionInput, ctx: CapContext): Promise<any> {
    const drizzle = ctx.deps.drizzle;

    if (!drizzle) {
      throw new Error(
        'Drizzle instance not found in dependencies. Ensure CAPSKIT_DB_URL is configured.',
      );
    }

    const { sql, params } = payload.body;

    if (!sql) {
      throw new Error('Execute action requires "sql" in payload body');
    }

    try {
      let result: any;
      if (typeof sql === 'string') {
        result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
      } else if (typeof sql === 'object' && (sql as any)?.constructor?.name === 'SQL') {
        result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
      } else {
        throw new Error('sql parameter must be a string or Drizzle sql template literal');
      }

      const execution = result instanceof Promise ? await result : result;

      return {
        success: true,
        result: execution,
      };
    } catch (error: any) {
      throw new Error(`Execute failed: ${error.message}`);
    }
  }

  /**
   * Execute multiple operations in a single database transaction.
   */
  async transaction(payload: ActionInput, ctx: CapContext): Promise<any> {
    const drizzle = ctx.deps.drizzle;

    if (!drizzle) {
      throw new Error(
        'Drizzle instance not found in dependencies. Ensure CAPSKIT_DB_URL is configured.',
      );
    }

    const { operations } = payload.body;

    if (!operations || !Array.isArray(operations)) {
      throw new Error('Transaction action requires "operations" array in payload body');
    }

    if (operations.length === 0) {
      throw new Error('Transaction requires at least one operation');
    }

    try {
      const results = await drizzle.transaction(async (tx: any) => {
        const txResults: any[] = [];

        for (const op of operations) {
          if (!op.sql) {
            throw new Error('Each operation must have a sql property');
          }

          const result = op.params
            ? await tx.execute(op.sql, op.params)
            : await tx.execute(op.sql);

          txResults.push(result);
        }

        return txResults;
      });

      return {
        success: true,
        results,
      };
    } catch (error: any) {
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  /**
   * Stub for database migrations.
   * Returns notImplemented since migrations require drizzle-kit CLI.
   */
  async migrate(_payload: ActionInput, _ctx: CapContext): Promise<any> {
    return {
      notImplemented: true,
      message:
        'Migrations require drizzle-kit CLI. Use `npx drizzle-kit push` or `migrate` command directly.',
      alternatives: [
        'npx drizzle-kit push - Push schema to database',
        'npx drizzle-kit generate - Generate migration files',
        'npx drizzle-kit migrate - Apply pending migrations',
      ],
    };
  }

  /**
   * Check database connectivity by running a simple query.
   */
  async health(_payload: ActionInput, ctx: CapContext): Promise<any> {
    const drizzle = ctx.deps.drizzle;

    if (!drizzle) {
      return {
        status: 'unhealthy',
        error: 'Drizzle instance not found in dependencies',
        connected: false,
      };
    }

    try {
      const result = await drizzle.execute('SELECT 1 as health');

      return {
        status: 'healthy',
        connected: true,
        timestamp: Date.now(),
        result,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Close the database connection pool.
   */
  async close(_payload: ActionInput, ctx: CapContext): Promise<any> {
    const drizzle = ctx.deps.drizzle;

    if (!drizzle) {
      return {
        success: false,
        error: 'Drizzle instance not found in dependencies',
      };
    }

    try {
      const pool = (drizzle as any)?.$?.pool || (drizzle as any)?.pool;

      if (pool && typeof pool.end === 'function') {
        await pool.end();
      } else if (pool && typeof pool.close === 'function') {
        pool.close();
      }

      return {
        success: true,
        message: 'Database connection pool closed',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
