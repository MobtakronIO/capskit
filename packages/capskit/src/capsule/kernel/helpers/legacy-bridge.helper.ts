import * as fs from 'fs';
import * as path from 'path';
import { CapLoadError } from '../errors';

// ── Errors ────────────────────────────────────────────────────────────────

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

  const fn = capClass as Function;
  if (!fn.prototype) throw new CapLoadError('Cap must be a class, not an arrow function', filePath);

  const methodNames = Object.getOwnPropertyNames(fn.prototype).filter(n => n !== 'constructor');
  if (methodNames.length === 0) throw new CapLoadError('Cap class must have at least one method', filePath);
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

// ── Detection ─────────────────────────────────────────────────────────────

export function detectDuplicateCapNames(caps: Array<{ meta?: { name: string }; name?: string }>): string[] {
  const count = new Map<string, number>();
  for (const c of caps) {
    const name = c.meta?.name ?? c.name;
    if (name) count.set(name, (count.get(name) || 0) + 1);
  }
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

  for (const entry of entries) {
    if (entry.isFile() && /^manifest\.(ts|js|mjs)$/.test(entry.name)) {
      result.hasManifest = true;
    }
    if (entry.isDirectory() && entry.name.endsWith('.cap')) {
      result.hasCapDirs = true;
    }
  }

  if (result.hasCapDirs) result.kind = 'cap-directories';
  else if (result.hasManifest) result.kind = 'legacy-manifest';
  else result.kind = 'unknown';

  return result;
}


// ── Loading ───────────────────────────────────────────────────────────────

function isCapDirectory(dirPath: string): boolean {
  return path.basename(dirPath).endsWith('.cap');
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

  const dupes = detectDuplicateCapNames(results);
  if (dupes.length > 0) throw new DuplicateCapNameError(dupes, dirPath);

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
  call: ((action: string, payload?: unknown) => Promise<unknown>);
}

export function createCapContext(platformCtx: PlatformContext): CapContextAdapter {
  return {
    body: platformCtx.body || {},
    params: platformCtx.params || {},
    query: platformCtx.query || {},
    deps: platformCtx.deps,
    emit: platformCtx.emit,
    use: platformCtx.use,
    call: (action: string, payload?: unknown) => platformCtx.call(action, payload),
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
