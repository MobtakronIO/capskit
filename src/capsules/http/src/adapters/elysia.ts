import { Elysia } from 'elysia';
import { ICapsKit, CapsuleManifest } from '../../../../types';
import { RouteDefinition } from '../types';

export function createElysiaRouter(capskit: ICapsKit, traitHandlers: Record<string, Function> = {}) {
  const app = new Elysia();

  // @ts-ignore - Accessing internal manifests for registration
  const manifests: CapsuleManifest[] = (capskit as any).getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach((route: RouteDefinition) => {
        const path = route.path;
        
        let hooks: any = {};
        if (route.traits) {
          hooks.beforeHandle = [];
          for (const [traitName, traitValue] of Object.entries(route.traits)) {
            if (traitHandlers[traitName]) {
              hooks.beforeHandle.push((c: any) => traitHandlers[traitName](traitValue, c));
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
            set.status = 500;
            return { error: error.message };
          }
        };

        switch (route.method) {
          case 'GET': app.get(path, handler, hooks); break;
          case 'POST': app.post(path, handler, hooks); break;
          case 'PUT': app.put(path, handler, hooks); break;
          case 'DELETE': app.delete(path, handler, hooks); break;
          case 'PATCH': app.patch(path, handler, hooks); break;
        }
      });
    }
  });

  return app;
}
