import { CapHandler, KernelDeps, CapInput, CapContext, CapEntry } from '../types/cap-input.type';
import { InternalState } from '../types/platform.types';
import { buildContext } from '../helpers/build-context.helper';
import { CapsuleDefinition, CapFile } from '../types/capsule-definition.type';
import { CapMeta } from '../types/cap-meta.type';
import { CapsuleManifest } from '../types/capsule-manifest.type';
import { ICapsKit } from '../types/capskit.type';

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

  const preRegisteredCapsules: CapsuleDefinition[] = [];

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

    preRegisteredCapsules.push(capsuleDef);
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

  /**
   * Wrapped boot handler that wires discovered caps into platform.state.
   * Calls the underlying boot.cap handler, then copies its internal state
   * back into the shared state object so call/describe/use work.
   */
  const boot: CapHandler = async (input: CapInput, ctx: CapContext) => {
    const bootMod = await import('./boot.cap');
    const result = await bootMod.default(input, ctx);

    // The boot.cap handler builds its own internal state via parseAndBuildState.
    // We need to re-discover capsules into platform.state so that call/describe work.
    // Re-run discovery using the same parameters but targeting platform.state.
    const { parseAndBuildState, loadAllCapsules, runBootLifecycles, shapeBootResponse } =
      await import('../helpers/boot-helpers.helper');

    const bootState = parseAndBuildState(input);
    // Merge pre-registered capsules
    for (const preReg of preRegisteredCapsules) {
      if (!bootState.state.capsules.has(preReg.name)) {
        bootState.state.capsules.set(preReg.name, { def: preReg, dir: `virtual://${preReg.name}` });
      }
    }

    await loadAllCapsules(bootState.disableBuiltins, bootState.capsuleDirs, bootState.state, bootState.preRegisteredCapsules);
    const sorted = (await import('../helpers/validate-and-order.helper')).validateAndOrder(
      new Map(bootState.state.capsules.entries())
    );
    await runBootLifecycles(sorted, bootState.state);

    // Wire discovered capsules and caps into platform.state
    for (const [name, entry] of bootState.state.capsules) {
      if (!state.capsules.has(name)) {
        state.capsules.set(name, { def: entry.def, dir: entry.dir || '' });
      }
    }
    for (const [capPath, capFile] of bootState.state.caps) {
      if (!state.caps.has(capPath)) {
        const capEntry: CapFile = {
          meta: capFile.meta,
          handler: capFile.handler,
          capsuleName: capFile.capsuleName,
          filePath: capFile.filePath,
        };
        state.caps.set(capPath, capEntry);
        state.allCaps.set(capPath, capEntry);
      }
    }
    state.dependencies = bootState.state.dependencies;
    state.booted = true;

    return shapeBootResponse(sorted, bootState.state);
  };

  /**
   * Wrapped call handler that builds context from platform.state.
   */
  const call: CapHandler = async (input: CapInput, _ctx: CapContext) => {
    const ctx = buildContext(state);
    const callMod = await import('./call.cap');
    return callMod.default(input, ctx);
  };

  /**
   * Wrapped describe handler that builds context from platform.state.
   */
  const describe: CapHandler = async (input: CapInput, _ctx: CapContext) => {
    const ctx = buildContext(state);
    const describeMod = await import('./describe.cap');
    return describeMod.default(input, ctx);
  };

  /**
   * Wrapped use handler that builds context from platform.state.
   */
  const use: CapHandler = async (input: CapInput, _ctx: CapContext) => {
    const ctx = buildContext(state);
    const useMod = await import('./use.cap');
    return useMod.default(input, ctx);
  };

  return {
    state,
    boot,
    call,
    use,
    register: registerMod.default,
    shutdown: shutdownMod.default,
    describe,
    rpc: rpcMod.default,
    registerCapsule,
  };
}

/**
 * Creates an ICapsKit-compatible adapter from a booted CapsKitPlatform.
 *
 * This bridges the gap between the low-level platform (raw cap handlers)
 * and the ICapsKit interface required by adapters like createElysiaAdapter.
 *
 * @example
 * ```ts
 * const platform = await createCapsKitPlatform();
 * await platform.boot({ body: { capsuleDirs: ['./capsules'], dependencies: { db } } });
 * const capskit = createCapsKitAdapter(platform);
 * const elysia = await createElysiaAdapter(capskit, { http: true });
 * ```
 */
