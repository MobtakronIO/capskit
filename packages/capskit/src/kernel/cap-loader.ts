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
  ActionDefinition,
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

  return meta as CapMeta;
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
    // will provide dependencies at construction time.
  }

  return exportedValue as new (...args: any[]) => CapClass;
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

  return definitions;
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
      handler: (instance as any)[methodName].bind(instance),
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
// Re-export for convenience
// ---------------------------------------------------------------------------

export { CapLoadError };
