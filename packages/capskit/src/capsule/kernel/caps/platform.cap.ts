import { CapHandler, KernelDeps } from '../types/cap-input.type';
import { InternalState } from '../types/platform.types';
import { buildContext } from '../helpers/build-context.helper';
import { CapsuleDefinition, CapFile } from '../types/capsule-definition.type';
import { CapMeta } from '../types/cap-meta.type';

/**
 * Pre-built cap entry for capsules that don't live on the filesystem.
 * Matches the CapFile shape but allows omitting capsuleName (inferred from capsuleDef).
 */
export interface PreBuiltCap {
  meta: CapMeta;
  handler: CapHandler;
  filePath?: string;
}

export async function createCapsKitPlatform(): Promise<{
  state: InternalState;
  call: CapHandler;
  use: CapHandler;
  register: CapHandler;
  shutdown: CapHandler;
  boot: CapHandler;
  describe: CapHandler;
  rpc: CapHandler;
  /** Register a pre-built capsule (e.g. @mobtakronio/capskit-drizzle) before boot */
  registerCapsule: (capsuleDef: CapsuleDefinition, caps: PreBuiltCap[]) => void;
}> {
  const state: InternalState = {
    capsules: new Map(),
    caps: new Map(),
    allCaps: new Map(),
    dependencies: {},
    booted: false,
  };

  // Import the cap handlers
  const bootMod = await import('./boot.cap');
  const callMod = await import('./call.cap');
  const useMod = await import('./use.cap');
  const registerMod = await import('./register.cap');
  const shutdownMod = await import('./shutdown.cap');
  const describeMod = await import('./describe.cap');
  const rpcMod = await import('./rpc.cap');

  /**
   * Register a pre-built capsule definition with its caps directly into state.
   * Use this before calling boot() when you have capsules that don't live on
   * the filesystem (e.g. @mobtakronio/capskit-drizzle).
   *
   * @example
   * ```ts
   * const platform = await createCapsKitPlatform();
   * platform.registerCapsule(drizzleCapsuleDef, drizzleCaps);
   * await platform.boot({ body: { capsuleDirs: ['./capsules'] } }, ctx);
   * ```
   */
  function registerCapsule(capsuleDef: CapsuleDefinition, caps: PreBuiltCap[]): void {
    if (state.capsules.has(capsuleDef.name)) {
      throw new Error(`Capsule "${capsuleDef.name}" is already registered`);
    }

    state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: `virtual://${capsuleDef.name}` });

    for (const cap of caps) {
      const capPath = `${capsuleDef.name}.${cap.meta.name}`;
      const capFile: CapFile = {
        meta: cap.meta,
        handler: cap.handler,
        capsuleName: capsuleDef.name,
        filePath: cap.filePath || `virtual://${capsuleDef.name}/${cap.meta.name}`,
      };
      state.caps.set(capPath, capFile);
      state.allCaps.set(capPath, capFile);
    }
  }

  return {
    state,
    boot: bootMod.default,
    call: callMod.default,
    use: useMod.default,
    register: registerMod.default,
    shutdown: shutdownMod.default,
    describe: describeMod.default,
    rpc: rpcMod.default,
    registerCapsule,
  };
}
