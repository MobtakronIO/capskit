import { ActionHandler, ActionInput } from '../../../../types';

/**
 * query - Execute a SELECT query using the injected Drizzle instance.
 * Supports raw SQL via Drizzle sql` template literal.
 */
export const query: ActionHandler = async (payload: ActionInput, context) => {
  const drizzle = context.deps.drizzle;
  
  if (!drizzle) {
    throw new Error('Drizzle instance not found in dependencies. Ensure CAPSKIT_DB_URL is configured.');
  }

  const { sql, params } = payload.body;
  
  if (!sql) {
    throw new Error('Query action requires "sql" in payload body');
  }

  try {
    // Support both string SQL and drizzle sql template literal result
    let result;
    if (typeof sql === 'string') {
      result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
    } else if (typeof sql === 'object' && sql?.constructor?.name === 'SQL') {
      // Drizzle sql template literal result
      result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
    } else {
      throw new Error('sql parameter must be a string or Drizzle sql template literal');
    }

    // Handle both sync and async execute
    const rows = result instanceof Promise ? await result : result;
    
    return {
      success: true,
      rows: Array.isArray(rows) ? rows : (rows?.rows ?? rows),
    };
  } catch (error: any) {
    throw new Error(`Query failed: ${error.message}`);
  }
};
