import { CapsKitPlatform } from '../../caps/platform.cap';
import { CapInput } from '../../types/cap-input.type';
import { buildContext } from '../build-context.helper';
import { executeCap } from '../execute-cap.helper';
import { ValidationError, AuthorizationError } from '../../errors';

export function createRouter(platform: CapsKitPlatform): { handle: (request: Request) => Promise<Response> } {
  return {
    handle: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      let matchedCapPath: string | null = null;

      for (const [capPath, capFile] of platform.state.caps) {
        const routes = capFile.meta.routes;
        if (routes) {
          for (const route of routes) {
            const pathMatch = route.path === url.pathname;
            const methodMatch = route.method === request.method;
            if (pathMatch && methodMatch) {
              matchedCapPath = capPath;
              break;
            }
          }
        }
        if (matchedCapPath) break;
      }

      if (!matchedCapPath) {
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length === 2) {
          const capPath = `${pathParts[0]}.${pathParts[1]}`;
          if (platform.state.caps.has(capPath)) {
            matchedCapPath = capPath;
          }
        }
      }

      if (!matchedCapPath) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }

      try {
        let body: Record<string, unknown> = {};
        if (request.body) {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            body = await request.json();
          }
        }

        const input: CapInput = {
          body,
          params: {},
          query: Object.fromEntries(url.searchParams),
        };

        const ctx = buildContext(platform.state);
        const result = await executeCap(matchedCapPath, input, ctx);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400 });
        }
        if (error instanceof AuthorizationError) {
          return new Response(JSON.stringify({ error: error.message }), { status: 403 });
        }
        if (error instanceof Error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
      }
    },
  };
}