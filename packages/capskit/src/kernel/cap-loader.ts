/**
 * Cap Loader — Dynamic import and validation for cap.ts / cap.meta.ts files.
 *
 * Scans .cap directories, imports cap.ts (business logic class) and
 * cap.meta.ts (metadata contract), validates their exported shapes
 * against the CapClass and CapMeta interfaces, and returns CapDefinition
 * objects that the kernel can register.
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import {
  CapClass,
  CapMeta,
  CapDefinition,
  CapRoute,
  CapEventSubscription,
  CapsuleManifest,
  CapsuleRegistry,
  ActionDefinition,
  ActionContext,
  CapContext,
  CapInvokePayload,
  CapTellPayload,
  ActionInput,
} from '../types';

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class CapLoadError extends Error {
  constructor(message: string, public readonly filePath?: string) {
    super(message);
    this.name = 'CapLoadError';
  }
}

/**
 * Error thrown when duplicate cap names are detected.
 */
export class DuplicateCapNameError extends CapLoadError {
  public readonly duplicates: string[];

  constructor(duplicates: string[], context: string) {
    const names = duplicates.join(', ');
    super(
      `Duplicate cap name(s) detected in ${context}: ${names}. ` +
        `Each cap must have a unique name within its capsule/context.`
    );
    this.name = 'DuplicateCapNameError';
    this.duplicates = duplicates;
  }
}

/**
 * Error thrown when a dependency cycle is detected between caps.
 */
export class CapCycleError extends CapLoadError {
  public readonly cycle: string[];

  constructor(cycle: string[], context: string) {
    const cycleStr = cycle.join(' → ');
    super(
      `Dependency cycle detected in ${context}: ${cycleStr}. ` +
        `Caps cannot depend on each other circularly.`
    );
    this.name = 'CapCycleError';
    this.cycle = cycle;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that an exported value is a valid CapMeta object.
 * Throws CapLoadError on any structural issue.
 */
export function validateCapMeta(meta: any, filePath: string): CapMeta {
  if (!meta || typeof meta !== 'object') {
    throw new CapLoadError(
      `cap.meta.ts at "${filePath}" must export an object (got ${typeof meta}).`,
      filePath,
    );
  }

  if (typeof meta.name !== 'string' || !meta.name.trim()) {
    throw new CapLoadError(
      `cap.meta.ts at "${filePath}" has invalid "name": must be a non-empty string.`,
      filePath,
    );
  }

  // Validate name format (alphanumeric, dashes, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(meta.name)) {
    throw new CapLoadError(
      `cap.meta.ts "${meta.name}" has invalid name format. ` +
        `Names must match /^[a-zA-Z0-9_-]+$/.`,
      filePath,
    );
  }

  // Validate routes if present
  if (meta.routes !== undefined) {
    if (!Array.isArray(meta.routes)) {
      throw new CapLoadError(
        `cap.meta.ts at "${filePath}": "routes" must be an array.`,
        filePath,
      );
    }
    for (let i = 0; i < meta.routes.length; i++) {
      const route = meta.routes[i];
      if (!route || typeof route !== 'object') {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": routes[${i}] must be an object.`,
          filePath,
        );
      }
      if (!route.method || !['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(route.method)) {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": routes[${i}].method must be a valid HTTP method (got "${route.method}").`,
          filePath,
        );
      }
      if (typeof route.path !== 'string' || !route.path) {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": routes[${i}].path must be a non-empty string.`,
          filePath,
        );
      }
      if (typeof route.action !== 'string' || !route.action) {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": routes[${i}].action must be a non-empty string.`,
          filePath,
        );
      }
    }
  }

  // Validate events if present
  if (meta.events !== undefined) {
    if (typeof meta.events !== 'object' || Array.isArray(meta.events)) {
      throw new CapLoadError(
        `cap.meta.ts at "${filePath}": "events" must be an object.`,
        filePath,
      );
    }

    if (meta.events.publishes !== undefined) {
      if (!Array.isArray(meta.events.publishes)) {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": events.publishes must be an array.`,
          filePath,
        );
      }
      for (const ev of meta.events.publishes) {
        if (typeof ev !== 'string' || !ev) {
          throw new CapLoadError(
            `cap.meta.ts at "${filePath}": events.publishes contains an invalid event name.`,
            filePath,
          );
        }
      }
    }

    if (meta.events.subscribes !== undefined) {
      if (!Array.isArray(meta.events.subscribes)) {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": events.subscribes must be an array.`,
          filePath,
        );
      }
      for (let i = 0; i < meta.events.subscribes.length; i++) {
        const sub = meta.events.subscribes[i];
        if (!sub || typeof sub !== 'object') {
          throw new CapLoadError(
            `cap.meta.ts at "${filePath}": events.subscribes[${i}] must be an object with event and action.`,
            filePath,
          );
        }
        if (typeof sub.event !== 'string' || !sub.event) {
          throw new CapLoadError(
            `cap.meta.ts at "${filePath}": events.subscribes[${i}].event must be a non-empty string.`,
            filePath,
          );
        }
        if (typeof sub.action !== 'string' || !sub.action) {
          throw new CapLoadError(
            `cap.meta.ts at "${filePath}": events.subscribes[${i}].action must be a non-empty string.`,
            filePath,
          );
        }
      }
    }
  }

  // Validate dependencies if present
  if (meta.dependencies !== undefined) {
    if (!Array.isArray(meta.dependencies)) {
      throw new CapLoadError(
        `cap.meta.ts at "${filePath}": "dependencies" must be an array of strings.`,
        filePath,
      );
    }
    for (const dep of meta.dependencies) {
      if (typeof dep !== 'string' || !dep) {
        throw new CapLoadError(
          `cap.meta.ts at "${filePath}": dependencies must be non-empty strings.`,
          filePath,
        );
      }
    }
  }

  return meta;
}

