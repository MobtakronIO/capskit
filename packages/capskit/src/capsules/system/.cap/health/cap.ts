import { ActionInput, CapContext } from '../../../../types';

/**
 * Cap: health — Returns the health status of the platform.
 *
 * Actions:
 * - getHealth
 */
export default class HealthCap {
  [action: string]: any;

  async getHealth(_input: ActionInput, _ctx: CapContext): Promise<{
    status: string;
    uptime: number;
    timestamp: number;
    version: string;
  }> {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: '0.0.0',
    };
  }
}
