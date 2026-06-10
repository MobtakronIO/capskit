import { CapHandler, KernelDeps, CapInput, CapContext, CapEntry } from '../types/cap-input.type';
import { InternalState, BootOptions } from '../types/platform.types';
import { buildContext } from '../helpers/build-context.helper';
import { executeCap } from '../helpers/execute-cap.helper';
import { CapsuleDefinition, CapFile } from '../types/capsule-definition.type';
import { CapMeta } from '../types/cap-meta.type';
import { CapsuleManifest } from '../types/capsule-manifest.type';
import { ICapsKit } from '../types/capskit.type';

export interface PreBuiltCap {
  meta: CapMeta;
  handler: CapHandler;
  filePath?: string;
}

export interface CapsKitPlatform extends ICapsKit {
  state: InternalState;
  dependencies: Record<string, unknown>;
  getDependencies: () => Record<string, unknown>;
  boot: (options?: BootOptions) => Promise<unknown>;
  register: CapHandler;
  rpc: CapHandler;
  registerCapsule: (capsuleDef: CapsuleDefinition, caps?: PreBuiltCap[]) => void;
  interceptors: ((actionName: string, payload: unknown, context: CapContext, next: () => Promise<unknown>) => Promise<unknown>)[];
}

function buildManifests(state: InternalState): CapsuleManifest[] {
  const manifests: CapsuleManifest[] = [];
  for (const [capsuleName, capsuleEntry] of state.capsules) {
    const caps: CapsuleManifest['caps'] = [];
    const routes: CapsuleManifest['routes'] = [];
    const eventPublishes = new Set<string>();
    const eventSubscribes: { event: string }[] = [];
    const actions: Record<string, any> = {};

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
      actions[capMeta.name] = {
        handler: capFile.handler,
        meta: capMeta,
        description: capMeta.description,
        inputSchema: capMeta.inputSchema,
        outputSchema: capMeta.outputSchema,
        routes: capMeta.routes,
        hooks: capMeta.hooks,
        events: capMeta.events,
      };
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
      requires: capsuleEntry.def.dependencies,
      caps,
      actions,
      routes: routes!.length > 0 ? routes : undefined,
      events: {
        publishes: eventPublishes.size > 0 ? Array.from(eventPublishes) : undefined,
        subscribes: eventSubscribes.length > 0 ? eventSubscribes : undefined,
      },
    } as any);
  }
  return manifests;
}

export async function createCapsKitPlatform(): Promise<CapsKitPlatform> {
  const state: InternalState = {
    capsules: new Map(),
    caps: new Map(),
    allCaps: new Map(),
    dependencies: {},
    booted: false,
    circuitBreakerState: new Map(),
    cacheStore: new Map(),
  };

  const preRegisteredCapsules: CapsuleDefinition[] = [];

  const registerMod = await import('./register.cap');
  const rpcMod = await import('./rpc.cap');

  function registerCapsule(capsuleDef: CapsuleDefinition, caps?: PreBuiltCap[]): void {
    if (state.capsules.has(capsuleDef.name)) {
      throw new Error(`Capsule "${capsuleDef.name}" is already registered`);
    }

    preRegisteredCapsules.push(capsuleDef);
    state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: `virtual://${capsuleDef.name}` });

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

  async function executeCapCall(input: CapInput): Promise<unknown> {
    const ctx = buildContext(state);
    const callMod = await import('./call.cap');
    return callMod.default(input, ctx);
  }

  async function call(a: string, b?: unknown, suppressWarn?: boolean): Promise<unknown>;
  async function call(input: CapInput, ctx?: CapContext): Promise<unknown>;
  async function call(a: string | CapInput, b?: unknown, suppressWarn?: boolean): Promise<unknown> {
    if (typeof a === 'string') {
      const capPath = a;
      if (state.warnOnDirectCall && !suppressWarn) {
        console.warn(`Warning: Direct call to "${capPath}" via capskit.call() is discouraged. Use capskit.use('<capsule>').<action>() instead.`);
      }
      const payload = b;
      const ctx = buildContext(state);
      return executeCap(capPath, payload, ctx);
    }
    return executeCapCall(a);
  }

  const boot = async (options?: BootOptions): Promise<unknown> => {
    const { parseAndBuildState, loadAllCapsules, runBootLifecycles, shapeBootResponse } =
      await import('../helpers/boot-helpers.helper');

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
    state.dependencies = {
      ...bootState.state.dependencies,
      capskit: platform,
    };
    state.eventsState = bootState.state.eventsState;
    state.warnOnDirectCall = options?.warnOnDirectCall;
    state.booted = true;

    return shapeBootResponse(sorted, bootState.state);
  };

  function use<TCapsule = unknown>(capsuleName: string): TCapsule {
    return new Proxy({}, {
      get(_target, prop: string) {
        return async (payload: unknown) => call(`${capsuleName}.${prop}`, payload, true);
      },
    }) as TCapsule;
  }

  function emit(event: string, data: unknown) {
    const emitCap = state.caps.get('events.emit');
    if (emitCap) {
      const ctx = buildContext(state);
      emitCap.handler({ body: { event, data } }, ctx);
    } else {
      const adapterEventBus = state.dependencies.eventBus;
      if (adapterEventBus) {
        adapterEventBus.dispatch(event, data);
      }
    }
  }

  function describe(capsuleName?: string): CapsuleManifest | undefined {
    if (capsuleName) {
      return buildManifests(state).find(m => m.name === capsuleName);
    }
    return undefined;
  }

  function getManifests(): CapsuleManifest[] {
    return buildManifests(state);
  }

  function addHook(_hook: { name: string; handler: CapHandler }) {
    // no-op
  }

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

  async function shutdown() {
    const input: CapInput = { body: {} };
    const ctx = buildContext(state);
    const shutdownMod = await import('./shutdown.cap');
    return shutdownMod.default(input, ctx);
  }

  const interceptors: ((actionName: string, payload: any, context: any, next: () => Promise<any>) => Promise<any>)[] = [];

  function addInterceptor(interceptor: any) {
    interceptors.push(interceptor);
  }

  const platform: CapsKitPlatform = {
    state,
    dependencies: state.dependencies,
    getDependencies: () => state.dependencies,
    boot,
    call,
    use,
    emit,
    describe,
    getManifests,
    addHook,
    addInterceptor,
    interceptors,
    start,
    shutdown,
    register: registerMod.default,
    rpc: rpcMod.default,
    registerCapsule,
  };

  state.dependencies.capskit = platform;

  return platform;
}