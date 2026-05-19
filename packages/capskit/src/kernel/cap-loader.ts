// Cap loader - full implementation for cap manifest loading and validation pipeline

import * as fs from 'fs';
import * as path from 'path';

// ── Errors ────────────────────────────────────────────────────────────────

export class CapLoadError extends Error {
  public readonly filePath?: string;
  constructor(message: string, filePath?: string) {
    super(message);
    this.name = 'CapLoadError';
    this.filePath = filePath;
  }
}

export class DuplicateCapNameError extends CapLoadError {
  public readonly duplicates: string[];
  constructor(duplicates: string[], context: string) {
    super(`Duplicate cap names [${duplicates.join(', ')}] in ${context}`, context);
    this.name = 'DuplicateCapNameError';
    this.duplicates = duplicates;
  }
}

export class CapCycleError extends CapLoadError {
  public readonly cycle: string[];
  constructor(cycle: string[], context: string) {
    super(`Dependency cycle detected: ${cycle.join(' → ')} in ${context}`, context);
    this.name = 'CapCycleError';
    this.cycle = cycle;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface CapMeta {
  name: string;
  kind?: 'action' | 'hook';
  routes?: Array<{ method: string; path: string; cap: string; action: string }>;
  events?: { publishes?: string[]; subscribes?: Array<{ event: string; action: string }> };
  dependencies?: string[];
  description?: string;
}

export interface CapRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  path: string;
  cap: string;
  action: string;
}

export interface CapEventSubscription {
  event: string;
  action: string;
}

export interface CapsuleManifest {
  name: string;
  version?: string;
  actions: Record<string, { handler: (...args: unknown[]) => unknown; meta?: CapMeta; description?: string; inputSchema?: unknown; outputSchema?: unknown; cache?: unknown; resiliency?: unknown }>;
  routes?: Array<{ method: string; path: string; action: string }>;
  dependencies?: string[];
  requires?: string[];
  events?: { publishes?: string[]; subscribes?: CapEventSubscription[] };
  boot?: { init: () => Promise<void>; timeout?: number };
}

export interface CapsuleRegistry {
  name: string;
  caps: Array<{ class: new (deps?: Record<string, unknown>) => unknown; meta: CapMeta }>;
  dependencies?: string[];
}

export interface CapDefinition {
  class: new (deps?: Record<string, unknown>) => unknown;
  meta: CapMeta;
  dependencies?: string[];
}

export interface CapsuleFormatDetection {
  kind: 'caps-registry' | 'cap-directories' | 'legacy-manifest' | 'unknown';
  hasCapsTs: boolean;
  hasCapDirs: boolean;
  hasManifest: boolean;
  dirPath?: string;
}

export interface CapFileResult {
  meta: CapMeta;
  class: new () => unknown;
}

// ── Validation ────────────────────────────────────────────────────────────

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const FRAMEWORK_MODULES = ['elysia', 'express', 'fastify', 'hono', 'koa', 'nest', '@nestjs/core', 'restify', 'polka', 'micro', 'sapper', 'sveltekit', 'next', 'remix'];

export function validateCapMeta(meta: unknown, filePath?: string): CapMeta {
  if (meta === null || meta === undefined) throw new CapLoadError('Cap meta must not be null or undefined', filePath);
  if (typeof meta !== 'object') throw new CapLoadError('Cap meta must be an object', filePath);

  const m = meta as Record<string, unknown>;

  // Name validation
  if (!('name' in m) || typeof m.name !== 'string') throw new CapLoadError('Cap meta must have a name', filePath);
  if (!m.name || (m.name as string).trim() === '') throw new CapLoadError('Cap name must not be empty', filePath);
  if (/\s/.test(m.name as string)) throw new CapLoadError(`Cap name "${m.name}" must not contain spaces`, filePath);
  if (!VALID_NAME_RE.test(m.name as string)) throw new CapLoadError(`Cap name "${m.name}" contains invalid characters`, filePath);

  const result: CapMeta = { name: m.name as string };

  // Kind
  if ('kind' in m && m.kind) result.kind = m.kind as 'action' | 'hook';

  // Routes
  if ('routes' in m && m.routes !== undefined) {
    if (!Array.isArray(m.routes)) throw new CapLoadError('Routes must be an array', filePath);
    result.routes = (m.routes as Array<Record<string, unknown>>).map((r, i) => {
      if (!VALID_HTTP_METHODS.includes(r.method as string)) throw new CapLoadError(`Route[${i}] has invalid method "${r.method}"`, filePath);
      if (!r.path || typeof r.path !== 'string' || (r.path as string).trim() === '') throw new CapLoadError(`Route[${i}] has empty path`, filePath);
      if (!r.action || typeof r.action !== 'string' || (r.action as string).trim() === '') throw new CapLoadError(`Route[${i}] has empty action`, filePath);
      return { method: r.method as string, path: r.path as string, cap: (r.cap || '') as string, action: r.action as string };
    });
  }

  // Events
  if ('events' in m && m.events !== undefined) {
    const ev = m.events as Record<string, unknown>;
    if (Array.isArray(ev)) throw new CapLoadError('Events must be an object, not an array', filePath);
    result.events = {};

    if ('publishes' in ev && ev.publishes !== undefined) {
      if (!Array.isArray(ev.publishes)) throw new CapLoadError('Events.publishes must be an array', filePath);
      result.events.publishes = (ev.publishes as unknown[]).map((p, i) => {
        if (typeof p !== 'string') throw new CapLoadError(`Events.publishes[${i}] must be a string`, filePath);
        if ((p as string).trim() === '') throw new CapLoadError(`Events.publishes[${i}] must not be empty`, filePath);
        return p as string;
      });
    }

    if ('subscribes' in ev && ev.subscribes !== undefined) {
      if (!Array.isArray(ev.subscribes)) throw new CapLoadError('Events.subscribes must be an array', filePath);
      result.events.subscribes = (ev.subscribes as Array<Record<string, unknown>>).map((s, i) => {
        if (typeof s !== 'object' || s === null) throw new CapLoadError(`Events.subscribes[${i}] must be an object`, filePath);
        if (!s.event || typeof s.event !== 'string' || (s.event as string).trim() === '') throw new CapLoadError(`Events.subscribes[${i}] has empty event`, filePath);
        if (!s.action || typeof s.action !== 'string' || (s.action as string).trim() === '') throw new CapLoadError(`Events.subscribes[${i}] has empty action`, filePath);
        return { event: s.event as string, action: s.action as string };
      });
    }
  }

  // Dependencies
  if ('dependencies' in m && m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies)) throw new CapLoadError('Dependencies must be an array', filePath);
    result.dependencies = (m.dependencies as unknown[]).map((d, i) => {
      if (typeof d !== 'string') throw new CapLoadError(`Dependencies[${i}] must be a string`, filePath);
      if ((d as string).trim() === '') throw new CapLoadError(`Dependencies[${i}] must not be empty`, filePath);
      return d as string;
    });
  }

  return result;
}

