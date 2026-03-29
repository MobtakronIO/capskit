/**
 * Example tests demonstrating @capskit/testing toolkit usage
 * 
 * These tests show how to:
 * - Test a single action with mocked deps
 * - Test event emission
 * - Test pre/post hooks
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createTestCapsKit, createTestAction } from '../src/index';
import { createMockDeps, captureEvents, EventCapture } from '../src/index';
import { assertActionResult, assertEvents, assertEventEmitted } from '../src/index';
import type { ActionHandler, ActionContext, ActionInput } from '@mobtakronio/capskit';

describe('@capskit/testing toolkit', () => {
  describe('createTestCapsKit', () => {
    it('should create a test harness for a single capsule', async () => {
      const harness = createTestCapsKit({
        manifest: {
          name: 'test-capsule',
          actions: {
            getUser: {
              handler: async (input: ActionInput): Promise<unknown> => {
                return { id: input.body.id, name: 'Alice' };
              }
            }
          }
        }
      });

      const { result } = await harness.capskit.call('getUser', { id: 1 });

      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('should support full action names (capsule.action)', async () => {
      const harness = createTestCapsKit({
        manifest: {
          name: 'users',
          actions: {
            find: {
              handler: async (input: ActionInput): Promise<unknown> => {
                return { id: input.body.id };
              }
            }
          }
        }
      });

      const { result } = await harness.capskit.call('users.find', { id: 42 });

      expect(result).toEqual({ id: 42 });
    });

    it('should capture emitted events', async () => {
      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            createOrder: {
              handler: (input: ActionInput, ctx: ActionContext): Promise<unknown> => {
                ctx.emit('order:created', { orderId: '123', item: input.body.item });
                return Promise.resolve({ orderId: '123', status: 'created' });
              }
            }
          }
        }
      });

      const { result, events } = await harness.capskit.call('createOrder', { item: 'widget' });

      expect(result).toEqual({ orderId: '123', status: 'created' });
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('order:created');
      expect(events[0].data).toEqual({ orderId: '123', item: 'widget' });
    });

    it('should allow overriding deps with mocks', async () => {
      const mockDeps = createMockDeps({ spyOnMethods: true });

      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            getData: {
              handler: async (input: ActionInput, ctx: ActionContext): Promise<unknown> => {
                const db = ctx.deps.db as Record<string, (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>;
                const result = await db.query('SELECT * FROM users WHERE id = ?', [input.body.id]);
                return result;
              }
            }
          }
        },
        deps: {}
      });

      // Replace with mock
      harness.deps.db = mockDeps.createMockDep('db', {
        query: async (): Promise<{ rows: unknown[] }> => ({ rows: [{ id: 1, name: 'Bob' }] })
      });

      const { result } = await harness.capskit.call('getData', { id: 1 });

      expect(result).toEqual({ rows: [{ id: 1, name: 'Bob' }] });
    });

    it('should support pre-hooks', async () => {
      let hookCalled = false;

      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            doSomething: {
              handler: async (): Promise<string> => 'action result',
              pre: [
                async () => {
                  hookCalled = true;
                }
              ]
            }
          }
        }
      });

      await harness.capskit.call('doSomething', {});

      expect(hookCalled).toBe(true);
    });

    it('should support post-hooks', async () => {
      let postHookResult: unknown = null;

      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            getValue: {
              handler: async (): Promise<number> => 42,
              post: [
                async (_input: ActionInput, result: unknown): Promise<number> => {
                  postHookResult = result;
                  return (result as number) * 2; // Modify the result
                }
              ]
            }
          }
        }
      });

      const { result } = await harness.capskit.call('getValue', {});

      expect(postHookResult).toBe(42);
      expect(result).toBe(84); // Modified by post-hook
    });
  });

  describe('createTestAction', () => {
    it('should create a test harness for a single action', async () => {
      const harness = createTestAction(
        'greet',
        async (input: ActionInput): Promise<{ message: string }> => ({
          message: `Hello, ${input.body.name}!`
        })
      );

      const { result } = await harness.capskit.call('greet', { name: 'World' });

      expect(result).toEqual({ message: 'Hello, World!' });
    });
  });

  describe('createMockDeps', () => {
    it('should create mock deps with spy support', async () => {
      const { createMockDep, spyOnDep } = createMockDeps();

      const db = createMockDep('db', {
        query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
        insert: async (): Promise<{ id: number }> => ({ id: 1 })
      });

      // Get a spy on the query method
      const querySpy = spyOnDep(db, 'query');

      expect(querySpy.called).toBe(false);

      // Call the method through the proxy
      const dbObj = db.value as { query: (sql: string) => Promise<unknown> };
      await dbObj.query('SELECT 1');

      expect(querySpy.called).toBe(true);
      expect(querySpy.callCount).toBe(1);
    });
  });

  describe('captureEvents', () => {
    it('should capture events using captureEvents helper', () => {
      const { events, emit } = captureEvents();

      emit('user:created', { id: 1 });
      emit('user:updated', { id: 1 });

      expect(events).toHaveLength(2);
      expect(events[0].name).toBe('user:created');
      expect(events[1].data).toEqual({ id: 1 });
    });

    it('should capture events using EventCapture class', () => {
      const capture = new EventCapture();

      capture.emit('order:placed', { orderId: 'abc' });
      capture.emit('order:shipped', { orderId: 'abc' });

      expect(capture.count()).toBe(2);
      expect(capture.hasEvent('order:placed')).toBe(true);
      expect(capture.hasEvent('order:cancelled')).toBe(false);
    });

    it('should filter events by pattern', () => {
      const capture = new EventCapture();

      capture.emit('user:created', { id: 1 });
      capture.emit('user:deleted', { id: 1 });
      capture.emit('order:created', { id: 100 });

      const userEvents = capture.getEventsByPattern('user:*');

      expect(userEvents).toHaveLength(2);
      expect(capture.countByPattern('order:*')).toBe(1);
    });

    it('should clear events', () => {
      const capture = new EventCapture();

      capture.emit('test', { data: 1 });
      expect(capture.count()).toBe(1);

      capture.clear();
      expect(capture.count()).toBe(0);
    });

    it('should handle regex special characters in event names', () => {
      const capture = new EventCapture();

      capture.emit('user:created.test', { id: 1 });
      capture.emit('user:updated', { id: 1 });
      capture.emit('order:created', { id: 100 });

      // Pattern with wildcards should match all user:* events
      const userEvents = capture.getEventsByPattern('user:*');
      expect(userEvents).toHaveLength(2); // matches both user:created.test and user:updated

      // Exact match with regex chars should work
      const exactMatch = capture.getEventsByPattern('user:created.test');
      expect(exactMatch).toHaveLength(1);
      expect(exactMatch[0].data).toEqual({ id: 1 });

      // Pattern with wildcard should NOT match order events
      const orderEvents = capture.getEventsByPattern('order:*');
      expect(orderEvents).toHaveLength(1);
    });
  });

  describe('assertions', () => {
    it('should assert action results with deep equality', async () => {
      const harness = createTestAction(
        'getUser',
        async (): Promise<{ id: number; name: string; email: string }> => ({
          id: 1,
          name: 'Alice',
          email: 'alice@example.com'
        })
      );

      const { result } = await harness.capskit.call('getUser', {});

      // This should pass
      assertActionResult(result, { id: 1, name: 'Alice', email: 'alice@example.com' });

      // This should throw with a helpful message
      try {
        assertActionResult(result, { id: 1, name: 'Bob' });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        const message = (e as Error).message;
        expect(message).toContain('Action result mismatch');
        expect(message).toContain('Alice');
        expect(message).toContain('Bob');
      }
    });

    it('should assert events match expected pattern', async () => {
      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            createUser: {
              handler: (input: ActionInput, ctx: ActionContext): Promise<{ id: number }> => {
                ctx.emit('user:created', { id: 1, name: input.body.name });
                ctx.emit('email:sent', { to: input.body.email, template: 'welcome' });
                return Promise.resolve({ id: 1 });
              }
            }
          }
        }
      });

      const { events } = await harness.capskit.call('createUser', {
        name: 'Bob',
        email: 'bob@example.com'
      });

      assertEvents(events, [
        { name: 'user:created', data: { id: 1, name: 'Bob' } },
        { name: 'email:sent', data: { to: 'bob@example.com', template: 'welcome' } }
      ]);
    });

    it('should assert specific event was emitted', async () => {
      const capture = new EventCapture();

      capture.emit('success', { value: 42 });

      assertEventEmitted(capture.events, 'success', { value: 42 });
      
      // Should throw if not found
      try {
        assertEventEmitted(capture.events, 'failure');
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect((e as Error).message).toContain('Expected event "failure"');
      }
    });
  });

  describe('integration scenarios', () => {
    it('should test a complete workflow with mocked database', async () => {
      // Create mock database dependency
      const { createMockDep, spyOnDep } = createMockDeps();
      const mockDb = createMockDep('db', {
        query: async (_sql: string, _params: unknown[]): Promise<{ rows: unknown[] }> => ({
          rows: [
            { id: 1, name: 'Product A', price: 99.99, stock: 10 },
            { id: 2, name: 'Product B', price: 149.99, stock: 5 }
          ]
        }),
        insert: async (_table: string, _data: unknown): Promise<{ id: number }> => ({ id: 123 })
      });

      // Get spy on query method
      const querySpy = spyOnDep(mockDb, 'query');

      // Create test harness with manifest that uses the database
      const harness = createTestCapsKit({
        manifest: {
          name: 'inventory',
          actions: {
            listProducts: {
              handler: async (_input: ActionInput, ctx: ActionContext): Promise<unknown> => {
                const db = ctx.deps.db as Record<string, (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>;
                const result = await db.query('SELECT * FROM products', []);
                return result.rows;
              }
            },
            createProduct: {
              handler: async (input: ActionInput, ctx: ActionContext): Promise<{ id: number }> => {
                const db = ctx.deps.db as Record<string, (table: string, data: unknown) => Promise<{ id: number }>>;
                const result = await db.insert('products', input.body);
                ctx.emit('product:created', { id: result.id, name: input.body.name });
                return result;
              }
            }
          }
        },
        deps: {}
      });

      // Inject mock deps
      harness.deps.db = mockDb;

      // Test listing products
      const { result: products, events: listEvents } = await harness.capskit.call(
        'listProducts',
        {}
      ) as { result: unknown[]; events: ReturnType<typeof harness.capskit.getEvents> };

      expect(products).toHaveLength(2);
      expect((products[0] as { name: string }).name).toBe('Product A');
      expect(querySpy.called).toBe(true);
      expect(querySpy.callCount).toBe(1);

      // Test creating product
      const { result: newProduct, events: createEvents } = await harness.capskit.call(
        'createProduct',
        { name: 'New Product', price: 79.99 }
      ) as { result: { id: number }; events: ReturnType<typeof harness.capskit.getEvents> };

      expect(newProduct).toEqual({ id: 123 });
      assertEvents(createEvents, [
        { name: 'product:created', data: { id: 123, name: 'New Product' } }
      ]);
    });
  });

  describe('error scenarios', () => {
    it('should throw when action not found', async () => {
      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            existingAction: {
              handler: async (): Promise<string> => 'result'
            }
          }
        }
      });

      try {
        await harness.capskit.call('nonexistent', {});
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect((e as Error).message).toContain('Action "nonexistent" not found');
      }
    });

    it('should propagate handler errors', async () => {
      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            failingAction: {
              handler: async (): Promise<string> => {
                throw new Error('Handler failed intentionally');
              }
            }
          }
        }
      });

      try {
        await harness.capskit.call('failingAction', {});
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect((e as Error).message).toBe('Handler failed intentionally');
      }
    });

    it('should find action by name across multiple capsules with conflicting names', async () => {
      const harness = createTestCapsKit({
        manifest: [
          {
            name: 'users',
            actions: {
              get: {
                handler: async (): Promise<{ source: string; id: number }> => ({
                  source: 'users-capsule',
                  id: 1
                })
              }
            }
          },
          {
            name: 'orders',
            actions: {
              get: {
                handler: async (): Promise<{ source: string; orderId: number }> => ({
                  source: 'orders-capsule',
                  orderId: 100
                })
              }
            }
          }
        ]
      });

      // When there are multiple capsules with the same action name,
      // it should find the first match
      const { result } = await harness.capskit.call('get', {});

      // The first manifest (users) has priority when action name is ambiguous
      expect((result as { source: string }).source).toBe('users-capsule');

      // But full capsule.action should find the specific one
      const ordersResult = await harness.capskit.call('orders.get', {});
      expect((ordersResult.result as { source: string }).source).toBe('orders-capsule');
    });

    it('should handle events emitted before action lookup error', async () => {
      // This tests that event capture still works even if an error occurs
      const harness = createTestCapsKit({
        manifest: {
          name: 'test',
          actions: {
            emitAndFail: {
              handler: async (_input: ActionInput, ctx: ActionContext): Promise<string> => {
                ctx.emit('before-error', { step: 1 });
                throw new Error('Expected failure');
              }
            }
          }
        }
      });

      try {
        await harness.capskit.call('emitAndFail', {});
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect((e as Error).message).toBe('Expected failure');
      }

      // Events emitted before the error should still be captured
      const events = harness.capskit.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('before-error');
    });
  });
});