/**
 * Validate that an exported value is a valid CapClass constructor.
 * A valid CapClass must be an instantiable class (function with prototype methods).
 * Throws CapLoadError on any issue.
 */
export function validateCapClass(
  exportedValue: any,
  filePath: string,
): new (...args: any[]) => CapClass {
  if (!exportedValue) {
    throw new CapLoadError(
      `cap.ts at "${filePath}" does not export a class. ` +
        `Expected a default or named 'cap' export that is an instantiable class.`,
      filePath,
    );
  }

  // Must be a function (class)
  if (typeof exportedValue !== 'function') {
    throw new CapLoadError(
      `cap.ts at "${filePath}" must export a class (got ${typeof exportedValue}). ` +
        `Expected an instantiable class with action handler methods.`,
      filePath,
    );
  }

  // Heuristic: a class has a prototype with at least one method
  // and its name starts with uppercase (convention) or has explicit prototype methods
  const proto = exportedValue.prototype;
  if (!proto) {
    throw new CapLoadError(
      `cap.ts at "${filePath}" exported function is not constructable (missing prototype). ` +
        `Expected a class.`,
      filePath,
    );
  }

  // Check that the class has at least one public method (excluding constructor)
  const methodNames = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && typeof proto[n] === 'function',
  );

  // Also check inherited methods via getOwnPropertyNames on the class itself
  // and methods defined on the prototype chain
  if (methodNames.length === 0) {
    // Check if there are any methods at all (including inherited)
    const allKeys: string[] = [];
    for (const key of Object.keys(proto)) {
      if (key !== 'constructor' && typeof proto[key] === 'function') {
        allKeys.push(key);
      }
    }
    if (allKeys.length === 0) {
      throw new CapLoadError(
        `cap.ts at "${filePath}" has no public action methods. ` +
          `A CapClass must have at least one async method (e.g., async sum(input, ctx)).`,
        filePath,
      );
    }
  }

  // Verify that the class can be instantiated
  try {
    const instance = new exportedValue();
    if (!instance || typeof instance !== 'object') {
      throw new CapLoadError(
        `cap.ts at "${filePath}" constructor did not return an object.`,
        filePath,
      );
    }
  } catch (err: any) {
    // If constructor requires arguments, that's fine — but other errors are not
    if (err instanceof CapLoadError) throw err;
    // Constructor may throw if it requires args; we allow that since the kernel
    // will provide dependencies at construction time, but log the error for debugging.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[CapLoader] Constructor validation skipped for "${filePath}" (constructor requires args): ${message}`
    );
  }

  return exportedValue as new (...args: any[]) => CapClass;
}

// ---------------------------------------------------------------------------
// Duplicate name detection
// ---------------------------------------------------------------------------

/**
 * Detect duplicate cap names from an array of CapMeta objects.
 * Returns an array of names that appear more than once, or empty array if all unique.
 */
export function detectDuplicateCapNames(metas: CapMeta[]): string[] {
  const nameCounts = new Map<string, number>();
  for (const meta of metas) {
    const name = meta.name;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  const duplicates: string[] = [];
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      duplicates.push(name);
    }
  }
  return duplicates;
}

