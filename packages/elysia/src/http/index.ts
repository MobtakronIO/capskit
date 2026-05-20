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
    return true;
  } catch {
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

  return app;
}

export default createRouter;
