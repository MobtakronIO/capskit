import { ActionHandler } from '../../../../types';

export const metrics: ActionHandler = async () => {
  return {
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: Date.now()
  };
};
