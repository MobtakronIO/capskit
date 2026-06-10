import { CapsuleDefinition, CapFile } from '../types/capsule-definition.type';
import { CapMeta } from '../types/cap-meta.type';
import { CapInput, KernelDeps, CapEntry, CapHandler, EventsState } from '../types/cap-input.type';
import { toCapsuleDefinition } from './boot/manifest-converter.helper';
export { toCapsuleDefinition };
import { discoverCaps } from './discover-caps.helper';
import { scanUserCapsules } from './boot/scan-capsules.helper';
import { loadBuiltinCapsules } from './boot/load-builtins.helper';

function isCapHandler(fn: unknown): fn is CapHandler {
  return typeof fn === 'function';
}

export interface BootState {
  capsules: Map<string, { def: CapsuleDefinition; dir?: string }>;
  caps: Map<string, CapFile & { capsuleDef?: CapsuleDefinition }>;
  dependencies: Record<string, unknown>;
  eventsState?: EventsState;
}


function buildKernelDeps(state: BootState): KernelDeps {
  const capEntries = new Map<string, CapEntry>();
  for (const [capPath, capFile] of state.caps) {
    if (!isCapHandler(capFile.handler)) {
      throw new Error(`Cap "${capPath}" handler is not a function`);
    }
    capEntries.set(capPath, {
      meta: capFile.meta,
      handler: capFile.handler,
      capsuleName: capFile.capsuleName,
      filePath: capFile.filePath,
      capsuleDef: capFile.capsuleDef,
    });
  }

  return {
    ...state.dependencies,
    capsMap: capEntries,
    allCaps: capEntries,
    capsules: state.capsules,
    dependencies: state.dependencies,
    eventsState: state.eventsState,
  };
}

/**
 * Resolve disableBuiltins to an array of names to exclude.
 * - `true` or `'*'` → disable all builtins
 * - `string[]` → disable only the named builtins
 * - `undefined`/`false` → disable none
 */
function resolveDisableBuiltins(raw: unknown): string[] {
  if (raw === true || raw === '*') return [...BUILTIN_CAPSULES];
  if (Array.isArray(raw)) return raw as string[];
  return [];
}

export function parseAndBuildState(input: CapInput): { state: BootState; capsuleDirs: string[]; disableBuiltins: string[]; preRegisteredCapsules: CapsuleDefinition[] } {
  const body = (input.body || {}) as {
    capsuleDirs?: string[];
    dependencies?: Record<string, unknown>;
    disableBuiltins?: string[] | boolean | '*';
    preRegisteredCapsules?: CapsuleDefinition[];
  };
  const { capsuleDirs = [], dependencies = {}, disableBuiltins: rawDisable = [], preRegisteredCapsules = [] } = body;
  return {
    state: {
      capsules: new Map(),
      caps: new Map(),
      dependencies: dependencies as Record<string, unknown>,
    },
    capsuleDirs,
    disableBuiltins: resolveDisableBuiltins(rawDisable),
    preRegisteredCapsules,
  };
}

export async function loadAllCapsules(disableBuiltins: string[], capsuleDirs: string[], state: BootState, preRegisteredCapsules: CapsuleDefinition[] = []): Promise<void> {
  // Register pre-built capsules first (e.g. @mobtakronio/capskit-drizzle)
  for (const capsuleDef of preRegisteredCapsules) {
    if (state.capsules.has(capsuleDef.name)) continue;
    state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: `virtual://${capsuleDef.name}` });

    // Register inline caps if present (factory-created capsules without filesystem dirs)
    if (capsuleDef.caps) {
      for (const cap of capsuleDef.caps) {
        const capPath = `${capsuleDef.name}.${cap.meta.name}`;
        state.caps.set(capPath, {
          meta: cap.meta,
          handler: cap.handler,
          capsuleName: capsuleDef.name,
          filePath: `virtual://${capsuleDef.name}/${cap.meta.name}`,
          capsuleDef,
        });
      }
    }

    if (capsuleDef.boot?.init) {
      // Will be called later in runBootLifecycles; skip here to avoid double-init
    }
  }

  await loadBuiltinCapsules(disableBuiltins, state);
  await scanUserCapsules(capsuleDirs, state);
}

export async function runBootLifecycles(sorted: CapsuleDefinition[], state: BootState): Promise<void> {
  const deps = buildKernelDeps(state);
  for (const capsuleDef of sorted) {
    if (capsuleDef.boot?.init) {
      await capsuleDef.boot.init({ deps });
    }
  }
  if (deps.eventsState) {
    state.eventsState = deps.eventsState;
  }
}


export function shapeBootResponse(sorted: CapsuleDefinition[], state: BootState) {
  return {
    status: 'ready',
    capsuleCount: state.capsules.size,
    capCount: state.caps.size,
    bootOrder: sorted.map(c => c.name),
  };
}

export { scanUserCapsules, loadBuiltinCapsules };