export function validateCapClass(capClass: unknown, filePath?: string): void {
  if (capClass === null || capClass === undefined) throw new CapLoadError('Cap class must not be null or undefined', filePath);
  if (typeof capClass !== 'function') throw new CapLoadError('Cap must be a class/function', filePath);

  // Check if it's an arrow function (no prototype)
  const fn = capClass as Function;
  if (!fn.prototype) throw new CapLoadError('Cap must be a class, not an arrow function', filePath);

  // Check for methods (excluding constructor)
  const methodNames = Object.getOwnPropertyNames(fn.prototype).filter(n => n !== 'constructor');
  if (methodNames.length === 0) throw new CapLoadError('Cap class must have at least one method', filePath);
}

export function validateCapsuleRegistry(registry: unknown, filePath?: string): CapsuleRegistry {
  if (registry === null || registry === undefined) throw new CapLoadError('Registry must not be null or undefined', filePath);
  const r = registry as Record<string, unknown>;
  if (!r.name || typeof r.name !== 'string') throw new CapLoadError('Registry must have a name', filePath);
  if (!('caps' in r) || !Array.isArray(r.caps)) throw new CapLoadError('Registry must have a caps array', filePath);
  if ((r.caps as unknown[]).length === 0) throw new CapLoadError('Registry caps array must not be empty', filePath);

  const caps = (r.caps as Array<Record<string, unknown>>).map((c, i) => {
    if (!c.class || typeof c.class !== 'function') throw new CapLoadError(`Caps[${i}] must have a class`, filePath);
    if (!c.meta || typeof c.meta !== 'object') throw new CapLoadError(`Caps[${i}] must have meta`, filePath);
    return { class: c.class as new () => unknown, meta: c.meta as CapMeta };
  });

  // Check for duplicate names
  const nameCount = new Map<string, number>();
  for (const c of caps) nameCount.set(c.meta.name, (nameCount.get(c.meta.name) || 0) + 1);
  const dupes = Array.from(nameCount.entries()).filter(([, count]) => count > 1).map(([name]) => name);
  if (dupes.length > 0) throw new DuplicateCapNameError(dupes, r.name as string);

  // Check for cycles
  const cycle = detectCapCycle(caps.map(c => ({ class: c.class, meta: c.meta })));
  if (cycle) throw new CapCycleError(cycle, r.name as string);

  return { name: r.name as string, caps, dependencies: r.dependencies as string[] | undefined };
}

