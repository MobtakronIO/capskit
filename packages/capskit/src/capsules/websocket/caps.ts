import { CapsuleRegistry } from '../../types';
import BuildSocketCap from './.cap/buildSocket/cap';
import { meta as buildSocketMeta } from './.cap/buildSocket/cap.meta';

/**
 * CapsuleRegistry for the built-in WebSocket capsule.
 *
 * Composes a single cap — buildSocket — that dynamically generates
 * WebSocket configurations for every registered capsule's CapMeta.routes
 * at runtime.  The kernel's boot pipeline converts this registry into a
 * CapsuleManifest, merging per-cap actions, dependencies, and metadata.
 */
const websocketCaps: CapsuleRegistry = {
  name: 'websocket',
  caps: [{ class: BuildSocketCap, meta: buildSocketMeta }],
};

export default websocketCaps;
