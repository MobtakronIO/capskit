import { ActionHandler } from '../../../../types';

export const getHealth: ActionHandler = async () => {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now(),
    version: '0.0.0'
  };
};
