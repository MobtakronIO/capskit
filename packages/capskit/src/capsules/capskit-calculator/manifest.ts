import { CapsuleManifest } from '../../types';
import { sum } from './src/actions/sum';

export const service: CapsuleManifest = {
  name: 'capskit-calculator',
  actions: {
    sum: {
      handler: sum,
      description: 'Sums two numbers provided in the payload',
      pre: [
        async (payload) => {
          console.log(`[capskit-calculator] 🔹 Pre-hook triggered for payload:`, payload);
        }
      ],
      post: [
        async (payload, result) => {
          console.log(`[capskit-calculator] 🔸 Post-hook triggered. Calculated result:`, result);
        }
      ]
    }
  },
  routes: [
    {
      method: 'POST',
      path: '/calculate/sum',
      action: 'sum',
      traits: {
        auth: 'admin'
      }
    }
  ],
   events: {
     publishes: ['capskit-calculator.sum']
   }
};
