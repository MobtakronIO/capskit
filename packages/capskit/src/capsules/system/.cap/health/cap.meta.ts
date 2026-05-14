import { CapMeta } from '../../../../types';

/**
 * Metadata for the health cap.
 */
export const meta: CapMeta = {
  name: 'health',
  routes: [
    {
      method: 'GET',
      path: '/health',
      action: 'getHealth',
    },
  ],
};
