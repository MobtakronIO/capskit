/**
 * Dependency Graph Boot Sequencer
 * 
 * Boots capsules in topological order based on their declared dependencies.
 * Ensures that a capsule's dependencies are fully initialized before
 * the capsule itself is booted.
 * 
 * Key features:
 * - DAG construction from manifest dependencies
 * - Cycle detection with readable error output
 * - Topological sort for boot order
 * - Sequential boot with readiness resolution
 * - Dual readiness signaling (init Promise OR ready event)
 */

import { CapsuleManifest, BootLifecycle, BootContext, DependencyGraph } from '../types';
import { FrameworkError } from './errors';

// ============================================================
// Error Classes
// ============================================================

export class CycleDetectedError extends FrameworkError {
  public readonly isFrameworkError = true;
  public readonly cycle: string[];

  constructor(cycle: string[]) {
    const cycleStr = cycle.join(' → ');
    super(
      `Dependency cycle detected: ${cycleStr}`,
      'CYCLE_ERROR',
      500,
      { cycle }
    );
    this.name = 'CycleDetectedError';
    this.cycle = cycle;
  }

  toEnvelope(): { code: string; message: string; status?: number; details?: Record<string, any>; cycle: string[] } {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: { cycle: this.cycle },
      cycle: this.cycle,
    };
  }
}

export class MissingDependencyError extends FrameworkError {
  public readonly isFrameworkError = true;
  public readonly capsule: string;
  public readonly missingDependency: string;

  constructor(capsule: string, missingDependency: string) {
    super(
      `Capsule "${capsule}" depends on "${missingDependency}" which is not available. ` +
      `Either provide this dependency or remove the capsule from the configuration.`,
      'MISSING_DEPENDENCY_ERROR',
      500,
      { capsule, missingDependency }
    );
    this.name = 'MissingDependencyError';
    this.capsule = capsule;
    this.missingDependency = missingDependency;
  }

  toEnvelope(): { code: string; message: string; status?: number; details?: Record<string, any>; capsule: string; missingDependency: string } {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: { capsule: this.capsule, missingDependency: this.missingDependency },
      capsule: this.capsule,
      missingDependency: this.missingDependency,
    };
  }
}

export class BootTimeoutError extends FrameworkError {
  public readonly isFrameworkError = true;
  public readonly capsule: string;
  public readonly timeoutMs: number;

  constructor(capsule: string, timeoutMs: number) {
    super(
      `Capsule "${capsule}" failed to signal readiness within ${timeoutMs}ms. ` +
      `Check that the capsule's init() function is completing or emitting the ready event.`,
      'BOOT_TIMEOUT_ERROR',
      500,
      { capsule, timeoutMs }
    );
    this.name = 'BootTimeoutError';
    this.capsule = capsule;
    this.timeoutMs = timeoutMs;
  }

  toEnvelope(): { code: string; message: string; status?: number; details?: Record<string, any>; capsule: string; timeoutMs: number } {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: { capsule: this.capsule, timeoutMs: this.timeoutMs },
      capsule: this.capsule,
      timeoutMs: this.timeoutMs,
    };
  }
}

// ============================================================
// Dependency Graph Builder
// ============================================================

/**
 * Build a dependency graph from capsule manifests.
 * 
 * Creates a directed graph where edges go from a capsule to its dependencies.
 * External dependencies (not in the capsule set) are tracked separately.
 * 
 * @param manifests - Array of capsule manifests to build graph from
 * @returns DependencyGraph with adjacency list and metadata
 * 
 * @example
 * ```typescript
 * const graph = buildDependencyGraph(manifests);
 * console.log(graph.bootOrder); // ['a', 'b', 'c'] in topo order
 * ```
 */
