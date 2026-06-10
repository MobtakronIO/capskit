import { CapsuleDefinition, CapFile } from '../types/capsule-definition.type';
import { CapMeta } from '../types/cap-meta.type';
import { CapInput, KernelDeps, CapEntry, CapHandler, EventsState } from '../types/cap-input.type';
import { filesystemRepository } from '../repository/filesystem.repository';
import { discoverCaps } from './discover-caps.helper';
import { BUILTIN_CAPSULES } from '../constants';
import * as fs from 'node:fs';
import * as path from 'node:path';

import kernelCapsule from '../../kernel/capsule';
import eventsCapsule from '../../events/capsule';
import httpCapsule from '../../http/capsule';
import websocketCapsule from '../../websocket/capsule';
import systemCapsule from '../../system/capsule';

const BUILTIN_CAPSULES_MAP: Record<string, any> = {
  kernel: kernelCapsule,
  events: eventsCapsule,
  http: httpCapsule,
  websocket: websocketCapsule,
  system: systemCapsule,
};

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
    capsMap: capEntries,
    allCaps: capEntries,
    capsules: state.capsules,
    dependencies: state.dependencies,
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

export function validateManifest(manifest: any): void {
  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    const err = new Error('Capsule manifest must have a non-empty name');
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
  if (!VALID_NAME.test(manifest.name)) {
    const err = new Error(`Capsule manifest has invalid name "${manifest.name}". Name must be alphanumeric, hyphens, and underscores only`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!manifest.actions || typeof manifest.actions !== 'object') {
    const err = new Error(`Capsule manifest "${manifest.name}" must have an actions object`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  for (const actionName of Object.keys(manifest.actions)) {
    if (!VALID_NAME.test(actionName)) {
      const err = new Error(`Capsule "${manifest.name}" has invalid action name "${actionName}". Action names must be alphanumeric, hyphens, and underscores only`);
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }
  }
}

export function toCapsuleDefinition(manifest: any): CapsuleDefinition {
  validateManifest(manifest);
  const manifestRoutes = manifest.routes || [];
  const manifestSubscribes = manifest.events?.subscribes || [];
  const manifestPublishes = manifest.events?.publishes || [];

  return {
    name: manifest.name,
    dependencies: manifest.dependencies || manifest.requires,
    caps: Object.entries(manifest.actions || {}).map(([actionName, actionDef]: [string, any]) => {
      const matchedRoutes = manifestRoutes.filter((r: any) => r.action === actionName);
      const actionRoutes = [
        ...(actionDef.routes || []),
        ...matchedRoutes.map((r: any) => ({
          method: r.method,
          path: r.path,
          action: r.action,
        })),
      ];

      // Match manifest-level event subscriptions for this action
      const matchedSubscribes = manifestSubscribes.filter((s: any) => s.action === actionName);
      const actionSubscribes = [
        ...(actionDef.events?.subscribes || []),
        ...matchedSubscribes.map((s: any) => ({
          event: s.event,
        })),
      ];

      const actionPublishes = actionDef.events?.publishes || [];

      const actionEvents = (actionSubscribes.length > 0 || actionPublishes.length > 0)
        ? {
            subscribes: actionSubscribes.length > 0 ? actionSubscribes : undefined,
            publishes: actionPublishes.length > 0 ? actionPublishes : undefined,
          }
        : actionDef.events;

      return {
        meta: {
          name: actionName,
          inputSchema: actionDef.inputSchema || actionDef.schema,
          outputSchema: actionDef.outputSchema,
          resiliency: actionDef.resiliency,
          hooks: actionDef.hooks,
          events: actionEvents,
          routes: actionRoutes.length > 0 ? actionRoutes : undefined,
        },
        handler: actionDef.handler,
      };
    }),
  };
}

export async function scanUserCapsules(capsuleDirs: string[], state: BootState): Promise<void> {
  for (const dir of capsuleDirs) {
    const directCapsule = path.join(dir, 'capsule.ts');
    const directCaps = path.join(dir, 'caps.ts');
    let capsulePaths: string[] = [];

    if (fs.existsSync(directCapsule)) {
      capsulePaths.push(directCapsule);
    } else if (fs.existsSync(directCaps)) {
      capsulePaths.push(directCaps);
    } else {
      capsulePaths = await filesystemRepository.discoverCapsules(dir);
    }

    for (const capsulePath of capsulePaths) {
      let capsuleDef: CapsuleDefinition;
      let capsuleDir: string;

      if (capsulePath.endsWith('capsule.ts')) {
        capsuleDef = await filesystemRepository.readCapsuleDef(capsulePath);
        capsuleDir = capsulePath.replace(/capsule\.ts$/, '');
      } else {
        const mod = await import(capsulePath);
        const registry = mod.default || Object.values(mod)[0];
        const { convertRegistryToManifest } = await import('./legacy-bridge.helper');
        const manifest = convertRegistryToManifest(registry);
        capsuleDef = toCapsuleDefinition(manifest);
        capsuleDir = capsulePath.replace(/caps\.ts$/, '');
      }

      state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: capsuleDir });

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
      } else {
        const caps = await discoverCaps(capsuleDir, capsuleDef.name);
        for (const cap of caps) {
          const capPath = `${cap.capsuleName}.${cap.meta.name}`;
          state.caps.set(capPath, { ...cap, capsuleDef });
        }
      }
    }
  }
}

async function loadBuiltinCapsule(name: string, state: BootState) {
  const capsuleDef = BUILTIN_CAPSULES_MAP[name] as CapsuleDefinition | undefined;
  if (!capsuleDef) {
    console.warn(`Built-in capsule "${name}" not found in static registry`);
    return;
  }

  const capsuleDir = `virtual://${name}`;
  state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: capsuleDir });

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
}

async function loadBuiltinCapsules(disableBuiltins: string[], state: BootState): Promise<void> {
  const enabledBuiltins = BUILTIN_CAPSULES.filter(b => !disableBuiltins.includes(b));
  for (const builtinName of enabledBuiltins) {
    await loadBuiltinCapsule(builtinName, state);
  }
}
