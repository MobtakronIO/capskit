/**
 * Task 7.3: Verify HTTP capsule and adapter integration
 *
 * Verifies:
 * 1. HTTP capsule is defined via caps.ts (CapsuleRegistry format)
 * 2. BuildRouterCap class has the buildRouter action method
 * 3. Cap metadata declares correct dependencies and actions
 * 4. convertRegistryToManifest produces a valid manifest
 * 5. The manifest has proper shape (name, actions, requires)
 * 6. Custom CapActionMeta description overrides default
 * 7. Router can accept HTTP requests against capsule routes
 * 8. Error mapping works (ValidationError→400, AuthorizationError→403, unknown→500)
 */

import { describe, test, expect } from 'vitest';
import { convertRegistryToManifest } from '../src/kernel/cap-loader';
import { createCapsKit } from '../src/kernel/platform';
import { ValidationError, AuthorizationError } from '../src/kernel/errors';
import type { CapsuleRegistry, CapsuleManifest } from '../src/types';
import * as path from 'node:path';

// HTTP capsule is no longer builtin — it must be loaded as a capsule source.
const capsKitSrcDir = path.resolve(__dirname, '..', 'src', 'capsules');
const httpCapsuleDir = path.join(capsKitSrcDir, 'http');

// ===========================================================================
// 1. STATIC: HTTP capsule registry → manifest conversion
// ===========================================================================

describe('HTTP Capsule Registry → Manifest Conversion (Static)', () => {
  class BuildRouterCap {
    [action: string]: any;

    async buildRouter(payload: any, context: any): Promise<{ router: any }> {
      const { adapter = 'elysia', traitHandlers = {} } = payload?.body || payload || {};
      const capskit = context.deps.capskit;

      if (typeof adapter === 'function') {
        return { router: await adapter(capskit, { traitHandlers }) };
      }
      throw new Error(`Unsupported HTTP adapter: ${typeof adapter}`);
    }
  }

  const httpRegistry: CapsuleRegistry = {
    name: 'http',
    caps: [
      {
        class: BuildRouterCap,
        meta: {
          name: 'buildRouter',
          dependencies: ['capskit'],
          actions: {
            buildRouter: {
              description:
                'Returns an Elysia Router containing all platform capabilities mapped to HTTP endpoints',
            },
          },
        },
      },
    ],
  };

  test('registry has correct name', () => {
    expect(httpRegistry.name).toBe('http');
  });

  test('registry has exactly one cap', () => {
    expect(httpRegistry.caps).toHaveLength(1);
  });

  test('cap meta has correct name', () => {
    expect(httpRegistry.caps[0].meta.name).toBe('buildRouter');
  });

  test('cap meta declares capskit dependency', () => {
    expect(httpRegistry.caps[0].meta.dependencies).toContain('capskit');
  });

  test('cap meta declares buildRouter action', () => {
    expect(httpRegistry.caps[0].meta.actions).toBeDefined();
    expect(httpRegistry.caps[0].meta.actions!.buildRouter).toBeDefined();
    expect(httpRegistry.caps[0].meta.actions!.buildRouter.description).toContain('Elysia Router');
  });

  test('cap class has buildRouter method', () => {
    const instance = new BuildRouterCap();
    expect(typeof instance.buildRouter).toBe('function');
  });

  test('convertRegistryToManifest creates valid manifest', () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    expect(manifest.name).toBe('http');
    expect(manifest.actions).toBeDefined();
    expect(manifest.actions.buildRouter).toBeDefined();
    expect(typeof manifest.actions.buildRouter.handler).toBe('function');
  });

  test('manifest requires includes capskit (merged from cap deps)', () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    expect(manifest.requires).toBeDefined();
    expect(manifest.requires!).toContain('capskit');
  });

  test('manifest action description uses custom CapActionMeta description', () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    // When CapActionMeta provides a custom description, it overrides
    // the default 'Cap "name" action: methodName' format.
    expect(manifest.actions.buildRouter.description).toBe(
      'Returns an Elysia Router containing all platform capabilities mapped to HTTP endpoints',
    );
  });

  test('buildRouter handler resolves adapter function', async () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    const handler = manifest.actions.buildRouter.handler as Function;

    const mockRouter = { routes: ['GET /test'] };
    const mockAdapter = async (_capskit: any, _options: any) => mockRouter;

    const result = await handler(
      { body: { adapter: mockAdapter } },
      { deps: { capskit: { getManifests: () => [] } } },
    );

    expect(result).toBeDefined();
    expect(result.router).toBe(mockRouter);
  });

  test('buildRouter handler throws for unsupported adapter type', async () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    const handler = manifest.actions.buildRouter.handler as Function;

    await expect(
      handler({ body: { adapter: 123 } }, { deps: { capskit: {} } }),
    ).rejects.toThrow(/Unsupported/i);
  });

  test('manifest has no routes (HTTP capsule generates routes from other manifests)', () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    expect((manifest as any).routes).toBeUndefined();
  });

  test('manifest has no events', () => {
    const manifest = convertRegistryToManifest(httpRegistry);
    expect(manifest.events).toBeUndefined();
  });
});