export function buildDependencyGraph(manifests: CapsuleManifest[]): DependencyGraph {
  const dependencies = new Map<string, Set<string>>();
  const capsuleNames = new Set(manifests.map(m => m.name));

  // Initialize dependency sets for each capsule
  for (const manifest of manifests) {
    const deps = manifest.requires ?? [];
    const depSet = new Set<string>();
    
    for (const dep of deps) {
      // Only track inter-capsule dependencies
      // External dependencies (database, redis, etc.) are validated separately
      if (capsuleNames.has(dep)) {
        depSet.add(dep);
      }
    }
    
    dependencies.set(manifest.name, depSet);
  }

  // Compute roots (capsules with no inter-capsule dependencies)
  const roots = new Set<string>();
  for (const [name, deps] of dependencies) {
    if (deps.size === 0) {
      roots.add(name);
    }
  }

  // Compute leaves (capsules that nothing depends on)
  const leaves = new Set<string>(capsuleNames);
  for (const [, deps] of dependencies) {
    for (const dep of deps) {
      leaves.delete(dep);
    }
  }

  // Topological sort using Kahn's algorithm
  const bootOrder = topologicalSort(dependencies, capsuleNames);

  return {
    dependencies,
    bootOrder,
    roots,
    leaves,
  };
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns capsules in boot order (dependencies first).
 * 
 * @param dependencies - Map of capsule name to its dependencies
 * @param capsuleNames - Set of all capsule names
 * @returns Array of capsule names in topological order
 * @throws CycleDetectedError if a cycle is detected
 */
function topologicalSort(
  dependencies: Map<string, Set<string>>,
  capsuleNames: Set<string>
): string[] {
  // Build in-degree map (count of how many things each capsule depends on)
  // A capsule's in-degree = number of its dependencies that must complete first
  // We start with capsules that have no dependencies (in-degree 0)
  const inDegree = new Map<string, number>();
  for (const name of capsuleNames) {
    inDegree.set(name, 0);
  }
  
  // For each capsule, count its dependencies (edges go from capsule to its dependencies)
  // The capsule cannot start until all its dependencies complete
  for (const [name, deps] of dependencies) {
    // name's in-degree = number of things name depends on
    inDegree.set(name, deps.size);
  }

  // Start with capsules that have no dependencies (in-degree 0)
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // For each capsule that depends on current, we've now satisfied one dependency
    // Reduce the dependent's in-degree (number of remaining unsatisfied dependencies)
    for (const [name, deps] of dependencies) {
      if (deps.has(current)) {
        const newDegree = (inDegree.get(name) ?? 0) - 1;
        inDegree.set(name, newDegree);
        if (newDegree === 0) {
          queue.push(name);
        }
      }
    }
  }

  // If we haven't processed all capsules, there's a cycle
  if (result.length !== capsuleNames.size) {
    // Find the cycle by looking for capsules that were never queued
    const unprocessed: string[] = [];
    for (const name of capsuleNames) {
      if (!result.includes(name)) {
        unprocessed.push(name);
      }
    }
    
    // Reconstruct the cycle path from unprocessed nodes
    const cycle = findCyclePath(dependencies, unprocessed[0]);
    throw new CycleDetectedError(cycle);
  }

  return result;
}

/**
 * Find a cycle path starting from a given node.
 * Uses DFS to trace back the cycle.
 */
function findCyclePath(dependencies: Map<string, Set<string>>, startNode: string): string[] {
  const visited = new Set<string>();
  const path: string[] = [];
  
  function dfs(node: string): string[] | null {
    if (path.includes(node)) {
      // Found cycle - return path from the node that starts the cycle
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }
    
    if (visited.has(node)) {
      return null;
    }
    
    visited.add(node);
    path.push(node);
    
    const deps = dependencies.get(node);
    if (deps) {
      for (const dep of deps) {
        const cycle = dfs(dep);
        if (cycle) {
          return cycle;
        }
      }
    }
    
    path.pop();
    return null;
  }
  
  const cycle = dfs(startNode);
  return cycle ?? [startNode];
}

// ============================================================
// Boot Sequencer
// ============================================================

/**
 * Options for the boot sequencer.
 */
export interface BootSequencerOptions {
  /**
   * Whether to validate external dependencies during boot.
   * External dependencies are those in `requires` but not in the capsule set.
   * 
   * @default true
   */
  validateExternalDependencies?: boolean;

