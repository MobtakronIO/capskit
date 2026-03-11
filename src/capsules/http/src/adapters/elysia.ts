import { Elysia } from 'elysia';
import { ICapsKit, CapsuleManifest } from '../../../../types';

export function createElysiaRouter(capskit: ICapsKit, traitHandlers: Record<string, Function> = {}) {
  const app = new Elysia();

  // @ts-ignore - Accessing internal manifests for registration
  const manifests: CapsuleManifest[] = (capskit as any).getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach(route => {
        const handler = async ({ body, params, query, set }: { body: any, params: any, query: any, set: any }) => {
          try {
            const result = await capskit.call(`${manifest.name}.${route.action}`, {
              body,
              params,
              query
            });
            return result;
          } catch (error: any) {
            set.status = 500;
            return { error: error.message };
          }
        };

        const path = route.path;
        let config: any = {};
        if (route.traits) {
          const beforeHandle: any[] = [];
          for (const [traitName, traitValue] of Object.entries(route.traits)) {
            if (traitHandlers[traitName]) {
              beforeHandle.push(async (c: any) => traitHandlers[traitName](traitValue, c));
            } else {
              console.warn(`[HTTP Elysia] No handler provided for trait "${traitName}" on route ${route.method} ${path}`);
            }
          }
          if (beforeHandle.length > 0) {
            config.beforeHandle = beforeHandle;
          }
        }

        switch (route.method) {
          case 'GET': app.get(path, handler, config); break;
          case 'POST': app.post(path, handler, config); break;
          case 'PUT': app.put(path, handler, config); break;
          case 'DELETE': app.delete(path, handler, config); break;
          case 'PATCH': app.patch(path, handler, config); break;
        }
      });
    }
  });

  return app;
}
