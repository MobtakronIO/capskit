import { CapsuleRegistry } from '../../types';
import BuildRouterCap from './.cap/buildRouter/cap';
import { meta as buildRouterMeta } from './.cap/buildRouter/cap.meta';

/**
 * CapsuleRegistry for the built-in HTTP capsule.
 *
 * Composes a single cap — buildRouter — that dynamically generates
 * HTTP routes for every registered capsule's CapMeta.routes at runtime.
 * The kernel's boot pipeline converts this registry into a CapsuleManifest,
 * merging per-cap actions, dependencies, and metadata.
 */
const httpCaps: CapsuleRegistry = {
  name: 'http',
  caps: [{ class: BuildRouterCap, meta: buildRouterMeta }],
};

export default httpCaps;
