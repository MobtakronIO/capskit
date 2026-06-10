import { Elysia } from 'elysia';
import type { ICapsKit, CapsuleManifest, RouteManifest } from '@mobtakronio/capskit';
import { mapToHttpResponse } from '../shared';
import type { HttpOptions, CorsOptions } from '../shared';

export { HttpOptions, CorsOptions };

export interface HttpAdapterOptions extends HttpOptions {}

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
  const { cors } = options;

  const app = new Elysia();

  if (cors) {
    await applyCors(app, cors);
  }

  const manifests: CapsuleManifest[] = capskit.getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach((route: RouteManifest) => {
        const path = route.path;

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
          case 'GET': app.get(path, handler); break;
          case 'POST': app.post(path, handler); break;
          case 'PUT': app.put(path, handler); break;
          case 'DELETE': app.delete(path, handler); break;
          case 'PATCH': app.patch(path, handler); break;
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
