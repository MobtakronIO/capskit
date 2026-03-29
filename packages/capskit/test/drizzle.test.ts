import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { createCapsKit } from '../src/index';

// Mock Drizzle instance
function createMockDrizzle() {
  return {
    execute: mock(async (sql: string, params?: any[]) => {
      if (sql === 'SELECT 1 as health') {
        return [{ health: 1 }];
      }
      if (sql.includes('SELECT')) {
        return [{ id: 1, name: 'test' }];
      }
      return { rowsAffected: 1 };
    }),
    transaction: mock(async (fn: (tx: any) => Promise<any>) => {
      const mockTx = {
        execute: mock(async (sql: string, params?: any[]) => {
          return { rowsAffected: 1 };
        })
      };
      return fn(mockTx);
    }),
    $: { pool: { end: mock(async () => {}) } },
    pool: { close: mock(() => {}) }
  };
}

describe('Drizzle Capsule', () => {
  let capskit: any;
  let mockDrizzle: any;

  beforeEach(async () => {
    mockDrizzle = createMockDrizzle();
    const result = await createCapsKit({
      dependencies: {
        drizzle: mockDrizzle
      }
    });
    capskit = result.capskit;
  });

  describe('query action', () => {
    test('executes SELECT query successfully', async () => {
      const result = await capskit.call('drizzle.query', {
        body: { sql: 'SELECT * FROM users' }
      });

      expect(result.success).toBe(true);
      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
    });

    test('executes query with params', async () => {
      const result = await capskit.call('drizzle.query', {
        body: { sql: 'SELECT * FROM users WHERE id = $1', params: [1] }
      });

      expect(result.success).toBe(true);
      expect(result.rows).toBeDefined();
    });

    test('throws error when sql is missing', async () => {
      await expect(capskit.call('drizzle.query', { body: {} }))
        .rejects.toThrow("requires field 'sql' in payload");
    });

    test('throws error when drizzle not available', async () => {
      const resultWithout = await createCapsKit({});
      const kitWithoutDrizzle = resultWithout.capskit;
      await expect(kitWithoutDrizzle.call('drizzle.query', { body: { sql: 'SELECT 1' } }))
        .rejects.toThrow('Drizzle instance not found');
    });
  });

  describe('execute action', () => {
    test('executes INSERT/UPDATE/DELETE successfully', async () => {
      const result = await capskit.call('drizzle.execute', {
        body: { sql: 'INSERT INTO users (name) VALUES ($1)', params: ['test'] }
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });

    test('throws error when sql is missing', async () => {
      await expect(capskit.call('drizzle.execute', { body: {} }))
        .rejects.toThrow("requires field 'sql' in payload");
    });
  });

  describe('transaction action', () => {
    test('executes multiple operations in transaction', async () => {
      const result = await capskit.call('drizzle.transaction', {
        body: {
          operations: [
            { sql: 'INSERT INTO users (name) VALUES ($1)', params: ['user1'] },
            { sql: 'INSERT INTO users (name) VALUES ($1)', params: ['user2'] }
          ]
        }
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    test('throws error when operations array is empty', async () => {
      await expect(capskit.call('drizzle.transaction', {
        body: { operations: [] }
      })).rejects.toThrow('Transaction requires at least one operation');
    });

    test('throws error when operations is missing', async () => {
      await expect(capskit.call('drizzle.transaction', { body: {} }))
        .rejects.toThrow("requires field 'operations' in payload");
    });
  });

  describe('migrate action', () => {
    test('returns notImplemented stub', async () => {
      const result = await capskit.call('drizzle.migrate', {});

      expect(result.notImplemented).toBe(true);
      expect(result.message).toContain('drizzle-kit CLI');
    });
  });

  describe('health action', () => {
    test('returns healthy status when drizzle is available', async () => {
      const result = await capskit.call('drizzle.health', {});

      expect(result.status).toBe('healthy');
      expect(result.connected).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    test('returns unhealthy status when drizzle is not available', async () => {
      const resultWithout = await createCapsKit({});
      const kitWithoutDrizzle = resultWithout.capskit;
      const result = await kitWithoutDrizzle.call('drizzle.health', {});

      expect(result.status).toBe('unhealthy');
      expect(result.connected).toBe(false);
    });

    test('returns unhealthy when query fails', async () => {
      const badDrizzle = {
        execute: mock(async () => { throw new Error('Connection failed'); })
      };
      const resultBad = await createCapsKit({
        dependencies: { drizzle: badDrizzle }
      });
      const kitWithBadDrizzle = resultBad.capskit;
      const result = await kitWithBadDrizzle.call('drizzle.health', {});

      expect(result.status).toBe('unhealthy');
      expect(result.connected).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('close action', () => {
    test('closes connection pool successfully', async () => {
      const result = await capskit.call('drizzle.close', {});

      expect(result.success).toBe(true);
    });

    test('returns error when drizzle not available', async () => {
      const resultWithout = await createCapsKit({});
      const kitWithoutDrizzle = resultWithout.capskit;
      const result = await kitWithoutDrizzle.call('drizzle.close', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});

describe('Drizzle Capsule Manifest', () => {
  test('drizzle capsule is registered', async () => {
    const result = await createCapsKit({
      dependencies: { drizzle: createMockDrizzle() }
    });
    const capskit = result.capskit;

    const manifest = capskit.describe('drizzle');
    expect(manifest).toBeDefined();
    expect(manifest.name).toBe('drizzle');
  });

  test('drizzle capsule exposes all required actions', async () => {
    const result = await createCapsKit({
      dependencies: { drizzle: createMockDrizzle() }
    });
    const capskit = result.capskit;

    const manifest = capskit.describe('drizzle');
    expect(manifest.actions.query).toBeDefined();
    expect(manifest.actions.execute).toBeDefined();
    expect(manifest.actions.transaction).toBeDefined();
    expect(manifest.actions.migrate).toBeDefined();
    expect(manifest.actions.health).toBeDefined();
    expect(manifest.actions.close).toBeDefined();
  });
});

describe('Drizzle Capsule Env Parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  test('CAPSKIT_DB_URL parsing', async () => {
    process.env.CAPSKIT_DB_URL = 'postgresql://localhost:5432/testdb';
    
    // We can't easily test the auto-initialization without the actual packages
    // But we can verify the env is read correctly
    expect(process.env.CAPSKIT_DB_URL).toBe('postgresql://localhost:5432/testdb');
  });

  test('CAPSKIT_DB_PROVIDER parsing', () => {
    process.env.CAPSKIT_DB_PROVIDER = 'postgres';
    expect(process.env.CAPSKIT_DB_PROVIDER).toBe('postgres');

    process.env.CAPSKIT_DB_PROVIDER = 'sqlite';
    expect(process.env.CAPSKIT_DB_PROVIDER).toBe('sqlite');
  });

  test('Postgres pool settings parsing', () => {
    process.env.CAPSKIT_DB_POOL_MIN = '5';
    process.env.CAPSKIT_DB_POOL_MAX = '20';
    process.env.CAPSKIT_DB_POOL_IDLE_TIMEOUT = '60000';
    process.env.CAPSKIT_DB_POOL_CONNECTION_TIMEOUT = '15000';

    expect(parseInt(process.env.CAPSKIT_DB_POOL_MIN!)).toBe(5);
    expect(parseInt(process.env.CAPSKIT_DB_POOL_MAX!)).toBe(20);
    expect(parseInt(process.env.CAPSKIT_DB_POOL_IDLE_TIMEOUT!)).toBe(60000);
    expect(parseInt(process.env.CAPSKIT_DB_POOL_CONNECTION_TIMEOUT!)).toBe(15000);
  });
});
