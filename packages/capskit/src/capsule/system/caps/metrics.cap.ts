import { CapInput, CapContext } from '../../kernel/types/cap-input.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

export const meta: CapMeta = {
  name: 'metrics',
  routes: [{ method: 'GET', path: '/metrics', cap: 'metrics', action: 'metrics' }],
};

export default async function metrics(input: CapInput, ctx: CapContext) {
  return {
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: Date.now(),
  };
}
