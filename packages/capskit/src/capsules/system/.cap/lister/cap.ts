import { ActionInput, CapContext } from '../../../../types';

/**
 * Cap: lister — Lists all registered capsules and their capabilities.
 *
 * Actions:
 * - listCapsules
 */
export default class ListerCap {
  [action: string]: any;

  async listCapsules(_input: ActionInput, ctx: CapContext): Promise<any[]> {
    const capskit = ctx.deps.capskit;
    if (!capskit || typeof capskit.getManifests !== 'function') {
      throw new Error(
        'System capsule requires "capskit" dependency with getManifests() method.',
      );
    }

    return capskit.getManifests();
  }
}
