import { ActionHandler } from '../../../../types';

/**
 * migrate - Stub for database migrations.
 * Returns notImplemented: true since migrations require drizzle-kit CLI.
 */
export const migrate: ActionHandler = async () => {
  return {
    notImplemented: true,
    message: 'Migrations require drizzle-kit CLI. Use `npx drizzle-kit push` or `migrate` command directly.',
    alternatives: [
      'npx drizzle-kit push - Push schema to database',
      'npx drizzle-kit generate - Generate migration files',
      'npx drizzle-kit migrate - Apply pending migrations'
    ]
  };
};
