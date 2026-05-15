import { CapsuleRegistry } from '../../types';
import DrizzleCap from './.cap/drizzle/cap';
import { meta as drizzleMeta } from './.cap/drizzle/cap.meta';

/**
 * CapsuleRegistry for the built-in drizzle capsule.
 *
 * Composes a single cap — drizzle — providing query, execute,
 * transaction, migrate, health-check, and connection-close actions
 * against an injected Drizzle ORM instance.
 */
const drizzleCaps: CapsuleRegistry = {
  name: 'drizzle',
  caps: [{ class: DrizzleCap, meta: drizzleMeta }],
};

export default drizzleCaps;