export function createCapsKitAdapter(platform: Awaited<ReturnType<typeof createCapsKitPlatform>>): ICapsKit {
  const { state, call, use, describe, shutdown, registerCapsule } = platform;

  return {
    async start() {
      if (!state.booted) {
        throw new Error('Platform not booted. Call platform.boot() first, or use createCapsKit() for auto-boot.');
      }
      return {
        status: 'ready',
        capsuleCount: state.capsules.size,
        capCount: state.caps.size,
      };
    },

    async call(capPath: string, payload?: unknown) {
      const input: CapInput = { body: { capPath, payload } };
      const ctx = buildContext(state);
      const callMod = await import('./call.cap');
      const result = await callMod.default(input, ctx);
      // call.cap returns { ok, result/error, durationMs }
      if (result && typeof result === 'object' && 'ok' in result) {
        if (result.ok) return (result as any).result;
        throw new Error((result as any).error || 'Cap execution failed');
      }
      return result;
    },

    use<TCapsule = unknown>(capsuleName: string): TCapsule {
      const adapter = this;
      return new Proxy({}, {
        get(_target, prop: string) {
          return async (payload: unknown) => {
            const capPath = `${capsuleName}.${prop}`;
            return adapter.call(capPath, payload);
          };
        },
      }) as TCapsule;
    },

    emit(event: string, data: unknown) {
      const emitCap = state.caps.get('events.emit');
      if (emitCap) {
        const ctx = buildContext(state);
        emitCap.handler({ body: { event, data } }, ctx);
      }
    },

    tell(capPath: string, payload: unknown) {
      void this.call(capPath, payload).catch(() => {});
    },

    describe(capsuleName?: string): CapsuleManifest | undefined {
      // describe.cap returns all capsules; filter if name provided
      // We need to call it synchronously which is not ideal, but ICapsKit.describe is sync.
      // Build the manifest from state directly instead.
      if (capsuleName) {
        const capsuleEntry = state.capsules.get(capsuleName);
        if (!capsuleEntry) return undefined;

        const caps: any[] = [];
        const routes: any[] = [];
        const eventPublishes = new Set<string>();
        const eventSubscribes: { event: string }[] = [];

        for (const [capPath, capFile] of state.caps) {
          if (capFile.capsuleName !== capsuleName) continue;
          const capMeta = capFile.meta;
          caps.push({
            name: capMeta.name,
            kind: capMeta.kind,
            capPath,
            description: capMeta.description,
            inputSchema: capMeta.inputSchema,
            outputSchema: capMeta.outputSchema,
            routes: capMeta.routes,
            hooks: capMeta.hooks,
            events: capMeta.events,
          });
          if (capMeta.routes) {
            for (const route of capMeta.routes) {
              routes.push({ method: route.method, path: route.path, cap: capPath, action: route.action });
            }
          }
          if (capMeta.events?.publishes) {
            for (const evt of capMeta.events.publishes) eventPublishes.add(evt);
          }
          if (capMeta.events?.subscribes) {
            for (const sub of capMeta.events.subscribes) eventSubscribes.push(sub);
          }
        }

        return {
          name: capsuleName,
          dependencies: capsuleEntry.def.dependencies,
          caps,
          routes: routes.length > 0 ? routes : undefined,
          events: {
            publishes: eventPublishes.size > 0 ? Array.from(eventPublishes) : undefined,
            subscribes: eventSubscribes.length > 0 ? eventSubscribes : undefined,
          },
        } as CapsuleManifest;
      }
      return undefined;
    },

    getManifests(): CapsuleManifest[] {
      const manifests: CapsuleManifest[] = [];
      for (const [capsuleName, capsuleEntry] of state.capsules) {
        const caps: any[] = [];
        const routes: any[] = [];
        const eventPublishes = new Set<string>();
        const eventSubscribes: { event: string }[] = [];

        for (const [capPath, capFile] of state.caps) {
          if (capFile.capsuleName !== capsuleName) continue;
          const capMeta = capFile.meta;
          caps.push({
            name: capMeta.name,
            kind: capMeta.kind,
            capPath,
            description: capMeta.description,
            inputSchema: capMeta.inputSchema,
            outputSchema: capMeta.outputSchema,
            routes: capMeta.routes,
            hooks: capMeta.hooks,
            events: capMeta.events,
          });
          if (capMeta.routes) {
            for (const route of capMeta.routes) {
              routes.push({ method: route.method, path: route.path, cap: capPath, action: route.action });
            }
          }
          if (capMeta.events?.publishes) {
            for (const evt of capMeta.events.publishes) eventPublishes.add(evt);
          }
          if (capMeta.events?.subscribes) {
            for (const sub of capMeta.events.subscribes) eventSubscribes.push(sub);
          }
        }

        manifests.push({
          name: capsuleName,
          dependencies: capsuleEntry.def.dependencies,
          caps,
          routes: routes.length > 0 ? routes : undefined,
          events: {
            publishes: eventPublishes.size > 0 ? Array.from(eventPublishes) : undefined,
            subscribes: eventSubscribes.length > 0 ? eventSubscribes : undefined,
          },
        } as CapsuleManifest);
      }
      return manifests;
    },

    addHook(hook: { name: string; handler: CapHandler }) {
      // Hooks are stored on capsule definitions; store on a virtual capsule
      // For now, this is a no-op adapter shim
    },

    async shutdown() {
      const input: CapInput = { body: {} };
      const ctx = buildContext(state);
      const shutdownMod = await import('./shutdown.cap');
      return shutdownMod.default(input, ctx);
    },
  };
}
