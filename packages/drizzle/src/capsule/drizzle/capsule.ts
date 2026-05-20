import type { CapsuleDefinition, CapsuleCap, KernelDeps } from '@mobtakronio/capskit';
import { drizzleRepository, createDrizzleRepository } from './repository/drizzle.repository';
import type { DrizzleRepository } from './types/drizzle.type';
import * as fs from 'fs';
import * as path from 'node:path';

export type DrizzleDialect = 'sqlite' | 'bun-sqlite' | 'postgres';

export interface DrizzleCapsuleConfig {
  dialect: DrizzleDialect;
  connection: string | unknown;
  /** Schema object OR path to schema file (e.g., './schema.ts') */
  schema?: Record<string, unknown> | string;
  migrationsFolder?: string;
  poolConfig?: {
    max?: number;
    idleTimeoutMillis?: number;
  };
}

// Helper: resolve schema from object or path
async function resolveSchema(schema?: Record<string, unknown> | string): Promise<Record<string, unknown> | undefined> {
  if (!schema) return undefined;
  if (typeof schema === 'object') return schema;
  // It's a path string — dynamically import
  const resolvedPath = path.isAbsolute(schema) ? schema : path.resolve(process.cwd(), schema);
  const mod = await import(resolvedPath);
  return mod.default || mod.schema || Object.values(mod)[0];
}

// Helper: ensure parent directory exists (for SQLite file paths)
function ensureDbDirExists(connection: string): void {
  const dir = path.dirname(connection);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function requireRepo(ctx: any): DrizzleRepository {
  const repo = ctx.deps.dependencies?.drizzleRepo;
  if (!repo) throw new Error('Drizzle repository not initialized — use createDrizzleCapsule(config) and register as a pre-registered capsule');
  return repo;
}

const drizzleCaps: CapsuleCap[] = [
  {
    meta: { name: 'query' },
    handler: async (input: any, ctx: any) => {
      const repo = requireRepo(ctx);
      const result = await repo.query(input.body);
      return { data: result };
    },
  },
  {
    meta: { name: 'execute' },
    handler: async (input: any, ctx: any) => {
      const repo = requireRepo(ctx);
      const result = await repo.execute(input.body);
      return { result };
    },
  },
  {
    meta: { name: 'transaction' },
    handler: async (input: any, ctx: any) => {
      const repo = requireRepo(ctx);
      const results = await repo.transaction(input.body?.operations);
      return { results };
    },
  },
  {
    meta: { name: 'migrate' },
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
    meta: { name: 'health' },
    handler: async (input: any, ctx: any) => {
      const repo = requireRepo(ctx);
      return repo.health();
    },
  },
  {
    meta: { name: 'close' },
    handler: async (input: any, ctx: any) => {
      const repo = requireRepo(ctx);
      return repo.close();
    },
  },
];

export async function createCapsule(config: DrizzleCapsuleConfig): Promise<CapsuleDefinition> {
  const resolvedSchema = await resolveSchema(config.schema);

  return {
    name: 'drizzle',
    dependencies: [],
    caps: drizzleCaps,
    boot: {
      init: async ({ deps }: { deps: KernelDeps }) => {
        // Auto-create DB directory for SQLite file paths
        if (typeof config.connection === 'string' &&
            (config.dialect === 'sqlite' || config.dialect === 'bun-sqlite')) {
          ensureDbDirExists(config.connection);
        }

        let db: unknown;

        if (config.dialect === 'sqlite') {
          // @ts-expect-error peer dependency
          const { drizzle } = await import('drizzle-orm/better-sqlite3');
          const Database = (await import('better-sqlite3')).default;
          const dbInstance = typeof config.connection === 'string'
            ? new Database(config.connection)
            : config.connection;
          db = drizzle(dbInstance, { schema: resolvedSchema });
          deps.dependencies.drizzleInstance = dbInstance;
        } else if (config.dialect === 'bun-sqlite') {
          // @ts-expect-error peer dependency
          const { drizzle } = await import('drizzle-orm/bun-sqlite');
          const { Database } = await import('bun:sqlite' as string);
          const dbInstance = typeof config.connection === 'string'
            ? new Database(config.connection)
            : config.connection;
          db = drizzle(dbInstance, { schema: resolvedSchema });
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
          db = drizzle(pool, { schema: resolvedSchema });
          deps.dependencies.drizzleInstance = pool;
        }

        deps.dependencies.drizzle = db;
        deps.dependencies.drizzleRepo = createDrizzleRepository(db);
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

// Deprecated alias — use createCapsule instead
/** @deprecated Use `createCapsule` instead */
export const createDrizzleCapsule = createCapsule;

export default {
  name: 'drizzle',
  dependencies: [],
  boot: {
    init: async () => {
      // Use createCapsule(config) to initialize with a database connection
    },
  },
} satisfies CapsuleDefinition;