  /**
   * External dependency providers (e.g., database, redis).
   * These are checked when validating `requires` against what's available.
   */
  externalDependencies?: Record<string, any>;

  /**
   * Called when a capsule begins booting.
   */
  onCapsuleBooting?: (manifest: CapsuleManifest) => void;

  /**
   * Called when a capsule becomes ready.
   */
  onCapsuleReady?: (manifest: CapsuleManifest) => void;

  /**
   * Called when boot completes successfully.
   */
  onBootComplete?: (manifests: CapsuleManifest[]) => void;

  /**
   * Called when boot fails.
   */
  onBootFailed?: (error: Error, failedCapsule: CapsuleManifest) => void;
}

/**
 * Boot sequencer that orchestrates capsule initialization in dependency order.
 * 
 * Key responsibilities:
 * 1. Build dependency graph from manifests
 * 2. Validate dependencies (missing external deps, cycles)
 * 3. Topologically sort capsules for boot order
 * 4. Boot capsules sequentially, waiting for readiness
 * 5. Support both init() Promise and ready event for readiness signaling
 * 
 * @example
 * ```typescript
 * const sequencer = new BootSequencer({
 *   externalDependencies: { database: db, redis: redis },
 *   onCapsuleReady: (m) => console.log(`Ready: ${m.name}`)
 * });
 * 
 * await sequencer.boot(manifests);
 * ```
 */
export class BootSequencer {
  private options: Required<BootSequencerOptions>;
  private manifestMap: Map<string, CapsuleManifest> = new Map();
  private platform: any;

  constructor(options: BootSequencerOptions = {}) {
    this.options = {
      validateExternalDependencies: options.validateExternalDependencies ?? true,
      externalDependencies: options.externalDependencies ?? {},
      onCapsuleBooting: options.onCapsuleBooting ?? (() => {}),
      onCapsuleReady: options.onCapsuleReady ?? (() => {}),
      onBootComplete: options.onBootComplete ?? (() => {}),
      onBootFailed: options.onBootFailed ?? (() => {}),
    };
  }

  /**
   * Boot all capsules in dependency order.
   * 
   * @param manifests - Array of capsule manifests to boot
   * @param platform - The CapsKit platform instance
   * @returns Array of manifests in boot order
   * @throws MissingDependencyError if a required external dependency is not available
   * @throws CycleDetectedError if a dependency cycle is detected
   * @throws BootTimeoutError if a capsule fails to signal readiness within its timeout
   */
  async boot(manifests: CapsuleManifest[], platform: any): Promise<CapsuleManifest[]> {
    if (manifests.length === 0) {
      return [];
    }

    // Build the dependency graph
    const graph = buildDependencyGraph(manifests);

    // Set external dependencies from platform before validation
    this.options.externalDependencies = platform.getDependencies?.() ?? {};

    // Validate external dependencies
    if (this.options.validateExternalDependencies) {
      this.validateExternalDependencies(manifests);
    }

    console.log(`[BootSequencer] Booting ${manifests.length} capsules in order: ${graph.bootOrder.join(' → ')}`);

    // Boot capsules in topological order
    const readyPromises: Map<string, Promise<void>> = new Map();
    const readyEvents: Map<string, string> = new Map();
    this.manifestMap = new Map(manifests.map(m => [m.name, m]));
    this.platform = platform;

    for (const capsuleName of graph.bootOrder) {
      const manifest = this.manifestMap.get(capsuleName)!;
      await this.bootCapsule(manifest, platform, readyPromises, readyEvents);
    }

    this.options.onBootComplete(manifests);
    return manifests;
  }

  /**
   * Validate that all external dependencies are available.
   */
  private validateExternalDependencies(manifests: CapsuleManifest[]): void {
    for (const manifest of manifests) {
      const requires = manifest.requires ?? [];
      for (const dep of requires) {
        // Check if this is an external dependency (not a capsule)
        if (!this.options.externalDependencies[dep] && dep !== 'capskit') {
          // capskit is always provided by the platform
          throw new MissingDependencyError(manifest.name, dep);
        }
      }
    }
  }

