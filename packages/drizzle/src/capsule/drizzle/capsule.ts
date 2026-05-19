import type { CapsuleDefinition, CapsuleCap, KernelDeps } from '@mobtakronio/capskit';
import { drizzleRepository } from './repository/drizzle.repository';

export type DrizzleDialect = 'sqlite' | 'bun-sqlite' | 'postgres';

export interface DrizzleCapsuleConfig {
  dialect: DrizzleDialect;
  connection: string | unknown;
  schema?: Record<string, unknown>;
  migrationsFolder?: string;
  poolConfig?: {
    max?: number;
    idleTimeoutMillis?: number;
  };
}

function requireDb(ctx: any) {
  const db = ctx.deps.drizzle;
  if (!db) throw new Error('Drizzle ORM not initialized — use createDrizzleCapsule(config) and register as a pre-registered capsule');
  return db;
}

const drizzleCaps: CapsuleCap[] = [
  {
    meta: { name: 'query', kind: 'action' },
    handler: async (input: any, ctx: any) => {
      const db = requireDb(ctx);
      const result = await drizzleRepository.query(db, input.body);
      return { data: result };
    },
  },
  {
    meta: { name: 'execute', kind: 'action' },
    handler: async (input: any, ctx: any) => {
      const db = requireDb(ctx);
      const result = await drizzleRepository.execute(db, input.body);
      return { result };
    },
  },
  {
    meta: { name: 'transaction', kind: 'action' },
    handler: async (input: any, ctx: any) => {
      const db = requireDb(ctx);
      const results = await drizzleRepository.transaction(db, input.body?.operations);
      return { results };
    },
  },
  {
    meta: { name: 'migrate', kind: 'action' },
    handler: async (input: any, ctx: any) => {
      const rawDb = ctx.deps.drizzleInstance;
      const config = ctx.deps.drizzleConfig;
      if (!rawDb) throw new Error('Drizzle instance not available');
      if (!config) throw new Error('Drizzle config not available');

      const folder = input.body?.path || config.migrationsFolder || './drizzle';

      if (config.dialect === 'sqlite') {
        try {
          // @ts-expect-error peer dependency
          const { migrate } = await import('drizzle-orm/better-sqlite3');
          await migrate(rawDb, { migrationsFolder: folder });
          return { migrated: true, dialect: 'sqlite', path: folder };
        } catch (err) {
          return { migrated: false, dialect: 'sqlite', path: folder, error: (err as Error).message };
        }
      }

      if (config.dialect === 'bun-sqlite') {
        try {
          // @ts-expect-error peer dependency
          const { migrate } = await import('drizzle-orm/bun-sqlite');
          await migrate(rawDb, { migrationsFolder: folder });
          return { migrated: true, dialect: 'bun-sqlite', path: folder };
        } catch (err) {
          return { migrated: false, dialect: 'bun-sqlite', path: folder, error: (err as Error).message };
        }
      }

      try {
        // @ts-expect-error peer dependency
        const { migrate } = await import('drizzle-orm/node-postgres');
        await migrate(rawDb, { migrationsFolder: folder });
        return { migrated: true, dialect: 'postgres', path: folder };
      } catch (err) {
        return { migrated: false, dialect: 'postgres', path: folder, error: (err as Error).message };
      }
    },
  },
  {
    meta: { name: 'health', kind: 'action' },
    handler: async (input: any, ctx: any) => {
      const db = requireDb(ctx);
      return drizzleRepository.health(db);
    },
  },
  {
    meta: { name: 'close', kind: 'action' },
    handler: async (input: any, ctx: any) => {
      const db = requireDb(ctx);
      return drizzleRepository.close(db);
    },
  },
];

export function createDrizzleCapsule(config: DrizzleCapsuleConfig): CapsuleDefinition {
  return {
    name: 'drizzle',
    dependencies: [],
    caps: drizzleCaps,
    boot: {
      init: async ({ deps }: { deps: KernelDeps }) => {
        let db: unknown;

        if (config.dialect === 'sqlite') {
          // @ts-expect-error peer dependency
          const { drizzle } = await import('drizzle-orm/better-sqlite3');
          const Database = (await import('better-sqlite3')).default;
          const dbInstance = typeof config.connection === 'string'
            ? new Database(config.connection)
            : config.connection;
          db = drizzle(dbInstance, { schema: config.schema });
          deps.dependencies.drizzleInstance = dbInstance;
        } else if (config.dialect === 'bun-sqlite') {
          // @ts-expect-error peer dependency
          const { drizzle } = await import('drizzle-orm/bun-sqlite');
          const { Database } = await import('bun:sqlite' as string);
          const dbInstance = typeof config.connection === 'string'
            ? new Database(config.connection)
            : config.connection;
          db = drizzle(dbInstance, { schema: config.schema });
          deps.dependencies.drizzleInstance = dbInstance;
        } else {
          // @ts-expect-error peer dependency
          const { drizzle } = await import('drizzle-orm/node-postgres');
          // @ts-expect-error peer dependency
          const { Pool } = await import('pg');
          const pool = typeof config.connection === 'string'
            ? new Pool({
                connectionString: config.connection,
                max: config.poolConfig?.max,
                idleTimeoutMillis: config.poolConfig?.idleTimeoutMillis,
              })
            : config.connection;
          db = drizzle(pool, { schema: config.schema });
          deps.dependencies.drizzleInstance = pool;
        }

        deps.dependencies.drizzle = db;
        deps.dependencies.drizzleConfig = config;
      },
      shutdown: async ({ deps }: { deps: KernelDeps }) => {
        const rawDb = deps.dependencies.drizzleInstance as any;
        if (!rawDb) return;

        if (config.dialect === 'sqlite' || config.dialect === 'bun-sqlite') {
          rawDb?.close?.();
        } else {
          await rawDb?.end?.();
        }
      },
    },
  };
}

export default {
  name: 'drizzle',
  dependencies: [],
  boot: {
    init: async () => {
      // Use createDrizzleCapsule(config) to initialize with a database connection
    },
  },
} satisfies CapsuleDefinition;
