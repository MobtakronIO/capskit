import { CapsuleDefinition } from '../kernel/types/capsule-definition.type';
import healthCap, { meta as healthMeta } from './caps/health.cap';
import inspectCap, { meta as inspectMeta } from './caps/inspect.cap';
import auditCap, { meta as auditMeta } from './caps/audit.cap';
import getHealthCap, { meta as getHealthMeta } from './caps/getHealth.cap';
import listCapsulesCap, { meta as listCapsulesMeta } from './caps/listCapsules.cap';
import metricsCap, { meta as metricsMeta } from './caps/metrics.cap';

export default {
  name: 'system',
  dependencies: [],
  caps: [
    { meta: healthMeta, handler: healthCap },
    { meta: inspectMeta, handler: inspectCap },
    { meta: auditMeta, handler: auditCap },
    { meta: getHealthMeta, handler: getHealthCap },
    { meta: listCapsulesMeta, handler: listCapsulesCap },
    { meta: metricsMeta, handler: metricsCap },
  ],
} satisfies CapsuleDefinition;
