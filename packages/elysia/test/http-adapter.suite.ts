// @ts-nocheck

/**
 * HTTP Adapter tests - error mapping
 * Covers: FrameworkError mapping to HTTP status codes
 */

export async function runHttpAdapterTests() {
  console.log('\n=== HTTP Adapter Tests ===');

  // Import needed modules
  const { createCapsKit } = await import('../../capskit/src/capsule/kernel/create-capskit');
  const { ValidationError, NotFoundError, DependencyError, AuthorizationError } = await import('../../capskit/src/capsule/kernel/errors');
  const path = await import('node:path');

  const capsKitSrcDir = path.resolve(__dirname, '..', '..', 'src', 'capsules');
  const httpCapsuleSource = { type: 'directory' as const, path: path.join(capsKitSrcDir, 'http') };

  console.log('Test: adapter maps ValidationError to 400');
  const config1: any = {
    capsules: [
      httpCapsuleSource,
      {
        type: 'manifest',
        manifest: {
          name: 'test',
          actions: {
            bad: {
              handler: async () => { throw new ValidationError('bad input'); },
              schema: { type: 'object', required: ['x'] }
            }
          },
          routes: [
            { method: 'POST', path: '/test/bad', action: 'bad' }
          ]
        } as any
      }
    ],
    boot: {
      action: 'http.buildRouter',
      payload: { adapter: 'elysia' }
    }
  };

  const { router: router1 } = await createCapsKit(config1);
  const request1 = new Request('http://localhost/test/bad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const response1 = await router1.handle(request1);
  if (response1.status !== 400) {
    throw new Error(`expected 400, got ${response1.status}`);
  }
  console.log('✅ ValidationError mapped to 400');

  console.log('Test: adapter maps NotFoundError to 404');
  const config2: any = {
    capsules: [
      httpCapsuleSource,
      {
        type: 'manifest',
        manifest: {
          name: 'test2',
          actions: {
            exists: {
              handler: async () => ({ result: 'ok' })
            }
          },
          routes: [
            { method: 'POST', path: '/test2/exists', action: 'exists' },
            { method: 'POST', path: '/test2/missing', action: 'missing' }
          ]
        } as any
      }
    ],
    boot: {
      action: 'http.buildRouter',
      payload: { adapter: 'elysia' }
    }
  };

  const { router: router2 } = await createCapsKit(config2);
  const request2 = new Request('http://localhost/test2/missing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const response2 = await router2.handle(request2);
  if (response2.status !== 404) {
    throw new Error(`expected 404, got ${response2.status}`);
  }
  console.log('✅ NotFoundError mapped to 404');

  console.log('Test: adapter maps AuthorizationError to 403');
  const config3: any = {
    capsules: [
      httpCapsuleSource,
      {
        type: 'manifest',
        manifest: {
          name: 'test3',
          actions: {
            deny: {
              handler: async () => { throw new AuthorizationError('denied'); }
            }
          },
          routes: [
            { method: 'POST', path: '/test3/deny', action: 'deny' }
          ]
        } as any
      }
    ],
    boot: {
      action: 'http.buildRouter',
      payload: { adapter: 'elysia' }
    }
  };

  const { router: router3 } = await createCapsKit(config3);
  const request3 = new Request('http://localhost/test3/deny', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const response3 = await router3.handle(request3);
  if (response3.status !== 403) {
    throw new Error(`expected 403, got ${response3.status}`);
  }
  console.log('✅ AuthorizationError mapped to 403');

  console.log('Test: adapter returns 500 for unknown errors');
  const config4: any = {
    capsules: [
      httpCapsuleSource,
      {
        type: 'manifest',
        manifest: {
          name: 'test4',
          actions: {
            crash: {
              handler: async () => { throw new Error('unexpected'); }
            }
          },
          routes: [
            { method: 'POST', path: '/test4/crash', action: 'crash' }
          ]
        } as any
      }
    ],
    boot: {
      action: 'http.buildRouter',
      payload: { adapter: 'elysia' }
    }
  };

  const { router: router4 } = await createCapsKit(config4);
  const request4 = new Request('http://localhost/test4/crash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const response4 = await router4.handle(request4);
  if (response4.status !== 500) {
    throw new Error(`expected 500, got ${response4.status}`);
  }
  console.log('✅ unknown errors map to 500');

  console.log('=== All HTTP Adapter Tests Passed ===');
}
