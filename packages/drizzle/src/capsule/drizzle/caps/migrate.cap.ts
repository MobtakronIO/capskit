import { DependencyError } from '@mobtakronio/capskit';

export const meta = {
  name: 'migrate',
};

export default async function migrate(input: any, ctx: any) {
  const db = ctx.deps.drizzle;
  const rawDb = ctx.deps.drizzleInstance;
  const config = ctx.deps.drizzleConfig;
  if (!db) throw new DependencyError('Drizzle ORM not injected');
  if (!rawDb) throw new DependencyError('Drizzle instance not available');
  if (!config) throw new DependencyError('Drizzle config not available');

  const folder = input.body?.path || config.migrationsFolder || './drizzle';

  if (config.dialect === 'sqlite') {
    try {
      const { migrate } = await import('drizzle-orm/better-sqlite3');
      await migrate(rawDb, { migrationsFolder: folder });
      return { migrated: true, dialect: 'sqlite', path: folder };
    } catch (err) {
      return { migrated: false, dialect: 'sqlite', path: folder, error: (err as Error).message };
    }
  }

  try {
    const { migrate } = await import('drizzle-orm/node-postgres');
    await migrate(rawDb, { migrationsFolder: folder });
    return { migrated: true, dialect: 'postgres', path: folder };
  } catch (err) {
    return { migrated: false, dialect: 'postgres', path: folder, error: (err as Error).message };
  }
}
