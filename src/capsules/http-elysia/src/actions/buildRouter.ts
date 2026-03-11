import { ActionHandler } from '../../../../types';
import { createRouter } from '../core/router';

export const buildRouter: ActionHandler = async (payload, context) => {
  const platform = context.deps.platform;
  
  // Creates and returns the route tree representing all discovered capabilities
  const app = createRouter(platform);

  return { router: app };
};
