import { CapMeta } from '../../../../types';

/**
 * Metadata for the lister cap.
 */
export const meta: CapMeta = {
  name: 'lister',
  routes: [
    {
      method: 'GET',
      path: '/capsules',
      action: 'listCapsules',
    },
  ],
};
