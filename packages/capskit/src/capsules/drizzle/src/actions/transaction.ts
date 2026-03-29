import { ActionHandler, ActionInput } from '../../../../types';

interface TransactionOperation {
  sql: string;
  params?: any[];
}

/**
 * transaction - Execute multiple operations in a single database transaction.
 */
export const transaction: ActionHandler = async (payload: ActionInput, context) => {
  const drizzle = context.deps.drizzle;
  
  if (!drizzle) {
    throw new Error('Drizzle instance not found in dependencies. Ensure CAPSKIT_DB_URL is configured.');
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
      const txResults = [];
      
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
};
