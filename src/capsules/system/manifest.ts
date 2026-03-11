import { CapsuleManifest } from '../../types';
import { getHealth } from './src/actions/getHealth';
import { listCapsules } from './src/actions/listCapsules';
import { metrics } from './src/actions/metrics';
import { audit } from './src/actions/audit';

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
    },
    audit: {
      handler: audit,
      description: 'Global audit logger listener'
    }
  },
  events: {
    subscribes: [
      { event: 'calculator.calculated', action: 'audit' }
    ]
  }
};
