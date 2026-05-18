export const drizzleRepository = {
  async query(db: any, input: { table: string; operation: string; where?: Record<string, unknown>; limit?: number; offset?: number; orderBy?: { field: string; direction: string }[] }) {
    const table = db[input.table];
    if (!table) throw new Error(`Table "${input.table}" not found`);

    let q = table;
    if (input.where) q = q.where(input.where);
    if (input.orderBy) q = q.orderBy(...input.orderBy.map(o => o.direction === 'desc' ? table[o.field].desc() : table[o.field]));
    if (input.limit) q = q.limit(input.limit);
    if (input.offset) q = q.offset(input.offset);

    if (input.operation === 'count') return q.count();
    return q;
  },

  async execute(db: any, input: { table: string; operation: string; data?: Record<string, unknown>; where?: Record<string, unknown> }) {
    const table = db[input.table];
    if (!table) throw new Error(`Table "${input.table}" not found`);

    switch (input.operation) {
      case 'insert': return table.insert(input.data);
      case 'update': return table.update(input.data).where(input.where);
      case 'delete': return table.delete().where(input.where);
      default: throw new Error(`Unknown operation: ${input.operation}`);
    }
  },

  async transaction(db: any, operations: { table: string; operation: string; data?: Record<string, unknown>; where?: Record<string, unknown> }[]) {
    return db.transaction(async (tx: any) => {
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

  async migrate(db: any, migrationsPath: string) {
    // Drizzle migration would use drizzle-kit or migrate()
    // This is a placeholder — actual migration depends on setup
    return { migrated: true, path: migrationsPath };
  },

  async health(db: any) {
    try {
      // Simple query to test connection
      await db.select().from(db._.schema || 'pg_catalog.pg_tables').limit(1);
      return { status: 'connected' };
    } catch {
      return { status: 'disconnected' };
    }
  },

  async close(db: any) {
    // Drizzle doesn't have a close method — it depends on the underlying pool
    if (db.$client?.end) {
      await db.$client.end();
    }
    return { closed: true };
  },
};
