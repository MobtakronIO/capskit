import { Elysia } from 'elysia';
import { IPlatform, CapsuleManifest } from '@capskit/types';

export function createRouter(platform: IPlatform) {
  const app = new Elysia();

  // @ts-ignore - Accessing internal manifests for registration
  const manifests: CapsuleManifest[] = (platform as any).getManifests();

  manifests.forEach(manifest => {
    if (manifest.routes) {
      manifest.routes.forEach(route => {
        const handler = async ({ body, params, query, set }: { body: any, params: any, query: any, set: any }) => {
          try {
            const result = await platform.call(`${manifest.name}.${route.action}`, {
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

  return app;
}