  /**
   * Boot a single capsule and wait for its readiness.
   */
  private async bootCapsule(
    manifest: CapsuleManifest,
    platform: any,
    readyPromises: Map<string, Promise<void>>,
    readyEvents: Map<string, string>
  ): Promise<void> {
    const { name } = manifest;
    const bootConfig = manifest.boot;
    const isBlocking = bootConfig?.blocking ?? true;

    this.options.onCapsuleBooting(manifest);
    console.log(`[BootSequencer] Booting capsule: ${name} (blocking: ${isBlocking})`);

    // Create boot context
    const context: BootContext = {
      manifest,
      deps: platform.getDependencies ? platform.getDependencies() : {},
      platform,
    };

    // Wait for all BLOCKING dependencies to be ready first
    // Non-blocking capsules don't block their dependents
    const requires = manifest.requires ?? [];
    for (const dep of requires) {
      if (readyPromises.has(dep)) {
        const depManifest = this.manifestMap?.get(dep);
        const depIsBlocking = depManifest?.boot?.blocking ?? true;
        
        if (depIsBlocking) {
          console.log(`[BootSequencer] Waiting for blocking dependency "${dep}" before booting "${name}"`);
          await readyPromises.get(dep);
        } else {
          console.log(`[BootSequencer] Skipping non-blocking dependency "${dep}" for "${name}"`);
        }
      }
    }

    // Boot the capsule
    const readyPromise = this.bootCapsuleInternal(manifest, context, bootConfig, platform, readyEvents);
    
    // Only add to readyPromises if this capsule is blocking
    // Non-blocking capsules don't block their dependents
    if (isBlocking) {
      readyPromises.set(name, readyPromise);
    } else {
      // For non-blocking capsules, still track their readiness for debugging
      // but don't block dependents
      console.log(`[BootSequencer] Capsule "${name}" is non-blocking - dependents will not wait`);
    }

    try {
      await readyPromise;
      this.options.onCapsuleReady(manifest);
      console.log(`[BootSequencer] Capsule ready: ${name}`);
    } catch (error) {
      this.options.onBootFailed(
        error instanceof Error ? error : new Error(String(error)),
        manifest
      );
      throw error;
    }
  }

  /**
   * Internal boot logic for a single capsule.
   * Handles both init() Promise and ready event.
   */
  private async bootCapsuleInternal(
    manifest: CapsuleManifest,
    context: BootContext,
    bootConfig?: BootLifecycle,
    platform?: any,
    readyEvents?: Map<string, string>
  ): Promise<void> {
    const { name } = manifest;
    const timeout = bootConfig?.timeout ?? Infinity;
    const readyEvent = bootConfig?.ready;

    // If no init or ready configuration, capsule is immediately ready
    if (!bootConfig?.init && !readyEvent) {
      console.log(`[BootSequencer] Capsule "${name}" has no init or ready event - immediate ready`);
      return;
    }

    // Handle ready event if specified
    if (readyEvent && platform) {
      console.log(`[BootSequencer] Capsule "${name}" waiting for ready event: "${readyEvent}"`);
      
      return new Promise((resolve, reject) => {
        // Only set timeout if timeout is not Infinity
        let timer: NodeJS.Timeout | undefined;
        if (timeout !== Infinity) {
          timer = setTimeout(() => {
            reject(new BootTimeoutError(name, timeout));
          }, timeout);
        }

        const handler = (data: any) => {
          console.log(`[BootSequencer] Capsule "${name}" ready event received:`, data);
          if (timer) clearTimeout(timer);
          platform.off?.(readyEvent, handler);
          resolve();
        };

        platform.on?.(readyEvent, handler);
        readyEvents?.set(name, readyEvent);

        // Also call init() if provided - it may emit the ready event internally
        if (bootConfig?.init) {
          console.log(`[BootSequencer] Calling init() for capsule "${name}"`);
          const initPromise = bootConfig.init(context);
          
          if (initPromise instanceof Promise) {
            initPromise
              .then(() => {
                // Init completed but we still need to wait for ready event if specified
                console.log(`[BootSequencer] Capsule "${name}" init() completed, waiting for ready event`);
              })
              .catch((err) => {
                clearTimeout(timer);
                platform.off?.(readyEvent, handler);
                reject(err);
              });
          }
        }
      });
    }

    // Handle init() Promise (no ready event)
    if (bootConfig?.init) {
      console.log(`[BootSequencer] Calling init() for capsule "${name}"`);
      const initPromise = bootConfig.init(context);
      
      if (!(initPromise instanceof Promise)) {
        console.log(`[BootSequencer] Capsule "${name}" init() returned synchronously - immediate ready`);
        return;
      }

      // Wait for init with optional timeout
      if (timeout === Infinity) {
        await initPromise;
      } else {
        await this.withTimeout(initPromise, name, timeout);
      }
    }
  }

