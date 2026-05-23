import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'getHealth',
  routes: [{ method: 'GET', path: '/health', cap: 'getHealth', action: 'getHealth' }],
};

export default async function getHealth(input: CapInput, ctx: CapContext) {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now(),
    version: '0.0.0',
  };
}