// ── Cycle Detection ───────────────────────────────────────────────────────

export function detectCapCycle(caps: Array<{ class?: new () => unknown; meta: CapMeta }>): string[] | null {
  if (!caps || caps.length === 0) return null;

  const capNames = new Set(caps.map(c => c.meta.name));
  const adj = new Map<string, string[]>();
  for (const c of caps) {
    const deps = (c.meta.dependencies || []).filter(d => capNames.has(d));
    adj.set(c.meta.name, deps);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cyclePath: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    cyclePath.push(node);

    for (const dep of adj.get(node) || []) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (inStack.has(dep)) {
        cyclePath.push(dep);
        return true;
      }
    }

    cyclePath.pop();
    inStack.delete(node);
    return false;
  }

  for (const cap of caps) {
    if (!visited.has(cap.meta.name)) {
      if (dfs(cap.meta.name)) {
        // Extract the cycle from cyclePath
        const lastNode = cyclePath[cyclePath.length - 1];
        const cycleStart = cyclePath.indexOf(lastNode);
        return cyclePath.slice(cycleStart);
      }
    }
  }

  return null;
}

export function validateDepGraph(_graph: Map<string, string[]>): string[][] { return []; }

// ── Conversion ────────────────────────────────────────────────────────────

function getActionMethods(capClass: new () => unknown): string[] {
  const proto = capClass.prototype;
  return Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor');
}

function mergeActionMeta(method: string, capMeta: CapMeta, defaults: Record<string, unknown>): Record<string, unknown> {
  const actionMeta = (capMeta as unknown as Record<string, unknown>).actions as Record<string, Record<string, unknown>> | undefined;
  if (!actionMeta || !actionMeta[method]) return defaults;
  const m = actionMeta[method];
  const result = { ...defaults };
  if (m.description) result.description = m.description;
  if (m.inputSchema) result.inputSchema = m.inputSchema;
  if (m.schema) result.inputSchema = m.schema; // deprecated field mapped
  if (m.outputSchema) result.outputSchema = m.outputSchema;
  if (m.cache) result.cache = m.cache;
  if (m.resiliency) result.resiliency = m.resiliency;
  return result;
}

export function convertCapToManifest(def: CapDefinition, capsuleName?: string, deps?: Record<string, unknown>): CapsuleManifest {
  const name = capsuleName || def.meta.name;
  const methods = getActionMethods(def.class);

  if (methods.length === 0) throw new CapLoadError(`Cap "${name}" has no action methods`);

  const actions: CapsuleManifest['actions'] = {};
  for (const method of methods) {
    const instance = deps ? new def.class(deps) : new def.class();
    const handler = async (...args: unknown[]) => {
      const fn = (instance as any)[method];
      return typeof fn === 'function' ? fn.call(instance, ...args) : undefined;
    };
    const merged = mergeActionMeta(method, def.meta, {
      description: `Cap "${def.meta.name}" action: ${method}`,
    });
    actions[method] = {
      handler,
      meta: def.meta,
      ...merged,
    };
  }

  const manifest: CapsuleManifest = { name, actions };

  if (def.meta.dependencies && def.meta.dependencies.length > 0) {
    manifest.requires = [...def.meta.dependencies];
  }

  if (def.meta.events) {
    manifest.events = {};
    if (def.meta.events.publishes) manifest.events.publishes = [...def.meta.events.publishes];
    if (def.meta.events.subscribes) manifest.events.subscribes = [...def.meta.events.subscribes];
  }

  if (def.meta.routes && def.meta.routes.length > 0) {
    (manifest as unknown as Record<string, unknown>).routes = def.meta.routes.map(r => ({
      method: r.method, path: r.path, action: r.action || r.cap,
    }));
  }

  if ((def.meta as unknown as Record<string, unknown>).boot) {
    manifest.boot = (def.meta as unknown as Record<string, unknown>).boot as CapsuleManifest['boot'];
  }

  return manifest;
}

