import type { CapsuleRegistry } from '@mobtakronio/capskit';
import DrizzleCap from './.cap/drizzle/cap';
import { meta as drizzleMeta } from './.cap/drizzle/cap.meta';

/**
 * CapsuleRegistry for the drizzle capsule.
 *
 * Composes a single cap — drizzle — providing query, execute,
 * transaction, migrate, health-check, and connection-close actions
 * against an injected Drizzle ORM instance.
 *
 * Usage:
 * ```ts
 * import { drizzleCaps } from '@mobtakronio/capskit-drizzle';
 * import { convertRegistryToManifest } from '@mobtakronio/capskit';
 *
 * const manifest = convertRegistryToManifest(drizzleCaps);
 * ```
 */
const drizzleCaps: CapsuleRegistry = {
  name: 'drizzle',
  caps: [{ class: DrizzleCap, meta: drizzleMeta }],
};

export default drizzleCaps;
