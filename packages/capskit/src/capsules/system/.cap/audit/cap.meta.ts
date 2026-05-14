import { CapMeta } from '../../../../types';

/**
 * Metadata for the audit cap.
 *
 * Subscribes to calculator sum events for global audit logging.
 */
export const meta: CapMeta = {
  name: 'audit',
  events: {
    subscribes: [
      {
        event: 'capskit-calculator.sum',
        action: 'audit',
      },
    ],
  },
};
