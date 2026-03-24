import { ActionHandler } from '../../../../types';
import { HttpAdapter } from '../types';

export const buildRouter: ActionHandler = async (payload, context) => {
  const { adapter = 'elysia', traitHandlers = {} } = payload?.body || payload || {};
  const capskit = context.deps.capskit;
  
  let adapterFn: HttpAdapter | undefined;

  if (typeof adapter === 'function') {
    adapterFn = adapter as HttpAdapter;
  } else if (typeof adapter === 'string') {
    const packageName = adapter === 'elysia' ? '@mobtakronio/capskit-http-elysia' : adapter;
    try {
      // Dynamic import of the adapter package
      const module = await import(packageName);
      // Try common export names: default, createRouter, or the module itself if it's a function
      adapterFn = module.default || module.createRouter || (typeof module === 'function' ? module : undefined);
      
      if (!adapterFn) {
        throw new Error(`Package "${packageName}" does not export a valid HTTP adapter (expected default export or "createRouter").`);
      }
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Cannot find module')) {
        throw new Error(`HTTP adapter "${packageName}" not found. Run 'npm install ${packageName}' to use it.`);
      }
      throw error;
    }
  }

  if (adapterFn) {
    return { router: await adapterFn(capskit, { traitHandlers }) };
  }

  throw new Error(`Unsupported HTTP adapter: ${typeof adapter}`);
};

