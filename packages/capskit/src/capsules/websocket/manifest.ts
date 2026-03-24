import { CapsuleManifest } from '../../types';
import { buildSocket } from './src/actions/buildSocket';

export const service: CapsuleManifest = {
  name: 'websocket',
  requires: ['capskit'],
  actions: {
    buildSocket: {
      handler: buildSocket,
      description: 'Returns a WebSocket configuration containing all platform capabilities mapped to WebSockets'
    }
  }
};
