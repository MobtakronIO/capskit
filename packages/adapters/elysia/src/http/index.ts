import { Elysia } from 'elysia';
import type { ICapsKit, CapsuleManifest, RouteDefinition } from '@mobtakronio/capskit';
import { mapToHttpResponse } from '../shared';
import type { HttpOptions, TraitHandler } from '../shared';

export { HttpOptions };

export interface HttpAdapterOptions extends HttpOptions {
  traitHandlers?: Record<string, TraitHandler>;
}

export function createRouter(capskit: ICapsKit, options: HttpAdapterOptions = {}) {
  const { traitHandlers = {} } = options;
  const app = new Elysia();

  const manifests: CapsuleManifest[] = capskit.getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach((route: RouteDefinition & { traits?: Record<string, unknown> }) => {
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
            return await capskit.call(`${manifest.name}.${route.action}`, {
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