/**
 * Detect duplicate capsule names across multiple CapsuleRegistries.
 * Returns array of duplicate names, or empty if all unique.
 */
export function detectDuplicateRegistryNames(registries: CapsuleRegistry[]): string[] {
  const nameCounts = new Map<string, number>();
  for (const reg of registries) {
    const name = reg.name;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  const duplicates: string[] = [];
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      duplicates.push(name);
    }
  }
  return duplicates;
}

// ---------------------------------------------------------------------------
// Cycle detection for inter-cap dependencies
// ---------------------------------------------------------------------------

/**
 * Detect dependency cycles among caps within a CapsuleRegistry.
 *
 * Caps can declare dependencies on other caps within the same registry via
 * `CapMeta.dependencies`. This function checks that the resulting dependency
 * graph is acyclic.
 *
 * Returns an array representing the cycle path if found, or null if acyclic.
 */
export function detectCapCycle(caps: CapDefinition[]): string[] | null {
  // Build a map of cap name -> set of cap names it depends on
  const capNames = new Set(caps.map((c) => c.meta.name));
  const adjacency = new Map<string, Set<string>>();

  for (const cap of caps) {
    const deps = cap.meta.dependencies || [];
    const depSet = new Set<string>();
    for (const dep of deps) {
      // Only consider dependencies that are other caps within the same registry
      if (capNames.has(dep)) {
        depSet.add(dep);
      }
    }
    adjacency.set(cap.meta.name, depSet);
  }

  // Use DFS to detect cycles
  const WHITE = 0; // unvisited
  const GRAY = 1;  // in progress (on current DFS path)
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  for (const name of capNames) {
    color.set(name, WHITE);
  }

  // Track the current DFS path for cycle reporting
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    path.push(node);

    const neighbors = adjacency.get(node) || new Set();
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);
      if (neighborColor === GRAY) {
        // Found a cycle: extract the cycle from the path
        const cycleStart = path.indexOf(neighbor);
        const cycle = [...path.slice(cycleStart), neighbor];
        return cycle;
      }
      if (neighborColor === WHITE) {
        const result = dfs(neighbor);
        if (result) return result;
      }
    }

    path.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const name of capNames) {
    if (color.get(name) === WHITE) {
      const cycle = dfs(name);
      if (cycle) return cycle;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dynamic import helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the module export from a dynamic import.
 *
 * Convention:
 * - cap.ts  → looks for `default` export first, then named `cap`
 * - cap.meta.ts → looks for `default` export first, then named `meta`
 */
function resolveExport(module: any, filePath: string, kind: 'class' | 'meta'): any {
  const namedExport = kind === 'class' ? 'cap' : 'meta';
  const label = kind === 'class' ? 'cap.ts' : 'cap.meta.ts';

  // Prefer default export
  if (module.default !== undefined && module.default !== null) {
    return module.default;
  }

  // Fallback to named export
  if (module[namedExport] !== undefined && module[namedExport] !== null) {
    return module[namedExport];
  }

  // For cap.ts, also try 'Cap' as a named export
  if (kind === 'class' && module.Cap !== undefined && module.Cap !== null) {
    return module.Cap;
  }

  // For cap.meta.ts, also try 'capMeta' as a named export
  if (kind === 'meta' && module.capMeta !== undefined && module.capMeta !== null) {
    return module.capMeta;
  }

  throw new CapLoadError(
    `${label} at "${filePath}" does not export a ${kind === 'class' ? 'class (default or named "cap")' : 'CapMeta object (default or named "meta")'}.`,
    filePath,
  );
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Find the cap.ts / cap.meta.ts file in a directory, trying .ts, .js, .mjs extensions.
 */
function findCapFile(dirPath: string, baseName: string): string | null {
  const extensions = ['.ts', '.js', '.mjs', '.cjs'];

  for (const ext of extensions) {
    const candidate = path.resolve(dirPath, `${baseName}${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Load a single cap from a directory
// ---------------------------------------------------------------------------

/**
 * Load a single Cap from a directory.
 *
 * Looks for cap.ts (business logic class) and cap.meta.ts (metadata contract)
 * inside the given directory. Validates exports and returns a CapDefinition.
 *
 * @param dirPath - Absolute path to the cap directory (e.g., ".../calculator.cap")
 * @returns CapDefinition or null if the directory is not a cap directory
 * @throws CapLoadError for malformed or missing files
 */
export async function loadCapFromDir(dirPath: string): Promise<CapDefinition | null> {
  // Find files
  const capTsPath = findCapFile(dirPath, 'cap');
  const capMetaPath = findCapFile(dirPath, 'cap.meta');

  // Both files must exist
  if (!capTsPath && !capMetaPath) {
    // Not a cap directory — no cap.* files at all
    return null;
  }

  if (!capTsPath) {
    throw new CapLoadError(
      `Cap directory "${dirPath}" is missing cap.ts (or cap.js). ` +
        `A .cap directory must contain both cap.ts and cap.meta.ts.`,
      dirPath,
    );
  }

  if (!capMetaPath) {
    throw new CapLoadError(
      `Cap directory "${dirPath}" is missing cap.meta.ts (or cap.meta.js). ` +
        `A .cap directory must contain both cap.ts and cap.meta.ts.`,
      dirPath,
    );
  }

  // ── Load cap.ts (business logic class) ──────────────────────

  let capClassExport: any;
  try {
    const capModule = await import(pathToFileURL(capTsPath).href);
    capClassExport = resolveExport(capModule, capTsPath, 'class');
  } catch (err: any) {
    if (err instanceof CapLoadError) throw err;
    throw new CapLoadError(
      `Failed to load cap.ts at "${capTsPath}": ${err.message}`,
      capTsPath,
    );
  }

  const capClass = validateCapClass(capClassExport, capTsPath);

  // ── Load cap.meta.ts (metadata contract) ────────────────────

  let capMetaExport: any;
  try {
    const metaModule = await import(pathToFileURL(capMetaPath).href);
    capMetaExport = resolveExport(metaModule, capMetaPath, 'meta');
  } catch (err: any) {
    if (err instanceof CapLoadError) throw err;
    throw new CapLoadError(
      `Failed to load cap.meta.ts at "${capMetaPath}": ${err.message}`,
      capMetaPath,
    );
  }

  const capMeta = validateCapMeta(capMetaExport, capMetaPath);

  // ── Cross-validate: meta actions must exist on class ────────

  // Check that route actions reference existing class methods
  if (capMeta.routes) {
    const instance = new capClass();
    for (const route of capMeta.routes) {
      if (typeof (instance as any)[route.action] !== 'function') {
        throw new CapLoadError(
          `cap.meta.ts at "${capMetaPath}" references route action "${route.action}" ` +
            `which does not exist on the CapClass. ` +
            `Available methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter(n => n !== 'constructor').join(', ') || '(none)'}`,
          capMetaPath,
        );
      }
    }
  }

  // Check that event subscription actions reference existing class methods
  if (capMeta.events?.subscribes) {
    const instance = new capClass();
    for (const sub of capMeta.events.subscribes) {
      if (typeof (instance as any)[sub.action] !== 'function') {
        throw new CapLoadError(
          `cap.meta.ts at "${capMetaPath}" subscribes to event "${sub.event}" ` +
            `with action "${sub.action}" which does not exist on the CapClass. ` +
            `Available methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter(n => n !== 'constructor').join(', ') || '(none)'}`,
          capMetaPath,
        );
      }
    }
  }

  return { class: capClass, meta: capMeta };
}

// ---------------------------------------------------------------------------
// Scan a directory for .cap subdirectories
// ---------------------------------------------------------------------------

/**
 * Discover and load caps from .cap directories inside a root folder.
 *
 * Scans the given root directory for subdirectories whose name ends with ".cap"
 * (e.g., "calculator.cap", "auth.cap") and loads the cap from each one.
 *
 * Only directories that contain both cap.ts and cap.meta.ts are loaded.
 * Directories missing either file are reported as errors.
 *
 * @param rootDir - Absolute path to scan for .cap subdirectories
 * @returns Array of loaded CapDefinition objects
 *
 * @example
 * ```ts
 * // Given:
 * // src/caps/
 * //   calculator.cap/
 * //     cap.ts
 * //     cap.meta.ts
 * //   auth.cap/
 * //     cap.ts
 * //     cap.meta.ts
 *
 * const caps = await loadCapsFromDirectory('./src/caps');
 * // Returns [CapDefinition, CapDefinition]
 * ```
 */
export async function loadCapsFromDirectory(rootDir: string): Promise<CapDefinition[]> {
  const definitions: CapDefinition[] = [];

  if (!fs.existsSync(rootDir)) {
    return definitions;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  // Collect errors to report all at once (fail-fast but comprehensive)
  const errors: CapLoadError[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.cap')) {
      continue;
    }

    const dirPath = path.resolve(rootDir, entry.name);

    try {
      const capDef = await loadCapFromDir(dirPath);
      if (capDef) {
        definitions.push(capDef);
      }
    } catch (err: any) {
      if (err instanceof CapLoadError) {
        errors.push(err);
      } else {
        errors.push(
          new CapLoadError(
            `Unexpected error loading cap from "${dirPath}": ${err.message}`,
            dirPath,
          ),
        );
      }
    }
  }

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.message}`).join('\n');
    throw new CapLoadError(
      `Failed to load ${errors.length} cap(s):\n${messages}`,
    );
  }

  // ── Cross-cap validation: duplicate names ──────────────────
  const metas = definitions.map((d) => d.meta);
  const duplicates = detectDuplicateCapNames(metas);
  if (duplicates.length > 0) {
    throw new DuplicateCapNameError(
      duplicates,
      `directory \"${rootDir}\"`,
    );
  }

  return definitions;
}

// ---------------------------------------------------------------------------
// CapContext Adapter — Bridge between CapClass methods and kernel ActionContext
// ---------------------------------------------------------------------------

/**
 * Creates a CapContext from a kernel ActionContext.
 *
 * CapClass methods expect a CapContext (with invoke/tell), but the kernel
 * provides an ActionContext (with call). This adapter bridges the two:
 * - `invoke` → maps to `context.call` (request/response)
 * - `tell` → maps to `context.call` but fire-and-forget (no await)
 * - `emit`, `use`, `deps`, `body`, `params`, `query` pass through directly
 *
 * @param platformContext - The ActionContext provided by the kernel
 * @returns A CapContext suitable for passing to CapClass methods
 */
export function createCapContext(platformContext: ActionContext): CapContext {
  return {
    // Transport-agnostic input (pass through)
    body: platformContext.body,
    params: platformContext.params,
    query: platformContext.query ?? {},

    // Dependency injection (pass through)
    deps: platformContext.deps,

    // invoke → call (request/response)
    invoke: (action: string, payload: CapInvokePayload) => {
      // The kernel's call() expects either structured {body,params,query} or plain payload.
      // We pass the CapInvokePayload directly — call() normalizes it internally.
      return platformContext.call(action, payload);
    },

    // tell → call but fire-and-forget (no response expected)
    tell: (action: string, payload: CapTellPayload) => {
      // Fire and forget: we intentionally do not await or return the promise.
      // Errors are caught and logged to avoid unhandled rejections.
      platformContext.call(action, payload).catch((err: any) => {
        console.error(
          `[CapContext] tell("${action}") failed:`,
          err instanceof Error ? err.message : String(err),
        );
      });
    },

    // Event emission (pass through)
    emit: platformContext.emit,

    // Typed capsule proxy (pass through)
    use: platformContext.use,
  };
}

/**
 * Wraps a CapClass method so it receives a CapContext instead of ActionContext.
 *
 * The kernel calls action handlers with `(input: ActionInput, context: ActionContext)`.
 * CapClass methods expect `(input: ActionInput, context: CapContext)`.
 * This wrapper adapts the context using {@link createCapContext}.
 *
 * @param method - The bound CapClass method to wrap
 * @returns An ActionHandler compatible with the kernel
 */
export function wrapCapHandler(
  method: (input: ActionInput, ctx: CapContext) => Promise<any>,
): (input: ActionInput, ctx: ActionContext) => Promise<any> {
  return (input: ActionInput, ctx: ActionContext): Promise<any> => {
    const capContext = createCapContext(ctx);
    return method(input, capContext);
  };
}

// ---------------------------------------------------------------------------
// Convert CapDefinition to CapsuleManifest (for kernel integration)
// ---------------------------------------------------------------------------

/**
 * Convert a single CapDefinition into a CapsuleManifest.
 *
 * The CapClass methods become action handlers, and the CapMeta fields
 * are mapped to the CapsuleManifest shape.
 *
 * Note: The handler functions are bound to a new CapClass instance.
 * String handlers are NOT supported in cap mode — all handlers are
 * direct method references.
 *
 * @param capDef - The loaded CapDefinition
 * @param capsuleName - The capsule name to use (defaults to cap.meta.name)
 * @returns A CapsuleManifest compatible with CapsKit.registerCapsule()
 */
export function convertCapToManifest(
  capDef: CapDefinition,
  capsuleName?: string,
): CapsuleManifest {
  const { class: CapClassCtor, meta } = capDef;
  const instance = new CapClassCtor();
  const capName = capsuleName || meta.name;

  // Build actions from class methods
  const actions: Record<string, ActionDefinition> = {};
  const proto = Object.getPrototypeOf(instance);
  const methodNames = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && typeof (instance as any)[n] === 'function',
  );

  for (const methodName of methodNames) {
    actions[methodName] = {
      handler: wrapCapHandler((instance as any)[methodName].bind(instance)),
      description: `Cap "${capName}" action: ${methodName}`,
    };
  }

  if (Object.keys(actions).length === 0) {
    throw new CapLoadError(
      `Cap "${capName}" has no action methods to register.`,
    );
  }

  // Build manifest
  const manifest: CapsuleManifest = {
    name: capName,
    actions,
  };

  // Map dependencies from CapMeta
  if (meta.dependencies && meta.dependencies.length > 0) {
    manifest.requires = meta.dependencies;
  }

  // Map events
  if (meta.events) {
    manifest.events = {};
    if (meta.events.publishes) {
      manifest.events.publishes = meta.events.publishes;
    }
    if (meta.events.subscribes) {
      manifest.events.subscribes = meta.events.subscribes.map((sub) => ({
        event: sub.event,
        action: sub.action,
      }));
    }
  }

  // Map routes (adapter-specific, stored as extra manifest keys)
  if (meta.routes && meta.routes.length > 0) {
    (manifest as any).routes = meta.routes;
  }

  return manifest;
}

