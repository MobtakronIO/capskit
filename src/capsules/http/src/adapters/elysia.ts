import { Elysia } from 'elysia';
import { ICapsKit, CapsuleManifest, ActionInput } from '../../../../types';
import { RouteDefinition } from '../types';
import { FrameworkError } from '../../../../kernel/errors';
import { mapToHttpResponse } from '../../../../kernel/error-mapping';

export function createElysiaRouter(capskit: ICapsKit, traitHandlers: Record<string, Function> = {}) {
  const app = new Elysia();

  const manifests: CapsuleManifest[] = capskit.getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach((route: RouteDefinition) => {
        const path = route.path;
        
        let hooks: any = {};
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
              hooks.beforeHandle.push(wrappedTrait);
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
