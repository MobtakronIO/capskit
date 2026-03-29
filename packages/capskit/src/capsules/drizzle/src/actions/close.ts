import { ActionHandler } from '../../../../types';

/**
 * close - Close the database connection pool.
 */
export const close: ActionHandler = async (_payload: any, context) => {
  const drizzle = context.deps.drizzle;
  
  if (!drizzle) {
    return {
      success: false,
      error: 'Drizzle instance not found in dependencies'
    };
  }

  try {
    // Drizzle doesn't have a built-in close method
    // The connection pool (pg, better-sqlite3) typically handles cleanup
    // Attempt to access underlying pool/client if available
    
    const pool = drizzle?.$?.pool || drizzle?.pool;
    
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    } else if (pool && typeof pool.close === 'function') {
      pool.close();
    }
    
    return {
      success: true,
      message: 'Database connection pool closed'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
};