/**
 * Convert an array of CapDefinitions into an array of CapsuleManifests.
 * Each cap becomes its own "capsule" (one-to-one mapping).
 */
export function convertCapsToManifests(capDefs: CapDefinition[]): CapsuleManifest[] {
  return capDefs.map((def) => convertCapToManifest(def));
}

// ---------------------------------------------------------------------------
// Load caps.ts registry file (CapsuleRegistry)
// ---------------------------------------------------------------------------

/**
 * Resolve the export from a caps.ts module.
 *
 * Convention:
 * - Looks for `default` export first, then named `capsule` or `registry`.
 */
function resolveRegistryExport(module: any, filePath: string): any {
  // Prefer default export
  if (module.default !== undefined && module.default !== null) {
    return module.default;
  }

  // Fallback to named exports
  if (module.capsule !== undefined && module.capsule !== null) {
    return module.capsule;
  }

  if (module.registry !== undefined && module.registry !== null) {
    return module.registry;
  }

  throw new CapLoadError(
    `caps.ts at "${filePath}" does not export a CapsuleRegistry (default or named "capsule" / "registry").`,
    filePath,
  );
}

/**
 * Validate that an exported value conforms to the CapsuleRegistry shape.
 * Throws CapLoadError on any structural issue.
 */
export function validateCapsuleRegistry(registry: any, filePath: string): CapsuleRegistry {
  if (!registry || typeof registry !== 'object') {
    throw new CapLoadError(
      `caps.ts at "${filePath}" must export an object (got ${typeof registry}).`,
      filePath,
    );
  }

  if (typeof registry.name !== 'string' || !registry.name.trim()) {
    throw new CapLoadError(
      `caps.ts at "${filePath}" has invalid "name": must be a non-empty string.`,
      filePath,
    );
  }

  // Validate name format (same rules as CapMeta name)
  if (!/^[a-zA-Z0-9_-]+$/.test(registry.name)) {
    throw new CapLoadError(
      `caps.ts "${registry.name}" has invalid name format. ` +
        `Names must match /^[a-zA-Z0-9_-]+$/.`,
      filePath,
    );
  }

  if (!Array.isArray(registry.caps)) {
    throw new CapLoadError(
      `caps.ts at "${filePath}" must export a "caps" array of CapDefinitions.`,
      filePath,
    );
  }

  if (registry.caps.length === 0) {
    throw new CapLoadError(
      `caps.ts at "${filePath}" has an empty "caps" array. At least one CapDefinition is required.`,
      filePath,
    );
  }

  // Validate each entry in the caps array
  for (let i = 0; i < registry.caps.length; i++) {
    const capDef = registry.caps[i];
    if (!capDef || typeof capDef !== 'object') {
      throw new CapLoadError(
        `caps.ts at "${filePath}": caps[${i}] must be a CapDefinition object.`,
        filePath,
      );
    }
    if (typeof capDef.class !== 'function') {
      throw new CapLoadError(
        `caps.ts at "${filePath}": caps[${i}].class must be an instantiable class (got ${typeof capDef.class}).`,
        filePath,
      );
    }
    if (!capDef.meta || typeof capDef.meta !== 'object') {
      throw new CapLoadError(
        `caps.ts at "${filePath}": caps[${i}].meta must be a CapMeta object.`,
        filePath,
      );
    }
    // Inline-validate the cap's meta and class
    validateCapMeta(capDef.meta, `${filePath} → caps[${i}].meta`);
    validateCapClass(capDef.class, `${filePath} → caps[${i}].class`);
  }

  // ── Cross-cap validation: duplicate names ──────────────────
  const metas: CapMeta[] = registry.caps.map((c: CapDefinition) => c.meta);
  const duplicates = detectDuplicateCapNames(metas);
  if (duplicates.length > 0) {
    throw new DuplicateCapNameError(
      duplicates,
      `capsule "${registry.name}" (${filePath})`,
    );
  }

  // ── Cross-cap validation: dependency cycles ────────────────
  const cycle = detectCapCycle(registry.caps);
  if (cycle) {
    throw new CapCycleError(
      cycle,
      `capsule "${registry.name}" (${filePath})`,
    );
  }

  return registry as CapsuleRegistry;
}

