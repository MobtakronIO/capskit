import { CapMeta } from '../../../../types';

/**
 * Metadata for the metrics cap.
 */
export const meta: CapMeta = {
  name: 'metrics',
  routes: [
    {
      method: 'GET',
      path: '/metrics',
      action: 'metrics',
    },
  ],
};
