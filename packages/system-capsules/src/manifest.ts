import { CapsuleManifest } from '@capskit/types';
import { getHealth } from './actions/getHealth';
import { listCapsules } from './actions/listCapsules';
import { metrics } from './actions/metrics';

export const manifest: CapsuleManifest = {
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
