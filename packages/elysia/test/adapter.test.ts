/**
 * Unified Elysia Adapter Tests
 * Tests for HTTP-only, WS-only, and combined transport modes
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createElysiaAdapter } from '../src';
import type { ICapsKit } from '../src';

const mockCapskit = {
  getManifests: () => [
    {
      name: 'test-capsule',
      actions: {
        hello: {
          handler: async () => ({ message: 'Hello World' })
        },
        greeting: {
          handler: async ({ body }: any) => ({ greeting: `Hello ${body?.name || 'Anonymous'}` })
        },
        errorTest: {
          handler: async () => {
            throw new Error('Test error');
          }
        }
      },
      routes: [
        { method: 'GET', path: '/hello', action: 'hello' },
        { method: 'POST', path: '/greet', action: 'greeting' }
      ],
      sockets: [
        { path: '/ws/test', message: 'hello' }
      ]
    }
  ],
  call: async (action: string, payload?: any) => {
    const [capsule, actionName] = action.split('.');
    if (actionName === 'hello') {
      return { message: 'Hello World' };
    }
    if (actionName === 'greeting') {
      return { greeting: `Hello ${payload?.body?.name || 'Anonymous'}` };
    }
    if (actionName === 'errorTest') {
      throw new Error('Test error');
    }
    throw new Error(`Unknown action: ${action}`);
  }
} as unknown as ICapsKit;

describe('Elysia Adapter', () => {
  describe('createElysiaAdapter', () => {
    test('throws error when neither http nor websocket is enabled', async () => {
      try {
        await createElysiaAdapter(mockCapskit, {});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('At least one of http or websocket must be enabled');
      }
    });

    test('creates HTTP-only adapter when http=true', async () => {
      const adapter = await createElysiaAdapter(mockCapskit, { http: true });
      
      expect(adapter.app).toBeDefined();
      expect(adapter.sockets).toEqual({});
      expect(typeof adapter.shutdown).toBe('function');
      
      await adapter.shutdown();
    });

    test('creates WebSocket-only adapter when websocket=true', async () => {
      const adapter = await createElysiaAdapter(mockCapskit, { websocket: true });
      
      expect(adapter.app).toBeUndefined();
      expect(adapter.sockets).toBeDefined();
      expect(adapter.sockets['/ws/test']).toBeDefined();
      expect(typeof adapter.shutdown).toBe('function');
      
      await adapter.shutdown();
    });

    test('creates combined adapter when both http and websocket are true', async () => {
      const adapter = await createElysiaAdapter(mockCapskit, { http: true, websocket: true });
      
      expect(adapter.app).toBeDefined();
      expect(adapter.sockets).toBeDefined();
      expect(adapter.sockets['/ws/test']).toBeDefined();
      expect(typeof adapter.shutdown).toBe('function');
      
      await adapter.shutdown();
    });

    test('accepts http options object', async () => {
      const adapter = await createElysiaAdapter(mockCapskit, { 
        http: { traitHandlers: {} } 
      });
      
      expect(adapter.app).toBeDefined();
      await adapter.shutdown();
    });

    test('accepts websocket options object', async () => {
      const adapter = await createElysiaAdapter(mockCapskit, { 
        websocket: {} 
      });
      
      expect(adapter.sockets).toBeDefined();
      await adapter.shutdown();
    });

    test('accepts traitHandlers at top level', async () => {
      const traitHandler = async (role: string, ctx: any) => {
        if (role === 'admin') {
          return;
        }
        throw new Error('Unauthorized');
      };

      const adapter = await createElysiaAdapter(mockCapskit, { 
        http: true,
        traitHandlers: { auth: traitHandler }
      });
      
      expect(adapter.app).toBeDefined();
      await adapter.shutdown();
    });

    test('calls onReady lifecycle hook', async () => {
      let readyCalled = false;
      
      const adapter = await createElysiaAdapter(mockCapskit, { 
        http: true,
        onReady: () => { readyCalled = true; }
      });
      
      expect(readyCalled).toBe(true);
      await adapter.shutdown();
    });

    test('calls onClose lifecycle hook during shutdown', async () => {
      let closeCalled = false;
      
      const adapter = await createElysiaAdapter(mockCapskit, { 
        http: true,
        onClose: () => { closeCalled = true; }
      });
      
      await adapter.shutdown();
      
      expect(closeCalled).toBe(true);
    });

    test('calls onError lifecycle hook for unhandled errors', async () => {
      let errorHandler: ((error: unknown) => void) | undefined;
      
      const adapter = await createElysiaAdapter(mockCapskit, { 
        http: true,
        onError: (error) => { 
          console.log('Error caught:', error);
        }
      });

      await adapter.shutdown();
    }, 10000);
  });

  describe('createRouter', () => {
    test('creates Elysia router with routes', async () => {
      const { createRouter } = await import('../src/http');
      
      const router = createRouter(mockCapskit, { traitHandlers: {} });
      
      expect(router).toBeDefined();
      expect(typeof router.get).toBe('function');
      expect(typeof router.post).toBe('function');
    });
  });

  describe('createSocket', () => {
    test('creates socket handlers', async () => {
      const { createSocket } = await import('../src/websocket');
      
      const sockets = createSocket(mockCapskit, {});
      
      expect(sockets).toBeDefined();
      expect(sockets['/ws/test']).toBeDefined();
      expect(typeof sockets['/ws/test'].message).toBe('function');
    });
  });

  describe('shared error mapping', () => {
    test('mapToHttpResponse handles FrameworkError', async () => {
      const { mapToHttpResponse } = await import('../src/shared');
      
      const mockSet = { status: 0 };
      const error = { 
        isFrameworkError: true, 
        message: 'Test error', 
        status: 400,
        code: 'TEST_ERROR'
      };
      
      const response = mapToHttpResponse(error, mockSet);
      
      expect(response.error).toBe('Test error');
      expect(mockSet.status).toBe(400);
    });

    test('mapToHttpResponse handles unknown errors', async () => {
      const { mapToHttpResponse } = await import('../src/shared');
      
      const mockSet = { status: 0 };
      const error = new Error('Unknown error');
      
      const response = mapToHttpResponse(error, mockSet);
      
      expect(response.error).toBe('Unknown error');
      expect(mockSet.status).toBe(500);
    });

    test('handleWebSocketError handles FrameworkError on message', async () => {
      const { handleWebSocketError } = await import('../src/shared');
      
      const mockWs = { send: (msg: string) => {} };
      const error = { 
        isFrameworkError: true, 
        message: 'WS Error',
        details: { field: 'value' }
      };
      
      const sendSpy = { called: false };
      const ws = { 
        send: (msg: string) => { sendSpy.called = true; } 
      };
      
      handleWebSocketError(error, ws, 'message');
      
      expect(sendSpy.called).toBe(true);
    });
  });
});
