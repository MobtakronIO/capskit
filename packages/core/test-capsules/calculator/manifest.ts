import { CapsuleManifest } from '@capskit/types';
import { sum } from './src/actions/sum';

export const service: CapsuleManifest = {
  name: 'calculator',
  actions: {
    sum: {
      handler: sum,
      description: 'Sums two numbers provided in the payload'
    }
  },
  routes: [
    {
      method: 'POST',
      path: '/calculate/sum',
      action: 'sum'
    }
  ]
};
