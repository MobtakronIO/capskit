import { ActionInput, CapContext } from '../../../../types';

/**
 * Cap: metrics — Returns platform performance metrics.
 *
 * Actions:
 * - metrics
 */
export default class MetricsCap {
  [action: string]: any;

  async metrics(_input: ActionInput, _ctx: CapContext): Promise<{
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    timestamp: number;
  }> {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: Date.now(),
    };
  }
}
