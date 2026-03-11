import { ActionHandler } from '@capskit/types';
import { createRouter } from '../core/router';

let server: any = null;

export const listen: ActionHandler = async (payload, context) => {
  const { port = 3000 } = payload;
  const platform = context.deps.platform;

  if (server) {
    console.warn('[HTTP Gateway] Server is already running.');
    return { message: 'Server already running', port };
  }

  const app = createRouter(platform);
  server = app.listen(port);

  console.log(`[HTTP Gateway] Server started on port ${port}`);
  return { message: 'Server started', port };
};

export const stop: ActionHandler = async () => {
  if (server) {
    await server.stop();
    server = null;
    return { message: 'Server stopped' };
  }
  return { message: 'Server not running' };
};