/**
 * Load a CapsuleRegistry from a caps.ts (or caps.js) file in a directory.
 *
 * Looks for `caps.ts` (or `caps.js`, `caps.mjs`, `caps.cjs`) inside the
 * given directory, dynamically imports it, validates the exported
 * CapsuleRegistry shape, and returns it.
 *
 * Falls back to `null` when no caps.* file is found — callers can then
 * attempt alternative loading strategies (e.g., scanning for .cap
 * subdirectories).
 *
 * @param dirPath - Absolute path to the capsule root directory
 * @returns CapsuleRegistry or null if no caps.* file exists
 * @throws CapLoadError for malformed exports
 *
 * @example
 * ```ts
 * const registry = await loadCapsRegistry('./src/capsules/calculator');
 * if (registry) {
 *   console.log(registry.name); // 'calculator'
 *   console.log(registry.caps.length); // 2
 * }
 * ```
 */
export async function loadCapsRegistry(dirPath: string): Promise<CapsuleRegistry | null> {
  const capsPath = findCapFile(dirPath, 'caps');

  if (!capsPath) {
    // No caps.ts file — graceful fallback
    return null;
  }

  let registryExport: any;
  try {
    const module = await import(pathToFileURL(capsPath).href);
    registryExport = resolveRegistryExport(module, capsPath);
  } catch (err: any) {
    if (err instanceof CapLoadError) throw err;
    throw new CapLoadError(
      `Failed to load caps.ts at "${capsPath}": ${err.message}`,
      capsPath,
    );
  }

  return validateCapsuleRegistry(registryExport, capsPath);
}

