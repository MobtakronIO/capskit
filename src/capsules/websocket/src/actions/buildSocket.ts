import { ActionHandler } from '../../../../types';
import { createElysiaSocket } from '../adapters/elysia';

export const buildSocket: ActionHandler = async (payload, context) => {
  const { adapter = 'elysia' } = payload?.body || payload || {};
  const capskit = context.deps.capskit;
  
  if (adapter === 'elysia') {
    const sockets = createElysiaSocket(capskit);
    return { sockets };
  }

  throw new Error(`Unsupported WebSocket adapter: ${adapter}`);
};
