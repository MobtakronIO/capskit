import { CapsuleRegistry } from './types';
import BootCap from './.cap/boot/cap';
import { meta as bootMeta } from './.cap/boot/cap.meta';
import CacheCap from './.cap/cache/cap';
import { meta as cacheMeta } from './.cap/cache/cap.meta';
import InspectCap from './.cap/inspect/cap';
import { meta as inspectMeta } from './.cap/inspect/cap.meta';

/**
 * CapsuleRegistry for the CapsKit kernel.
 *
 * Composes the kernel's built-in capabilities as caps following the
 * .cap pattern that CapsKit enforces for user capsules:
 *
 * - **boot**    — Dependency-aware capsule boot orchestration
 * - **cache**   — Action-level caching (memory / sqlite / redis)
 * - **inspect** — Runtime introspection (actions, manifests, state)
 *
 * Each cap lives under `.cap/<name>/` with `cap.ts` (CapClass) and
 * `cap.meta.ts` (CapMeta) files.
 *
 * This registry is consumed by `builtin.ts` at boot time and can be
 * registered like any user capsule.
 */
const kernelCaps: CapsuleRegistry = {
  name: 'kernel',
  caps: [
    { class: BootCap, meta: bootMeta },
    { class: CacheCap, meta: cacheMeta },
    { class: InspectCap, meta: inspectMeta },
  ],
};

export default kernelCaps;
