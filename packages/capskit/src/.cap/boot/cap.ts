import { ActionInput, CapContext, CapsuleManifest, DependencyGraph } from '../../types';
import {
  BootSequencer,
  BootSequencerOptions,
  buildDependencyGraph,
  validateManifests,
  CycleDetectedError,
  MissingDependencyError,
  BootTimeoutError,
} from '../../kernel/boot';

/**
 * Cap: boot — Dependency-aware capsule boot orchestration.
 *
 * Actions:
 * - buildGraph        — Build a DependencyGraph from manifests
 * - validateManifests  — Validate manifests for cycles and missing deps
 * - boot              — Boot capsules in topological order
 */
export default class BootCap {
  [action: string]: any;

  /**
   * Build a dependency graph from capsule manifests.
   */
  async buildGraph(
    payload: ActionInput,
    _ctx: CapContext,
  ): Promise<DependencyGraph> {
    const manifests: CapsuleManifest[] = payload.body?.manifests ?? [];
    if (!Array.isArray(manifests) || manifests.length === 0) {
      throw new Error('buildGraph requires a non-empty "manifests" array in payload body');
    }
    return buildDependencyGraph(manifests);
  }

  /**
   * Validate manifests for boot readiness (cycles, missing deps).
   */
  async validateManifests(
    payload: ActionInput,
    _ctx: CapContext,
  ): Promise<{ valid: boolean; error?: string; cycle?: string[] }> {
    const manifests: CapsuleManifest[] = payload.body?.manifests ?? [];
    const externalDeps: Record<string, any> = payload.body?.externalDependencies ?? {};

    if (!Array.isArray(manifests)) {
      throw new Error('validateManifests requires a "manifests" array in payload body');
    }

    const result = validateManifests(manifests, externalDeps);
    return {
      valid: result.valid,
      error: result.error?.message,
      cycle: result.cycle,
    };
  }

  /**
   * Boot capsules using the BootSequencer in topological dependency order.
   */
  async boot(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{ booted: string[]; order: string[] }> {
    const manifests: CapsuleManifest[] = payload.body?.manifests ?? [];
    const platform = payload.body?.platform ?? ctx.deps.capskit;

    if (!Array.isArray(manifests) || manifests.length === 0) {
      throw new Error('boot requires a non-empty "manifests" array in payload body');
    }

    if (!platform) {
      throw new Error('boot requires a "platform" (CapsKit instance) in payload body or dependencies');
    }

    const options: BootSequencerOptions = {
      validateExternalDependencies: payload.body?.validateExternalDependencies,
      externalDependencies: payload.body?.externalDependencies ?? {},
    };

    const sequencer = new BootSequencer(options);
    const booted = await sequencer.boot(manifests, platform);

    return {
      booted: booted.map((m) => m.name),
      order: booted.map((m) => m.name),
    };
  }
}