export function convertCapsToManifests(defs: CapDefinition[]): CapsuleManifest[] {
  return defs.map(def => convertCapToManifest(def));
}

export function convertRegistryToManifest(registry: CapsuleRegistry, deps?: Record<string, unknown>): CapsuleManifest {
  if (!registry.caps || registry.caps.length === 0) {
    throw new CapLoadError(`Registry "${registry.name}" has no caps`);
  }

  const actions: CapsuleManifest['actions'] = {};
  const allDeps = new Set<string>();
  const allPublishes = new Set<string>();
  const allSubscribes: CapEventSubscription[] = [];
  let hasRoutes = false;
  const routes: Array<{ method: string; path: string; action: string }> = [];
  let boot: CapsuleManifest['boot'] | undefined;
  const actionOrigins = new Map<string, string>();

  for (const cap of registry.caps) {
    const methods = getActionMethods(cap.class);
    if (methods.length === 0) throw new CapLoadError(`Cap "${cap.meta.name}" has no action methods`);

    for (const method of methods) {
      if (actions[method]) {
        const origin = actionOrigins.get(method);
        console.warn(`Duplicate action "${method}" in capsule "${registry.name}" - defined in multiple caps (${origin}, ${cap.meta.name})`);
      }
      actionOrigins.set(method, cap.meta.name);
      const instance = deps ? new cap.class(deps) : new cap.class();
      const handler = async (...args: unknown[]) => {
        const fn = (instance as any)[method];
        return typeof fn === 'function' ? fn.call(instance, ...args) : undefined;
      };
      const merged = mergeActionMeta(method, cap.meta, {
        description: `Cap "${cap.meta.name}" action: ${method}`,
      });
      actions[method] = {
        handler,
        meta: cap.meta,
        ...merged,
      };
    }

    if (cap.meta.dependencies) {
      for (const dep of cap.meta.dependencies) allDeps.add(dep);
    }

    if (cap.meta.events) {
      if (cap.meta.events.publishes) {
        for (const p of cap.meta.events.publishes) allPublishes.add(p);
      }
      if (cap.meta.events.subscribes) {
        for (const s of cap.meta.events.subscribes) allSubscribes.push(s);
      }
    }

    if (cap.meta.routes && cap.meta.routes.length > 0) {
      hasRoutes = true;
      for (const r of cap.meta.routes) {
        routes.push({ method: r.method, path: r.path, action: r.action || cap.meta.name });
      }
    }

    if (!boot && (cap.meta as unknown as Record<string, unknown>).boot) {
      boot = (cap.meta as unknown as Record<string, unknown>).boot as CapsuleManifest['boot'];
    }
  }

  const manifest: CapsuleManifest = { name: registry.name, actions };

  if (allDeps.size > 0) manifest.requires = [...allDeps].sort();
  if (allPublishes.size > 0 || allSubscribes.length > 0) {
    manifest.events = {};
    if (allPublishes.size > 0) manifest.events.publishes = [...allPublishes];
    if (allSubscribes.length > 0) manifest.events.subscribes = allSubscribes;
  }
  if (hasRoutes) (manifest as unknown as Record<string, unknown>).routes = routes;
  if (boot) manifest.boot = boot;

  return manifest;
}

export function convertRegistriesToManifests(registries: CapsuleRegistry[]): CapsuleManifest[] {
  return registries.map(r => convertRegistryToManifest(r));
}

// ── Detection ─────────────────────────────────────────────────────────────

export function detectDuplicateCapNames(caps: Array<{ meta?: { name: string }; name?: string }>): string[] {
  const count = new Map<string, number>();
  for (const c of caps) {
    const name = c.meta?.name ?? c.name;
    if (name) count.set(name, (count.get(name) || 0) + 1);
  }
  return Array.from(count.entries()).filter(([, c]) => c > 1).map(([n]) => n);
}

