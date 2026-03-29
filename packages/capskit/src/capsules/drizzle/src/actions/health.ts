import { ActionHandler } from '../../../../types';

/**
 * health - Check database connectivity by running a simple query.
 */
export const health: ActionHandler = async (_payload: any, context) => {
  const drizzle = context.deps.drizzle;
  
  if (!drizzle) {
    return {
      status: 'unhealthy',
      error: 'Drizzle instance not found in dependencies',
      connected: false
    };
  }

  try {
    // Try a simple query to verify connection
    const result = await drizzle.execute('SELECT 1 as health');
    
    return {
      status: 'healthy',
      connected: true,
      timestamp: Date.now(),
      result
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
};
