import { CapsuleRegistry } from '../../types';
import HealthCap from './.cap/health/cap';
import { meta as healthMeta } from './.cap/health/cap.meta';
import ListerCap from './.cap/lister/cap';
import { meta as listerMeta } from './.cap/lister/cap.meta';
import MetricsCap from './.cap/metrics/cap';
import { meta as metricsMeta } from './.cap/metrics/cap.meta';
import AuditCap from './.cap/audit/cap';
import { meta as auditMeta } from './.cap/audit/cap.meta';

/**
 * CapsuleRegistry for the built-in system capsule.
 *
 * Composes four caps — health, lister, metrics, audit — into a single
 * deployable system capsule.  The kernel's boot pipeline converts this
 * registry into a CapsuleManifest, merging per-cap actions, routes,
 * events, and dependencies.
 */
const systemCaps: CapsuleRegistry = {
  name: 'system',
  caps: [
    { class: HealthCap, meta: healthMeta },
    { class: ListerCap, meta: listerMeta },
    { class: MetricsCap, meta: metricsMeta },
    { class: AuditCap, meta: auditMeta },
  ],
};

export default systemCaps;
