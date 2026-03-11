import { CapsuleManifest } from '../../types';
import { listen, stop } from './src/actions/server';

export const service: CapsuleManifest = {
  name: 'http-elysia',
  requires: ['platform'],
  actions: {
    listen: {
      handler: listen,
      description: 'Starts the HTTP Gateway server'
    },
    stop: {
      handler: stop,
      description: 'Stops the HTTP Gateway server'
    }
  }
};
