import { CapMeta } from '../../../../types';

/**
 * Metadata for the calculator cap.
 *
 * Sums two numbers (a, b) and returns the result. Publishes a
 * `capskit-calculator.sum` event after each successful computation.
 */
export const meta: CapMeta = {
  name: 'calculator',
  actions: {
    sum: {
      description: 'Sums two numbers (a, b) and returns the result',
    },
  },
  routes: [
    {
      method: 'POST',
      path: '/calculate/sum',
      action: 'sum',
      traits: { auth: 'admin' },
    },
  ],
  events: {
    publishes: ['capskit-calculator.sum'],
  },
};