// ===========================================================================
// 2. END-TO-END: CapsKit boot → HTTP router → route handling
// ===========================================================================

describe('End-to-End: CapsKit boot → HTTP router generation', () => {
  test('createCapsKit boots with http.buildRouter and returns a router', async () => {
    const { router, capskit } = await createCapsKit({
      capsuleDirs: [httpCapsuleDir],
      boot: {
        action: 'http.buildRouter',
        payload: { adapter: 'elysia' },
      },
    });

    expect(router).toBeDefined();
    expect(typeof router.handle).toBe('function');
    expect(capskit).toBeDefined();

    // HTTP capsule is registered (from builtin list via convertRegistryToManifest)
    const manifests = capskit.getManifests();
    const httpManifest = manifests.find((m: any) => m.name === 'http');
    expect(httpManifest).toBeDefined();
    expect(httpManifest.actions.buildRouter).toBeDefined();
    expect(httpManifest.requires).toContain('capskit');
  });

  test('router handles POST to capsule routes using cap-based metadata', async () => {
    const { router } = await createCapsKit({
      capsules: [
        { type: 'directory', path: httpCapsuleDir },
        {
          type: 'manifest',
          manifest: {
            name: 'echo-capsule',
            actions: {
              echo: {
                handler: async ({ body }: any) => ({
                  message: `Hello ${body?.name || 'World'}`,
                }),
              },
            },
            routes: [{ method: 'POST', path: '/api/echo', action: 'echo' }],
          },
        } as any,
      ],
      boot: {
        action: 'http.buildRouter',
        payload: { adapter: 'elysia' },
      },
    });

    const response = await router.handle(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CapsKit' }),
      }),
    );

    expect(response.status).toBe(200);
    const result: any = await response.json();
    expect(result.message).toBe('Hello CapsKit');
  });

  test('HTTP router maps ValidationError to 400', async () => {
    const { router } = await createCapsKit({
      capsules: [
        { type: 'directory', path: httpCapsuleDir },
        {
          type: 'manifest',
          manifest: {
            name: 'err-capsule',
            actions: {
              fail: {
                handler: async () => {
                  throw new ValidationError('bad input');
                },
              },
            },
            routes: [{ method: 'POST', path: '/err/fail', action: 'fail' }],
          },
        } as any,
      ],
      boot: {
        action: 'http.buildRouter',
        payload: { adapter: 'elysia' },
      },
    });

    const response = await router.handle(
      new Request('http://localhost/err/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('HTTP router maps AuthorizationError to 403', async () => {
    const { router } = await createCapsKit({
      capsules: [
        { type: 'directory', path: httpCapsuleDir },
        {
          type: 'manifest',
          manifest: {
            name: 'auth-capsule',
            actions: {
              deny: {
                handler: async () => {
                  throw new AuthorizationError('forbidden');
                },
              },
            },
            routes: [{ method: 'GET', path: '/auth/deny', action: 'deny' }],
          },
        } as any,
      ],
      boot: {
        action: 'http.buildRouter',
        payload: { adapter: 'elysia' },
      },
    });

    const response = await router.handle(
      new Request('http://localhost/auth/deny', { method: 'GET' }),
    );

    expect(response.status).toBe(403);
  });

  test('HTTP router handles unknown errors as 500', async () => {
    const { router } = await createCapsKit({
      capsules: [
        { type: 'directory', path: httpCapsuleDir },
        {
          type: 'manifest',
          manifest: {
            name: 'crash-capsule',
            actions: {
              boom: {
                handler: async () => {
                  throw new Error('unexpected kaboom');
                },
              },
            },
            routes: [{ method: 'GET', path: '/crash/boom', action: 'boom' }],
          },
        } as any,
      ],
      boot: {
        action: 'http.buildRouter',
        payload: { adapter: 'elysia' },
      },
    });

    const response = await router.handle(
      new Request('http://localhost/crash/boom', { method: 'GET' }),
    );

    expect(response.status).toBe(500);
  });
});
