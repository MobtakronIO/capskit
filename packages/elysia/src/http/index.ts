import { Elysia } from 'elysia';
import type { ICapsKit, CapsuleManifest, RouteManifest } from '@mobtakronio/capskit';
import { mapToHttpResponse } from '../shared';
import type { HttpOptions, TraitHandler, CorsOptions } from '../shared';

export { HttpOptions, CorsOptions };

export interface HttpAdapterOptions extends HttpOptions {
  traitHandlers?: Record<string, TraitHandler>;
}

const DEFAULT_CORS: CorsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

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
  const { traitHandlers = {}, cors } = options;
  const app = new Elysia();

  if (cors) {
    await applyCors(app, cors);
  }

  const manifests: CapsuleManifest[] = capskit.getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach((route: RouteManifest & { traits?: Record<string, unknown> }) => {
        const path = route.path;
        
        let hooks: Record<string, unknown> = {};
        if (route.traits) {
          hooks.beforeHandle = [];
          for (const [traitName, traitValue] of Object.entries(route.traits)) {
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

  // POST /api/capskit/rpc — RPC for call/emit/tell
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
        case 'tell': {
          const { actionPath, payload } = params as { actionPath: string; payload?: unknown };
          if (!actionPath) {
            set.status = 400;
            return { ok: false, error: 'actionPath is required' };
          }
          if (typeof (capskit as any).tell === 'function') {
            (capskit as any).tell(actionPath, payload);
            return { ok: true, result: { told: true, actionPath } };
          }
          return { ok: false, error: 'tell not supported' };
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
          capsules: manifests.map(m => ({
            name: m.name,
            caps: (m.caps || []).map(c => ({
              name: c.name,
              kind: c.kind,
              capPath: c.capPath,
              actionPath: c.actionPath,
              description: c.description,
            })),
            routes: m.routes || [],
          })),
        },
      };
    } catch (error: any) {
      return mapToHttpResponse(error, set) ?? { ok: false, error: error?.message ?? 'Unknown error' };
    }
  });

  return app;
}

export default createRouter;
