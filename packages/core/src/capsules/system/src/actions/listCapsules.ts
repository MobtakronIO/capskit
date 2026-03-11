import { ActionHandler } from '@capskit/types';

export const listCapsules: ActionHandler = async (payload, context) => {
  const platform = context.deps.platform;
  if (!platform || typeof platform.getManifests !== 'function') {
    throw new Error('System capsule requires "platform" dependency with getManifests() method.');
  }

  return platform.getManifests();
};
