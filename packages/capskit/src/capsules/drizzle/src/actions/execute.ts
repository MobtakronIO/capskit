import { ActionHandler, ActionInput } from '../../../../types';

/**
 * execute - Execute INSERT, UPDATE, or DELETE statements.
 */
export const execute: ActionHandler = async (payload: ActionInput, context) => {
  const drizzle = context.deps.drizzle;
  
  if (!drizzle) {
    throw new Error('Drizzle instance not found in dependencies. Ensure CAPSKIT_DB_URL is configured.');
  }

  const { sql, params } = payload.body;
  
  if (!sql) {
    throw new Error('Execute action requires "sql" in payload body');
  }

  try {
    let result;
    if (typeof sql === 'string') {
      result = params ? drizzle.execute(sql, params) : drizzle.execute(sql);
    } else if (typeof sql === 'object' && sql?.constructor?.name === 'SQL') {
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
};
