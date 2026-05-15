import { ActionInput, CapContext } from '../../types';

/**
 * Cap: inspect — Runtime introspection.
 *
 * Actions:
 * - listActions    — List all registered actions
 * - listManifests  — List all registered manifests
 * - getState       — Snapshot of kernel runtime state
 */
export default class InspectCap {
  [action: string]: any;

  /**
   * List all registered actions, optionally filtered by capsule name.
   */
  async listActions(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{
    total: number;
    actions: { capsule: string; action: string; description?: string }[];
  }> {
    const capsuleFilter: string | undefined = payload.body?.capsule;
    const platform = ctx.deps.capskit;

    if (!platform || typeof platform.actions?.entries !== 'function') {
      throw new Error(
        'listActions requires the CapsKit platform instance in dependencies as "capskit"',
      );
    }

    const entries: { capsule: string; action: string; description?: string }[] = [];

    for (const [fullName, def] of platform.actions.entries()) {
      const dotIndex = fullName.indexOf('.');
      const capsule = dotIndex >= 0 ? fullName.slice(0, dotIndex) : fullName;
      const action = dotIndex >= 0 ? fullName.slice(dotIndex + 1) : fullName;

      if (capsuleFilter && capsuleFilter !== capsule) continue;

      entries.push({
        capsule,
        action,
        description: def?.description,
      });
    }

    return { total: entries.length, actions: entries };
  }

  /**
   * List all registered manifests.
   */
  async listManifests(
    payload: ActionInput,
    ctx: CapContext,
  ): Promise<{
    total: number;
    manifests: {
      name: string;
      actionCount: number;
      requires?: string[];
      publishes?: string[];
    }[];
  }> {
    const capsuleFilter: string | undefined = payload.body?.capsule;
    const platform = ctx.deps.capskit;

    if (!platform || typeof platform.manifests?.entries !== 'function') {
      throw new Error(
        'listManifests requires the CapsKit platform instance in dependencies as "capskit"',
      );
    }

    const manifests: {
      name: string;
      actionCount: number;
      requires?: string[];
      publishes?: string[];
    }[] = [];

    for (const [name, manifest] of platform.manifests.entries()) {
      if (capsuleFilter && capsuleFilter !== name) continue;

      manifests.push({
        name,
        actionCount: Object.keys(manifest.actions ?? {}).length,
        requires: manifest.requires,
        publishes: manifest.events?.publishes,
      });
    }

    return { total: manifests.length, manifests };
  }

  /**
   * Return a snapshot of kernel runtime state.
   */
  async getState(
    _payload: ActionInput,
    ctx: CapContext,
  ): Promise<{
    capsuleCount: number;
    actionCount: number;
    dependencyCount: number;
  }> {
    const platform = ctx.deps.capskit;

    if (!platform) {
      throw new Error(
        'getState requires the CapsKit platform instance in dependencies as "capskit"',
      );
    }

    return {
      capsuleCount: platform.manifests?.size ?? 0,
      actionCount: platform.actions?.size ?? 0,
      dependencyCount: Object.keys(platform.dependencies ?? {}).length,
    };
  }
}
