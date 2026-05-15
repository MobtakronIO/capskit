import { CapsuleManifest } from '../types';
import { convertRegistryToManifest } from '../kernel/cap-loader';
import systemCaps from './system/caps';
import httpCaps from './http/caps';
import websocketCaps from './websocket/caps';
import { service as calculatorService } from './capskit-calculator/manifest';
import drizzleCaps from './drizzle/caps';

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
  convertRegistryToManifest(httpCaps),
  calculatorService,
  convertRegistryToManifest(websocketCaps),
  convertRegistryToManifest(drizzleCaps),
];
