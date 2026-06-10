import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';
import { KERNEL_VERSION } from '../../kernel/constants';
import { DependencyError } from '../../kernel/errors';

export const meta: CapMeta = {
  name: 'health',
  description: 'Health check with optional detailed system metrics',
  routes: [
    { method: 'GET', path: '/health', cap: 'health', action: 'health' },
    { method: 'GET', path: '/health/simple', cap: 'health', action: 'getHealth' },
  ],
  inputSchema: {
    type: 'object',
    properties: {
      detailed: { type: 'boolean', description: 'Include capsule count, cap count, and memory usage' },
    },
  },
};

export default async function health(input: CapInput, ctx: CapContext) {
  if (!ctx.deps.capsules || !ctx.deps.capsMap) {
    throw new DependencyError('Capsules and capsMap dependencies are required for health check');
  }
  const detailed = input.body?.detailed !== false;
  const capsules = ctx.deps.capsules;
  const caps = ctx.deps.capsMap;

  const base = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: KERNEL_VERSION,
  };

  if (!detailed) {
    return base;
  }

  return {
    ...base,
    capsuleCount: capsules.size,
    capCount: caps.size,
    memory: process.memoryUsage(),
  };
}
