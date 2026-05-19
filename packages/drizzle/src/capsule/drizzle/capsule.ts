import type { CapsuleDefinition, KernelDeps } from '@mobtakronio/capskit';

export type DrizzleDialect = 'sqlite' | 'postgres';

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

export function createDrizzleCapsule(config: DrizzleCapsuleConfig): CapsuleDefinition {
  return {
    name: 'drizzle',
    dependencies: [],
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

        if (config.dialect === 'sqlite') {
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
