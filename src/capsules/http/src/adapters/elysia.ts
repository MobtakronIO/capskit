import { Elysia } from 'elysia';
import { ICapsKit, CapsuleManifest } from '../../../../types';
import { RouteDefinition } from '../types';
import { FrameworkError } from '../../../../kernel/errors';

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
              // Wrap trait handler to properly map framework errors to HTTP responses
              const wrappedTrait = async (c: any) => {
                try {
                  await traitHandlers[traitName](traitValue, c);
                } catch (error: any) {
                  if (error instanceof FrameworkError && error.status) {
                    c.set.status = error.status;
                    // Throw formatted error to abort request
                    throw { error: error.message, ...(error.details && { details: error.details }) };
                  }
                  // Re-throw other errors to be caught by main handler (500)
                  throw error;
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
             // Map structured framework errors to appropriate HTTP status codes
             if (error instanceof FrameworkError && error.status) {
               set.status = error.status;
               return { error: error.message, ...(error.details && { details: error.details }) };
             }
             
             // Unexpected errors
             set.status = 500;
             return { 
               error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
               ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack } : {})
             };
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