/**
 * Convert a CapsuleRegistry into a single CapsuleManifest.
 *
 * Merges all CapDefinitions in the registry into one manifest:
 * - **Actions**: Action methods from every cap class are combined into a
 *   single `actions` record. Cap name prefixes are NOT added by default;
 *   if multiple caps define the same method name, a warning is emitted
 *   and the last one wins.
 * - **Routes**: Routes from all caps' meta are concatenated.
 * - **Events**: Publishes and subscribes are merged (duplicates removed).
 * - **Dependencies**: `requires` is built from the union of all caps'
 *   dependencies.
 *
 * @param registry - The CapsuleRegistry to convert
 * @returns A CapsuleManifest ready for kernel registration
 *
 * @example
 * ```ts
 * const registry = await loadCapsRegistry('./calculator');
 * const manifest = convertRegistryToManifest(registry);
 * // manifest.name === 'calculator'
 * // manifest.actions.sum, manifest.actions.multiply, ...
 * ```
 */
export function convertRegistryToManifest(registry: CapsuleRegistry): CapsuleManifest {
  const { name, caps } = registry;

  const allActions: Record<string, ActionDefinition> = {};
  const allRoutes: CapRoute[] = [];
  const allPublishes: Set<string> = new Set();
  const allSubscribes: CapEventSubscription[] = [];
  const allDependencies: Set<string> = new Set();

  for (const capDef of caps) {
    const { class: CapClassCtor, meta } = capDef;
    const instance = new CapClassCtor();
    const proto = Object.getPrototypeOf(instance);
    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor' && typeof (instance as any)[n] === 'function',
    );

    // Register actions for this cap
    for (const methodName of methodNames) {
      if (allActions[methodName]) {
        // Duplicate action name across caps — last wins (as documented)
        console.warn(
          `[CapLoader] Action "${methodName}" defined in multiple caps within ` +
          `capsule "${name}". The last definition will be used.`,
        );
      }
      allActions[methodName] = {
        handler: wrapCapHandler((instance as any)[methodName].bind(instance)),
        description: `Cap "${meta.name}" action: ${methodName}`,
      };
    }

    // Merge routes
    if (meta.routes && meta.routes.length > 0) {
      allRoutes.push(...meta.routes);
    }

    // Merge events
    if (meta.events) {
      if (meta.events.publishes) {
        for (const ev of meta.events.publishes) {
          allPublishes.add(ev);
        }
      }
      if (meta.events.subscribes) {
        allSubscribes.push(...meta.events.subscribes);
      }
    }

    // Merge dependencies
    if (meta.dependencies) {
      for (const dep of meta.dependencies) {
        allDependencies.add(dep);
      }
    }
  }

  if (Object.keys(allActions).length === 0) {
    throw new CapLoadError(
      `CapsuleRegistry "${name}" has no action methods across its caps.`,
    );
  }

  const manifest: CapsuleManifest = {
    name,
    actions: allActions,
  };

  // Attach dependencies (union)
  if (allDependencies.size > 0) {
    manifest.requires = [...allDependencies];
  }

  // Attach events
  if (allPublishes.size > 0 || allSubscribes.length > 0) {
    manifest.events = {};
    if (allPublishes.size > 0) {
      manifest.events.publishes = [...allPublishes];
    }
    if (allSubscribes.length > 0) {
      manifest.events.subscribes = allSubscribes.map((sub) => ({
        event: sub.event,
        action: sub.action,
      }));
    }
  }

  // Attach routes
  if (allRoutes.length > 0) {
    (manifest as any).routes = allRoutes;
  }

  return manifest;
}

