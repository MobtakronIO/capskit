import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';
import { KERNEL_VERSION } from '../../kernel/constants';

export const meta: CapMeta = {
  name: 'health',
  routes: [{ method: 'GET', path: '/health', cap: 'health', action: 'health' }],
};

export default async function health(input: CapInput, ctx: CapContext) {
  const capsules = ctx.deps.capsules;
  const caps = ctx.deps.capsMap;

  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: KERNEL_VERSION,
    capsuleCount: capsules.size,
    capCount: caps.size,
    memory: process.memoryUsage(),
  };
}