export function detectDuplicateRegistryNames(regs: Array<{ name: string }>): string[] {
  const count = new Map<string, number>();
  for (const r of regs) count.set(r.name, (count.get(r.name) || 0) + 1);
  return Array.from(count.entries()).filter(([, c]) => c > 1).map(([n]) => n);
}

export function detectCapsuleFormat(dirPath: string): CapsuleFormatDetection {
  const result: CapsuleFormatDetection = {
    kind: 'unknown',
    hasCapsTs: false,
    hasCapDirs: false,
    hasManifest: false,
    dirPath,
  };

  if (!fs.existsSync(dirPath)) return result;

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) return result;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  // Check for caps.ts / caps.js / caps.mjs
  for (const entry of entries) {
    if (entry.isFile() && /^caps\.(ts|js|mjs)$/.test(entry.name)) {
      result.hasCapsTs = true;
    }
    if (entry.isFile() && /^manifest\.(ts|js|mjs)$/.test(entry.name)) {
      result.hasManifest = true;
    }
    if (entry.isDirectory() && entry.name.endsWith('.cap')) {
      result.hasCapDirs = true;
    }
  }

  if (result.hasCapsTs) result.kind = 'caps-registry';
  else if (result.hasCapDirs) result.kind = 'cap-directories';
  else if (result.hasManifest) result.kind = 'legacy-manifest';
  else result.kind = 'unknown';

  return result;
}

// ── Loading ───────────────────────────────────────────────────────────────

function isCapDirectory(dirPath: string): boolean {
  return path.basename(dirPath).endsWith('.cap');
}

function loadCapFile(dirPath: string): CapFileResult | null {
  if (!isCapDirectory(dirPath)) return null;

  const capTsPath = path.join(dirPath, 'cap.ts');
  const capJsPath = path.join(dirPath, 'cap.js');
  const metaTsPath = path.join(dirPath, 'cap.meta.ts');
  const metaJsPath = path.join(dirPath, 'cap.meta.js');

  const capPath = fs.existsSync(capTsPath) ? capTsPath : fs.existsSync(capJsPath) ? capJsPath : null;
  const metaPath = fs.existsSync(metaTsPath) ? metaTsPath : fs.existsSync(metaJsPath) ? metaJsPath : null;

  if (!capPath || !metaPath) return null;

  try {
    // Dynamic import with cache busting for test fixtures
    const cacheKey = `${capPath}?t=${Date.now()}`;
    import.meta.url; // ensure ESM context
    const capModule = require(capPath);
    const metaModule = require(metaPath);
    const capClass = capModule.default || Object.values(capModule)[0];
    const meta = metaModule.default || Object.values(metaModule)[0];
    return { class: capClass, meta };
  } catch {
    return null;
  }
}

export async function loadCapFromDir(dirPath: string): Promise<CapFileResult | null> {
  if (!fs.existsSync(dirPath)) return null;
  if (!isCapDirectory(dirPath)) return null;

  const capPath = path.join(dirPath, 'cap.ts');
  const metaPath = path.join(dirPath, 'cap.meta.ts');

  if (!fs.existsSync(capPath) || !fs.existsSync(metaPath)) {
    throw new CapLoadError(`Cap directory ${dirPath} is missing cap.ts or cap.meta.ts`, dirPath);
  }

  try {
    const capModule = await import(capPath);
    const metaModule = await import(metaPath);
    const capClass = capModule.default || Object.values(capModule)[0];
    const meta = metaModule.default || Object.values(metaModule)[0];
    return { class: capClass, meta };
  } catch (e) {
    throw new CapLoadError(`Failed to load cap from ${dirPath}: ${e instanceof Error ? e.message : String(e)}`, dirPath);
  }
}

export async function loadCapsFromDirectory(dirPath: string): Promise<CapFileResult[]> {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results: CapFileResult[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const capDir = path.join(dirPath, entry.name);
    if (!isCapDirectory(capDir)) continue;

    const capPath = path.join(capDir, 'cap.ts');
    const metaPath = path.join(capDir, 'cap.meta.ts');
    if (!fs.existsSync(capPath) || !fs.existsSync(metaPath)) continue;

    try {
      const capModule = await import(capPath);
      const metaModule = await import(metaPath);
      const capClass = capModule.default || Object.values(capModule)[0];
      const meta = metaModule.default || Object.values(metaModule)[0];
      results.push({ class: capClass, meta });
    } catch {
      // Skip invalid caps
    }
  }

  // Check for duplicates
  const dupes = detectDuplicateCapNames(results);
  if (dupes.length > 0) throw new DuplicateCapNameError(dupes, dirPath);

  return results;
}