  /**
   * Wrap a promise with a timeout.
   */
  private async withTimeout(promise: Promise<void>, capsuleName: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new BootTimeoutError(capsuleName, timeoutMs));
      }, timeoutMs);

      promise
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Validate that manifests can be booted together.
 * Short-circuits on first error.
 * 
 * @param manifests - Array of capsule manifests to validate
 * @param externalDependencies - Available external dependencies
 * @returns ValidationResult with any errors found
 * 
 * @example
 * ```typescript
 * const result = validateManifests(manifests, { database: db });
 * if (result.error) {
 *   console.error(result.message);
 * }
 * ```
 */
export function validateManifests(
  manifests: CapsuleManifest[],
  externalDependencies: Record<string, any> = {}
): { valid: boolean; error?: Error; cycle?: string[] } {
  try {
    // Build graph (this will throw on cycle)
    const graph = buildDependencyGraph(manifests);

    // Check for missing external dependencies
    const capsuleNames = new Set(manifests.map(m => m.name));
    for (const manifest of manifests) {
      const requires = manifest.requires ?? [];
      for (const dep of requires) {
        // It's a missing dependency if:
        // 1. It's not a capsule name (external dep)
        // 2. It's not in the available external deps
        // 3. It's not 'capskit' (always provided)
        if (!capsuleNames.has(dep) && dep !== 'capskit' && !externalDependencies[dep]) {
          return {
            valid: false,
            error: new MissingDependencyError(manifest.name, dep),
          };
        }
      }
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof CycleDetectedError) {
      return {
        valid: false,
        error,
        cycle: error.cycle,
      };
    }
    return {
      valid: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get a human-readable description of the boot order.
 * 
 * @param manifests - Array of capsule manifests
 * @returns String describing the boot order and dependencies
 */
export function describeBootOrder(manifests: CapsuleManifest[]): string {
  const graph = buildDependencyGraph(manifests);
  const lines: string[] = [];

  lines.push(`Boot Order (${graph.bootOrder.length} capsules):`);
  lines.push(`  ${graph.bootOrder.join(' → ')}`);
  lines.push('');

  if (graph.roots.size > 0) {
    lines.push(`Roots (no dependencies): ${[...graph.roots].join(', ')}`);
  }

  if (graph.leaves.size > 0) {
    lines.push(`Leaves (not depended on): ${[...graph.leaves].join(', ')}`);
  }

  lines.push('');
  lines.push('Dependency Details:');

  for (const name of graph.bootOrder) {
    const manifest = manifests.find(m => m.name === name)!;
    const deps = manifest.requires ?? [];
    const interCapsuleDeps = deps.filter(d => graph.dependencies.get(name)?.has(d));
    
    if (interCapsuleDeps.length > 0) {
      lines.push(`  ${name} ← ${interCapsuleDeps.join(', ')}`);
    } else if (deps.length > 0) {
      lines.push(`  ${name} ← [external] ${deps.filter(d => !graph.dependencies.get(name)?.has(d)).join(', ')}`);
    } else {
      lines.push(`  ${name} ← [none]`);
    }
  }

  return lines.join('\n');
}
