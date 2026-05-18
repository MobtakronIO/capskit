import type { CapsuleRegistry, CapMeta } from '../../kernel/cap-loader';

class HealthCap {
  async getHealth(_payload: any, _context: any) {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: '0.0.0',
    };
  }
}

class ListerCap {
  async listCapsules(_payload: any, context: any) {
    const capskit = context.deps?.capskit;
    if (!capskit || typeof capskit.getManifests !== 'function') {
      throw new Error(
        'System capsule requires "capskit" dependency with getManifests() method.',
      );
    }
    return capskit.getManifests();
  }
}

class MetricsCap {
  async metrics(_payload: any, _context: any) {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: Date.now(),
    };
  }
}

class AuditCap {
  async audit(_payload: any, _context: any) {
    return { success: true };
  }
}

const registry: CapsuleRegistry = {
  name: 'system',
  caps: [
    {
      class: HealthCap,
      meta: {
        name: 'health',
        routes: [{ method: 'GET', path: '/health', action: 'getHealth' }],
      } as CapMeta,
    },
    {
      class: ListerCap,
      meta: {
        name: 'lister',
        routes: [{ method: 'GET', path: '/capsules', action: 'listCapsules' }],
      } as CapMeta,
    },
    {
      class: MetricsCap,
      meta: {
        name: 'metrics',
        routes: [{ method: 'GET', path: '/metrics', action: 'metrics' }],
      } as CapMeta,
    },
    {
      class: AuditCap,
      meta: {
        name: 'audit',
        events: {
          subscribes: [{ event: 'capskit-calculator.sum', action: 'audit' }],
        },
      } as CapMeta,
    },
  ],
};

export default registry;
