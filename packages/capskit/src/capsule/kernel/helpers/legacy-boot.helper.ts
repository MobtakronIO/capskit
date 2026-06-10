// Boot compatibility shim
import { FrameworkError } from '../errors';

export class CycleDetectedError extends FrameworkError {
  public cycle: string[];
  
  constructor(cycleOrMessage: string[] | string, cycle?: string[]) {
    if (Array.isArray(cycleOrMessage)) {
      super(`Cycle detected: ${cycleOrMessage.join(' → ')}`, 'CYCLE_DETECTED', 400, { cycle: cycleOrMessage });
      this.cycle = cycleOrMessage;
    } else {
      super(cycleOrMessage, 'CYCLE_DETECTED', 400, { cycle: cycle || [] });
      this.cycle = cycle || [];
    }
    this.name = 'CycleDetectedError';
  }
  
  toEnvelope(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      cycle: this.cycle,
    };
  }
}

export class MissingDependencyError extends FrameworkError {
  public capsule: string;
  public missingDependency: string;
  
  constructor(capsule: string, missingDep: string) {
    super(`Capsule ${capsule} depends on unknown capsule ${missingDep}`, 'MISSING_DEPENDENCY', 400, { capsule, missingDependency: missingDep });
    this.capsule = capsule;
    this.missingDependency = missingDep;
    this.name = 'MissingDependencyError';
  }
  
  toEnvelope(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      capsule: this.capsule,
      missingDependency: this.missingDependency,
    };
  }
}

export class BootTimeoutError extends FrameworkError {
  public capsule: string;
  public timeoutMs: number;
  
  constructor(capsule: string, timeoutMs: number) {
    super(`Boot timeout for capsule ${capsule} after ${timeoutMs}ms`, 'BOOT_TIMEOUT', 408, { capsule, timeoutMs });
    this.capsule = capsule;
    this.timeoutMs = timeoutMs;
    this.name = 'BootTimeoutError';
  }
  
  toEnvelope(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      capsule: this.capsule,
      timeoutMs: this.timeoutMs,
    };
  }
}

export interface BootConfig {
  init?: () => Promise<void>;
  ready?: string;
  blocking?: boolean;
}

export interface BootManifest {
  name: string;
  actions: Record<string, unknown>;
  requires?: string[];
  dependencies?: string[];
  boot?: BootConfig;
}

export interface BootGraph {
  nodes: string[];
  edges: Record<string, string[]>;
  bootOrder: string[];
}

/**
 * Build a dependency graph from manifests.
 */
export function buildDependencyGraph(manifests: BootManifest[]): BootGraph {
  const nodes = manifests.map(m => m.name);
  const edges: Record<string, string[]> = {};
  
  for (const manifest of manifests) {
    const deps = manifest.requires || manifest.dependencies || [];
    edges[manifest.name] = deps;
  }
  
  // Detect cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cyclePath: string[] = [];
  
  function detectCycle(node: string): boolean {
    if (inStack.has(node)) {
      cyclePath.push(node);
      return true;
    }
    if (visited.has(node)) return false;
    
    visited.add(node);
    inStack.add(node);
    
    for (const dep of edges[node] || []) {
      if (nodes.includes(dep)) { // Only check deps that are actual nodes
        if (detectCycle(dep)) {
          cyclePath.unshift(node);
          return true;
        }
      }
    }
    
    inStack.delete(node);
    return false;
  }
  
  for (const node of nodes) {
    if (detectCycle(node)) {
      cyclePath.push(cyclePath[0]); // Complete the cycle
      throw new CycleDetectedError(cyclePath);
    }
  }
  
  // Topological sort
  const topoVisited = new Set<string>();
  const order: string[] = [];
  
  function visit(node: string) {
    if (topoVisited.has(node)) return;
    topoVisited.add(node);
    for (const dep of edges[node] || []) {
      visit(dep);
    }
    order.push(node);
  }
  
  for (const node of nodes) {
    visit(node);
  }
  
  return { nodes, edges, bootOrder: order };
}

/**
 * Validate manifests for consistency.
 */
export function validateManifests(manifests: BootManifest[], builtins?: Record<string, boolean>): { valid: boolean; errors: string[]; error?: Error } {
  const errors: string[] = [];
  const names = new Set<string>();
  const builtinNames = builtins ? new Set(Object.keys(builtins)) : new Set<string>();
  
  for (const manifest of manifests) {
    if (names.has(manifest.name)) {
      errors.push(`Duplicate capsule name: ${manifest.name}`);
    }
    names.add(manifest.name);
  }
  
  // Check dependencies exist
  for (const manifest of manifests) {
    const deps = manifest.requires || manifest.dependencies || [];
    for (const dep of deps) {
      if (!names.has(dep) && !builtinNames.has(dep)) {
        const err = new MissingDependencyError(manifest.name, dep);
        return { valid: false, errors: [err.message], error: err };
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Boot sequencer - orders and boots capsules.
 */
export class BootSequencer {
  private manifests: BootManifest[];
  
  constructor(manifests?: BootManifest[]) {
    this.manifests = manifests || [];
  }
  
  async sequence(): Promise<string[]> {
    const graph = buildDependencyGraph(this.manifests);
    
    // Check for cycles
    const visited = new Set<string>();
    const inStack = new Set<string>();
    
    function hasCycle(node: string): boolean {
      if (inStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      inStack.add(node);
      for (const dep of graph.edges[node] || []) {
        if (hasCycle(dep)) return true;
      }
      inStack.delete(node);
      return false;
    }
    
    for (const node of graph.nodes) {
      if (hasCycle(node)) {
        throw new CycleDetectedError([node]);
      }
    }
    
    return graph.bootOrder;
  }
  
  async boot(manifests: BootManifest[], platform?: { getDependencies?: () => Record<string, boolean>; on?: (event: string, handler: Function) => void; off?: (event: string, handler: Function) => void }): Promise<void> {
    this.manifests = manifests;
    const graph = buildDependencyGraph(this.manifests);
    
    // Get built-in dependencies from platform
    const builtins = platform?.getDependencies ? platform.getDependencies() : {};
    const builtinNames = new Set(Object.keys(builtins));
    
    // Validate dependencies
    const names = new Set(this.manifests.map(m => m.name));
    for (const manifest of this.manifests) {
      const deps = manifest.requires || manifest.dependencies || [];
      for (const dep of deps) {
        if (!names.has(dep) && !builtinNames.has(dep)) {
          throw new MissingDependencyError(manifest.name, dep);
        }
      }
    }
    
    // Boot each capsule in order
    for (const capsuleName of graph.bootOrder) {
      const manifest = this.manifests.find(m => m.name === capsuleName);
      if (!manifest) continue;
      
      const bootConfig = manifest.boot;
      if (!bootConfig) continue;
      
      // Run init if present
      if (bootConfig.init) {
        await bootConfig.init();
      }
      
      // If ready event is specified, wait for it
      if (bootConfig.ready && platform?.on) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            platform.off?.(bootConfig.ready as string, handler);
            resolve();
          };
          platform.on!(bootConfig.ready as string, handler);
        });
      }
    }
  }
}

/**
 * Describe the boot order in human-readable format.
 */
export function describeBootOrder(manifests: BootManifest[]): string {
  const graph = buildDependencyGraph(manifests);
  return `Boot Order: ${graph.bootOrder.join(' → ')}`;
}
