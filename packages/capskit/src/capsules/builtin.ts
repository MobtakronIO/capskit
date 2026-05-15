import { CapsuleManifest } from '../types';
import { convertRegistryToManifest } from '../kernel/cap-loader';
import kernelCaps from '../caps';
import systemCaps from './system/caps';
import httpCaps from './http/caps';
import websocketCaps from './websocket/caps';
import calculatorCaps from './capskit-calculator/caps';

/**
 * Built-in capsules registered at kernel startup.
 *
 * All capsules follow the .cap pattern (caps.ts registry + .cap/ subdirectories)
 * including the kernel itself (../caps.ts). Each CapsuleRegistry is converted
 * to a CapsuleManifest for the kernel's boot pipeline.
 *
 * Order: kernel first (boot, cache, inspect), then user-facing capsules.
 *
 * NOTE: drizzle is NOT a builtin. It's a standalone user capsule
 * (@mobtakronio/capskit-drizzle) that users opt into via config.capsules
 * or config.dependencies.
 */
export const builtinCapsules: CapsuleManifest[] = [
  convertRegistryToManifest(kernelCaps),
  convertRegistryToManifest(systemCaps),
  convertRegistryToManifest(httpCaps),
  convertRegistryToManifest(calculatorCaps),
  convertRegistryToManifest(websocketCaps),
];
