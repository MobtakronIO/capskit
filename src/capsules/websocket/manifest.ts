import { CapsuleManifest } from '../../types';
import { buildSocket } from './src/actions/buildSocket';

export const service: CapsuleManifest = {
  name: 'websocket',
  requires: ['capskit'],
  actions: {
    buildSocket: {
      handler: buildSocket,
      description: 'Returns a WebSocket configuration for Elysia containing all platform capabilities mapped to WebSockets'
    }
  }
};
