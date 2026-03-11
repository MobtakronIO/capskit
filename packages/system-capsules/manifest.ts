import { CapsuleManifest } from '@capskit/types';
import { getHealth } from './src/actions/getHealth';
import { listCapsules } from './src/actions/listCapsules';
import { metrics } from './src/actions/metrics';

export const service: CapsuleManifest = {
  name: 'system',
  actions: {
    getHealth: {
      handler: getHealth,
      description: 'Returns the health status of the platform'
    },
    listCapsules: {
      handler: listCapsules,
      description: 'Lists all registered capsules and their capabilities'
    },
    metrics: {
      handler: metrics,
      description: 'Returns platform performance metrics'
    }
  }
};
