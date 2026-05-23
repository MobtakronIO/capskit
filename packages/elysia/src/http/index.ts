import { Elysia } from 'elysia';
import type { ICapsKit, CapsuleManifest, RouteManifest } from '@mobtakronio/capskit';
import { mapToHttpResponse } from '../shared';
import type { HttpOptions, CorsOptions } from '../shared';

export { HttpOptions, CorsOptions };

export interface HttpAdapterOptions extends HttpOptions {
  /**
   * @deprecated Use hook caps instead. Trait handlers are legacy adapter-level middleware.
   * Hooks are now handled by the kernel via meta.hooks and capsuleDef.hooks.
   * This field will be removed in a future version.
   */
  traitHandlers?: Record<string, TraitHandler>;
}

/**
 * @deprecated Use hook caps instead. See docs/guide/hooks.md
 */
type TraitHandler = (traitValue: unknown, context: unknown) => void | Promise<void>;

const DEFAULT_CORS: CorsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

/**
 * Check if a route has legacy traits attached (backward compat).
 */
function routeHasTraits(route: RouteManifest): boolean {
  return !!(route as any).traits && typeof (route as any).traits === 'object';
}

async function applyCors(app: Elysia, corsOption: boolean | CorsOptions): Promise<boolean> {
  if (corsOption === false) return false;
  try {
    const { cors: corsPlugin } = await import('@elysia/cors');
    const config: CorsOptions = corsOption === true ? DEFAULT_CORS : { ...DEFAULT_CORS, ...corsOption };
    app.use(corsPlugin(config as any));
    const origins = config.origin === true ? '*' : Array.isArray(config.origin) ? config.origin.join(', ') : config.origin;
    console.log(`[capskit-elysia] CORS enabled — origin: ${origins}`);
    return true;
  } catch (err) {
    console.warn('[capskit-elysia] @elysia/cors is not installed. CORS will not be enabled. Install it with: npm install @elysia/cors');
    return false;
  }
}

export async function createRouter(capskit: ICapsKit, options: HttpAdapterOptions = {}) {
  const { cors } = options;
  const traitHandlers = options.traitHandlers;

  // Warn if legacy trait handlers are provided
  if (Object.keys(traitHandlers || {}).length > 0) {
    console.warn(
      '[capskit-elysia] traitHandlers is deprecated. Use hook caps instead. ' +
      'See docs/guide/hooks.md. Trait handlers will continue to work for backward compatibility.'
    );
  }

  const app = new Elysia();

  if (cors) {
    await applyCors(app, cors);
  }

  const manifests: CapsuleManifest[] = capskit.getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach((route: RouteManifest) => {
        const path = route.path;

        let hooks: Record<string, unknown> = {};
        if (traitHandlers && routeHasTraits(route)) {
          const traits = (route as any).traits;
          hooks.beforeHandle = [];
          for (const [traitName, traitValue] of Object.entries(traits)) {
            if (traitHandlers[traitName]) {
              const wrappedTrait = async (c: any) => {
                try {
                  await traitHandlers[traitName](traitValue, c);
                } catch (error: any) {
                  return mapToHttpResponse(error, c.set);
                }
              };
              (hooks.beforeHandle as unknown[]).push(wrappedTrait);
            } else {
              console.warn(`[HTTP Elysia] No handler provided for trait "${traitName}" on route ${route.method} ${path}`);
            }
          }
        }

        const handler = async ({ body, params, query, set }: any) => {
          try {
            return await capskit.call(route.cap, {
              body,
              params,
              query
            });
          } catch (error: any) {
            return mapToHttpResponse(error, set);
          }
        };

        switch (route.method) {
          case 'GET': app.get(path, handler, hooks as any); break;
          case 'POST': app.post(path, handler, hooks as any); break;
          case 'PUT': app.put(path, handler, hooks as any); break;
          case 'DELETE': app.delete(path, handler, hooks as any); break;
          case 'PATCH': app.patch(path, handler, hooks as any); break;
        }
      });
    }
  });

  // ── Generic API endpoints for client SDK ──────────────────────

  // POST /api/call — generic RPC call
  app.post('/api/call', async ({ body, set }: any) => {
    try {
      const { actionPath, payload } = body as { actionPath: string; payload?: unknown };
      if (!actionPath) {
        set.status = 400;
        return { ok: false, error: 'actionPath is required' };
      }
      const start = Date.now();
      const result = await capskit.call(actionPath, payload);
      return { ok: true, result, durationMs: Date.now() - start };
    } catch (error: any) {
      return mapToHttpResponse(error, set) ?? { ok: false, error: error?.message ?? 'Unknown error' };
    }
  });

  // POST /api/capskit/rpc — RPC for call/emit
  app.post('/api/capskit/rpc', async ({ body, set }: any) => {
    try {
      const { method, ...params } = body as { method: string; [key: string]: unknown };
      if (!method) {
        set.status = 400;
        return { ok: false, error: 'method is required' };
      }

      switch (method) {
        case 'call': {
          const { actionPath, payload } = params as { actionPath: string; payload?: unknown };
          if (!actionPath) {
            set.status = 400;
            return { ok: false, error: 'actionPath is required' };
          }
          const start = Date.now();
          const result = await capskit.call(actionPath, payload);
          return { ok: true, result, durationMs: Date.now() - start };
        }
        case 'emit': {
          const { event, data } = params as { event: string; data?: unknown };
          if (!event) {
            set.status = 400;
            return { ok: false, error: 'event is required' };
          }
          if (typeof (capskit as any).emit === 'function') {
            await (capskit as any).emit(event, data);
            return { ok: true, result: { emitted: true, event } };
          }
          return { ok: false, error: 'emit not supported' };
        }
        default:
          set.status = 400;
          return { ok: false, error: `Unknown method: ${method}` };
      }
    } catch (error: any) {
      return mapToHttpResponse(error, set) ?? { ok: false, error: error?.message ?? 'Unknown error' };
    }
  });

  // GET /api/capskit/describe — return all capsule manifests
  app.get('/api/capskit/describe', async ({ set }: any) => {
    try {
      const manifests = capskit.getManifests();
      return {
        ok: true,
        result: {
          capsules: manifests,
        },
      };
    } catch (error: any) {
      return mapToHttpResponse(error, set) ?? { ok: false, error: error?.message ?? 'Unknown error' };
    }
  });

  return app;
}

export default createRouter;