/**
 * Convert an array of CapsuleRegistries into an array of CapsuleManifests.
 * Each registry becomes its own capsule manifest.
 */
export function convertRegistriesToManifests(registries: CapsuleRegistry[]): CapsuleManifest[] {
  return registries.map((reg) => convertRegistryToManifest(reg));
}

/**
 * Scan a directory for capsule subdirectories that contain a caps.ts
 * registry file, load each registry, and return them.
 *
 * This is the "caps.ts registry" loading strategy. Directories that do
 * NOT contain a caps.ts file are silently skipped — callers can choose
 * to fall back to `.cap` directory scanning for those.
 *
 * @param rootDir - Absolute path to scan for capsule directories
 * @returns Array of loaded CapsuleRegistry objects
 *
 * @example
 * ```ts
 * // Given:
 * // src/capsules/
 * //   calculator/
 * //     caps.ts          ← exports CapsuleRegistry
 * //     cap/
 * //       sum.cap.ts
 * //       sum.cap.meta.ts
 * //   auth/
 * //     caps.ts          ← exports CapsuleRegistry
 * //   legacy/
 * //     manifest.ts      ← not a caps.ts, skipped
 *
 * const registries = await loadCapsRegistriesFromDirectory('./src/capsules');
 * // Returns [calculatorRegistry, authRegistry]
 * ```
 */
export async function loadCapsRegistriesFromDirectory(
  rootDir: string,
): Promise<CapsuleRegistry[]> {
  const registries: CapsuleRegistry[] = [];

  if (!fs.existsSync(rootDir)) {
    return registries;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  // Collect errors to report all at once
  const errors: CapLoadError[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = path.resolve(rootDir, entry.name);

    try {
      const registry = await loadCapsRegistry(dirPath);
      if (registry) {
        registries.push(registry);
      }
    } catch (err: any) {
      if (err instanceof CapLoadError) {
        errors.push(err);
      } else {
        errors.push(
          new CapLoadError(
            `Unexpected error loading caps.ts from "${dirPath}": ${err.message}`,
            dirPath,
          ),
        );
      }
    }
  }

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.message}`).join('\n');
    throw new CapLoadError(
      `Failed to load ${errors.length} caps.ts registries:\n${messages}`,
    );
  }

  // ── Cross-registry validation: duplicate names ─────────────
  const dupRegNames = detectDuplicateRegistryNames(registries);
  if (dupRegNames.length > 0) {
    throw new DuplicateCapNameError(
      dupRegNames,
      `directory "${rootDir}" (capsule registries)`,
    );
  }

  return registries;
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export { CapLoadError };
