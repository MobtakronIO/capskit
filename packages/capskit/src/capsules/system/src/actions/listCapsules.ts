import { ActionHandler } from '../../../../types';

export const listCapsules: ActionHandler = async (payload, context) => {
  const capskit = context.deps.capskit;
  if (!capskit || typeof capskit.getManifests !== 'function') {
    throw new Error('System capsule requires "capskit" dependency with getManifests() method.');
  }

  return capskit.getManifests();
};
