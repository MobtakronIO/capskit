import type { DrizzleRepository } from '../types/drizzle.type';

/**
 * Create a bound repository instance from a Drizzle database instance.
 * The factory captures `db` in closure so callers don't need to pass it.
 */
export function createDrizzleRepository(db: unknown): DrizzleRepository {
  const d = db as any;
  return {
    async query(input: { table: string; operation: string; where?: Record<string, unknown>; limit?: number; offset?: number; orderBy?: { field: string; direction: string }[] }) {
      const table = d[input.table];
      if (!table) throw new Error(`Table "${input.table}" not found`);

      let q = table;
      if (input.where) q = q.where(input.where);
      if (input.orderBy) q = q.orderBy(...input.orderBy.map(o => o.direction === 'desc' ? table[o.field].desc() : table[o.field]));
      if (input.limit) q = q.limit(input.limit);
      if (input.offset) q = q.offset(input.offset);

      if (input.operation === 'count') return q.count();
      return q;
    },

    async execute(input: { table: string; operation: string; data?: Record<string, unknown>; where?: Record<string, unknown> }) {
      const table = d[input.table];
      if (!table) throw new Error(`Table "${input.table}" not found`);

      switch (input.operation) {
        case 'insert': return table.insert(input.data);
        case 'update': return table.update(input.data).where(input.where);
        case 'delete': return table.delete().where(input.where);
        default: throw new Error(`Unknown operation: ${input.operation}`);
      }
    },

    async transaction(operations: { table: string; operation: string; data?: Record<string, unknown>; where?: Record<string, unknown> }[]) {
      return d.transaction(async (tx: any) => {
        const results = [];
        for (const op of operations) {
          const table = tx[op.table];
          if (!table) throw new Error(`Table "${op.table}" not found in transaction`);
          switch (op.operation) {
            case 'insert': results.push(await table.insert(op.data)); break;
            case 'update': results.push(await table.update(op.data).where(op.where)); break;
            case 'delete': results.push(await table.delete().where(op.where)); break;
            default: throw new Error(`Unknown operation: ${op.operation}`);
          }
        }
        return results;
      });
    },

    async health() {
      try {
        await d.select().from(d._.schema || 'pg_catalog.pg_tables').limit(1);
        return { status: 'connected' };
      } catch {
        return { status: 'disconnected' };
      }
    },

    async close() {
      if (d.$client?.end) {
        await d.$client.end();
      }
      return { closed: true };
    },
  };
}

/**
 * Backward-compatible static object for existing code that passes db as first arg.
 * Delegates to the factory internally.
 */
export const drizzleRepository = {
  query: (db: unknown, input: any) => createDrizzleRepository(db).query(input),
  execute: (db: unknown, input: any) => createDrizzleRepository(db).execute(input),
  transaction: (db: unknown, ops: any) => createDrizzleRepository(db).transaction(ops),
  health: (db: unknown) => createDrizzleRepository(db).health(),
  close: (db: unknown) => createDrizzleRepository(db).close(),
};
