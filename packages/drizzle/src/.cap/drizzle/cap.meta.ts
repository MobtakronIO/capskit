import { CapMeta } from '@mobtakronio/capskit';

/**
 * Metadata for the drizzle cap.
 */
export const meta: CapMeta = {
  name: 'drizzle',
  actions: {
    query: {
      description:
        'Execute a SELECT query using the injected Drizzle instance. Supports raw SQL via the sql tag.',
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query string or Drizzle sql` template literal' },
          params: { type: 'array', description: 'Query parameters for prepared statements' },
        },
        required: ['sql'],
      },
    },
    execute: {
      description: 'Execute INSERT, UPDATE, or DELETE statements.',
      inputSchema: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'SQL statement or Drizzle sql` template literal',
          },
          params: { type: 'array', description: 'Statement parameters' },
        },
        required: ['sql'],
      },
    },
    transaction: {
      description: 'Execute multiple operations in a single transaction.',
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: 'Array of { sql, params } objects to execute in transaction',
          },
        },
        required: ['operations'],
      },
    },
    migrate: {
      description: 'Run database migrations. Currently not implemented.',
    },
    health: {
      description: 'Check database connectivity by running a simple query.',
    },
    close: {
      description: 'Close the database connection pool.',
    },
  },
};