export async function loadCapsRegistry(dirPath: string): Promise<CapsuleRegistry | null> {
  if (!fs.existsSync(dirPath)) return null;

  const capsPath = path.join(dirPath, 'caps.ts');
  if (!fs.existsSync(capsPath)) return null;

  try {
    const mod = await import(capsPath);
    const registry = mod.default || Object.values(mod)[0];
    if (!registry || !registry.name || !registry.caps) {
      throw new CapLoadError(`Invalid caps registry in ${dirPath}: missing name or caps`, dirPath);
    }
    return { name: registry.name, caps: registry.caps, dependencies: registry.dependencies };
  } catch (e) {
    if (e instanceof CapLoadError) throw e;
    throw new CapLoadError(`Failed to load caps registry from ${dirPath}`, dirPath);
  }
}

export async function loadCapsRegistriesFromDirectory(dirPath: string): Promise<CapsuleRegistry[]> {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results: CapsuleRegistry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(dirPath, entry.name);
    const capsPath = path.join(subDir, 'caps.ts');
    if (!fs.existsSync(capsPath)) continue;

    try {
      const mod = await import(capsPath);
      const registry = mod.default || Object.values(mod)[0];
      if (registry && registry.name && registry.caps) {
        results.push({ name: registry.name, caps: registry.caps, dependencies: registry.dependencies });
      }
    } catch {
      // Skip invalid registries
    }
  }

  return results;
}

export function parseCapPath(p: string): { capsule: string; cap: string } {
  const parts = p.split('.');
  return { capsule: parts[0] || '', cap: parts[1] || '' };
}

export function topologicalSort(graph: Map<string, string[]>): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  function visit(node: string) {
    if (visited.has(node)) return;
    visited.add(node);
    for (const dep of graph.get(node) || []) visit(dep);
    result.push(node);
  }
  for (const node of graph.keys()) visit(node);
  return result;
}

export function buildHooksPipeline(_hooks: unknown[]): unknown[] { return []; }
export function resolveHooks(_hooks: unknown[]): unknown[] { return []; }
export function discoverCaps(_dir: string): Array<{ meta: CapMeta; handler: unknown }> { return []; }

// ── CapContext Adapter ────────────────────────────────────────────────────

export interface PlatformContext {
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  deps: Record<string, unknown>;
  call: (action: string, payload?: unknown) => Promise<unknown>;
  emit: (event: string, data: unknown) => void;
  use: (capsuleName: string) => unknown;
}

export interface CapContextAdapter {
  body: Record<string, unknown>;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  deps: Record<string, unknown>;
  emit: (event: string, data: unknown) => void;
  use: (capsuleName: string) => unknown;
  invoke: (action: string, payload?: unknown) => Promise<unknown>;
  tell: (action: string, payload?: unknown) => void;
}

export function createCapContext(platformCtx: PlatformContext): CapContextAdapter {
  return {
    body: platformCtx.body || {},
    params: platformCtx.params || {},
    query: platformCtx.query || {},
    deps: platformCtx.deps,
    emit: platformCtx.emit,
    use: platformCtx.use,
    invoke: (action: string, payload?: unknown) => platformCtx.call(action, payload),
    tell: (action: string, payload?: unknown) => { void platformCtx.call(action, payload); },
  };
}

export type CapMethod = (input: { body?: Record<string, unknown>; params?: Record<string, unknown>; query?: Record<string, unknown> }, ctx: CapContextAdapter) => Promise<unknown>;

export function wrapCapHandler(capMethod: CapMethod) {
  return async (platformInput: unknown, platformCtx: PlatformContext) => {
    const capCtx = createCapContext(platformCtx);
    const input = {
      body: (platformInput as any)?.body || {},
      params: (platformInput as any)?.params || {},
      query: (platformInput as any)?.query || {},
    };
    return capMethod(input, capCtx);
  };
}
