import { ActionHandler } from '../../../../types';
import { createElysiaRouter } from '../adapters/elysia';

export const buildRouter: ActionHandler = async (payload, context) => {
  const { adapter = 'elysia', traitHandlers = {} } = payload?.body || payload || {};
  const capskit = context.deps.capskit;
  
  if (adapter === 'elysia') {
    const app = createElysiaRouter(capskit, traitHandlers);
    return { router: app };
  }

  throw new Error(`Unsupported HTTP adapter: ${adapter}`);
};
