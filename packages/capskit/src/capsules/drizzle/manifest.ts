import { CapsuleManifest } from '../../types';
import { query } from './src/actions/query';
import { execute } from './src/actions/execute';
import { transaction } from './src/actions/transaction';
import { migrate } from './src/actions/migrate';
import { health } from './src/actions/health';
import { close } from './src/actions/close';

export const service: CapsuleManifest = {
  name: 'drizzle',
  actions: {
    query: {
      handler: query,
      description: 'Execute a SELECT query using the injected Drizzle instance. Supports raw SQL via the sql tag.',
      schema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query string or Drizzle sql` template literal' },
          params: { type: 'array', description: 'Query parameters for prepared statements' }
        },
        required: ['sql']
      }
    },
    execute: {
      handler: execute,
      description: 'Execute INSERT, UPDATE, or DELETE statements.',
      schema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL statement or Drizzle sql` template literal' },
          params: { type: 'array', description: 'Statement parameters' }
        },
        required: ['sql']
      }
    },
    transaction: {
      handler: transaction,
      description: 'Execute multiple operations in a single transaction.',
      schema: {
        type: 'object',
        properties: {
          operations: { 
            type: 'array', 
            description: 'Array of { sql, params } objects to execute in transaction' 
          }
        },
        required: ['operations']
      }
    },
    migrate: {
      handler: migrate,
      description: 'Run database migrations. Currently not implemented.'
    },
    health: {
      handler: health,
      description: 'Check database connectivity by running a simple query.'
    },
    close: {
      handler: close,
      description: 'Close the database connection pool.'
    }
  }
};
