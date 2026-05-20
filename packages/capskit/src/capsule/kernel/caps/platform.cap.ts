import { CapHandler, KernelDeps, CapInput, CapContext, CapEntry } from '../types/cap-input.type';
import { InternalState, BootOptions } from '../types/platform.types';
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

/**
 * The platform instance returned by createCapsKitPlatform().
 * Implements both the low-level cap handler interface AND ICapsKit,
 * so it can be passed directly to createElysiaAdapter without wrapping.
 */
export interface CapsKitPlatform extends ICapsKit {
  state: InternalState;
  boot: (options?: BootOptions) => Promise<unknown>;
  register: CapHandler;
  rpc: CapHandler;
  registerCapsule: (capsuleDef: CapsuleDefinition, caps?: PreBuiltCap[]) => void;
}

export async function createCapsKitPlatform(): Promise<CapsKitPlatform> {
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
   */
  function registerCapsule(capsuleDef: CapsuleDefinition, caps?: PreBuiltCap[]): void {
    if (state.capsules.has(capsuleDef.name)) {
      throw new Error(`Capsule "${capsuleDef.name}" is already registered`);
    }

    preRegisteredCapsules.push(capsuleDef);
    state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: `virtual://${capsuleDef.name}` });

    // Auto-derive caps from capsuleDef.caps when not explicitly provided
    const resolvedCaps = caps || (capsuleDef.caps?.map(c => ({
      meta: c.meta,
      handler: c.handler,
      filePath: `virtual://${capsuleDef.name}/${c.meta.name}`,
    })) || []);

    for (const cap of resolvedCaps) {
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
   * Build manifests from state for getManifests() and describe().
   */
  function buildManifests(): CapsuleManifest[] {
    const manifests: CapsuleManifest[] = [];
    for (const [capsuleName, capsuleEntry] of state.capsules) {
      const caps: CapsuleManifest['caps'] = [];
      const routes: CapsuleManifest['routes'] = [];
      const eventPublishes = new Set<string>();
      const eventSubscribes: { event: string }[] = [];

      for (const [capPath, capFile] of state.caps) {
        if (capFile.capsuleName !== capsuleName) continue;
        const capMeta = capFile.meta;
        caps.push({
          name: capMeta.name,
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
            routes!.push({
              method: route.method,
              path: route.path,
              cap: capPath,
              action: route.action,
            });
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
        routes: routes!.length > 0 ? routes : undefined,
        events: {
          publishes: eventPublishes.size > 0 ? Array.from(eventPublishes) : undefined,
          subscribes: eventSubscribes.length > 0 ? eventSubscribes : undefined,
        },
      });
    }
    return manifests;
  }

  /**
   * Internal: execute a cap via the kernel call.cap handler.
   * Accepts CapInput format: { body: { capPath, payload } }
   */
  async function executeCapCall(input: CapInput): Promise<unknown> {
    const ctx = buildContext(state);
    const callMod = await import('./call.cap');
    return callMod.default(input, ctx);
  }

  /**
   * ICapsKit.call(capPath, payload) — accepts the public API signature.
   * Also works as CapHandler({ body }, ctx) for backward compatibility.
   */
  async function call(a: string, b?: unknown): Promise<unknown>;
  async function call(input: CapInput, ctx?: CapContext): Promise<unknown>;
  async function call(a: string | CapInput, b?: unknown): Promise<unknown> {
    // ICapsKit signature: call(capPath, payload)
    if (typeof a === 'string') {
      const capPath = a;
      const payload = b;
      const input: CapInput = { body: { capPath, payload } };
      const result = await executeCapCall(input);
      if (result && typeof result === 'object' && 'ok' in result) {
        if ((result as any).ok) return (result as any).result;
        throw new Error((result as any).error || 'Cap execution failed');
      }
      return result;
    }
    // CapHandler signature: call({ body }, ctx)
    return executeCapCall(a);
  }

  /**
   * Boot handler that wires discovered caps into platform.state.
   */
  const boot = async (options?: BootOptions): Promise<unknown> => {
    const { parseAndBuildState, loadAllCapsules, runBootLifecycles, shapeBootResponse } =
      await import('../helpers/boot-helpers.helper');

    // Build a synthetic CapInput from BootOptions for compatibility with parseAndBuildState
    const bootInput: CapInput = {
      body: {
        capsuleDirs: options?.capsuleDirs || [],
        dependencies: options?.dependencies || {},
        disableBuiltins: options?.disableBuiltins || [],
        preRegisteredCapsules,
      },
    };

    const bootState = parseAndBuildState(bootInput);

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
   * ICapsKit.use(capsuleName) — returns a proxy that calls caps as methods.
   */
  function use<TCapsule = unknown>(capsuleName: string): TCapsule {
    return new Proxy({}, {
      get(_target, prop: string) {
        return async (payload: unknown) => call(`${capsuleName}.${prop}`, payload);
      },
    }) as TCapsule;
  }

  /**
   * ICapsKit.emit(event, data) — delegates to events.emit cap.
   */
  function emit(event: string, data: unknown) {
    const emitCap = state.caps.get('events.emit');
    if (emitCap) {
      const ctx = buildContext(state);
      emitCap.handler({ body: { event, data } }, ctx);
    }
  }

  /**
   * ICapsKit.tell(capPath, payload) — fire-and-forget.
   */
  function tell(capPath: string, payload: unknown) {
    void call(capPath, payload).catch(() => {});
  }

  /**
   * ICapsKit.describe(capsuleName?) — returns manifest for one capsule or undefined.
   */
  function describe(capsuleName?: string): CapsuleManifest | undefined {
    if (capsuleName) {
      return buildManifests().find(m => m.name === capsuleName);
    }
    return undefined;
  }

  /**
   * ICapsKit.getManifests() — returns all capsule manifests.
   */
  function getManifests(): CapsuleManifest[] {
    return buildManifests();
  }

  /**
   * ICapsKit.addHook(hook) — no-op shim; hooks live on capsule definitions.
   */
  function addHook(_hook: { name: string; handler: CapHandler }) {
    // no-op
  }

  /**
   * ICapsKit.start() — checks boot status and returns summary.
   */
  async function start() {
    if (!state.booted) {
      throw new Error('Platform not booted. Call platform.boot() first, or use createCapsKit() for auto-boot.');
    }
    return {
      status: 'ready',
      capsuleCount: state.capsules.size,
      capCount: state.caps.size,
    };
  }

  /**
   * ICapsKit.shutdown() — runs shutdown lifecycle in reverse order.
   */
  async function shutdown() {
    const input: CapInput = { body: {} };
    const ctx = buildContext(state);
    const shutdownMod = await import('./shutdown.cap');
    return shutdownMod.default(input, ctx);
  }

  return {
    state,
    boot,
    call,
    use,
    emit,
    tell,
    describe,
    getManifests,
    addHook,
    start,
    shutdown,
    register: registerMod.default,
    rpc: rpcMod.default,
    registerCapsule,
  };
}

/**
 * @deprecated createCapsKitAdapter is no longer needed.
 * createCapsKitPlatform() now returns an object that implements ICapsKit directly.
 * Pass the platform to createElysiaAdapter without wrapping.
 */
export function createCapsKitAdapter(platform: CapsKitPlatform): ICapsKit {
  return platform;
}
