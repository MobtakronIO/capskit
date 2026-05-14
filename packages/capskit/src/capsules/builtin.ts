import { CapsuleManifest } from '../types';
import { convertRegistryToManifest } from '../kernel/cap-loader';
import systemCaps from './system/caps';
import { service as httpService } from './http/manifest';
import { service as calculatorService } from './capskit-calculator/manifest';
import { service as websocketService } from './websocket/manifest';
import { service as drizzleService } from './drizzle/manifest';

/**
 * Built-in capsules registered at kernel startup.
 *
 * The system capsule is now defined via caps.ts (CapsuleRegistry)
 * and converted to a CapsuleManifest here for backward compatibility
 * with the kernel's boot pipeline.  The remaining capsules still use
 * the legacy manifest.ts format.
 */
export const builtinCapsules: CapsuleManifest[] = [
  convertRegistryToManifest(systemCaps),
  httpService,
  calculatorService,
  websocketService,
  drizzleService,
];
