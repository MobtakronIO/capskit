import { CapsuleManifest } from '../../types';
import { buildRouter } from './src/actions/buildRouter';

export const service: CapsuleManifest = {
  name: 'http',
  requires: ['capskit'],
  actions: {
    buildRouter: {
      handler: buildRouter,
      description: 'Returns an Elysia Router containing all platform capabilities mapped to HTTP'
    }
  }
};
