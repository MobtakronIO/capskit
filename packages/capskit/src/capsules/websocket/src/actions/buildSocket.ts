import { ActionHandler } from '../../../../types';
import { WebSocketAdapter } from '../types';
import {
  loadAdapterManifest,
  checkVersionCompatibility,
  buildIncompatibilityError,
} from '../../../../kernel/adapter-validation';
import { getCapsKitVersion } from '../../../../kernel/version';

export const buildSocket: ActionHandler = async (payload, context) => {
  const { adapter = 'elysia' } = payload?.body || payload || {};
  const capskit = context.deps.capskit;
  
  let adapterFn: WebSocketAdapter | undefined;

  if (typeof adapter === 'function') {
    adapterFn = adapter as WebSocketAdapter;
  } else if (typeof adapter === 'string') {
    const packageName = adapter === 'elysia' ? '@mobtakronio/capskit-websocket-elysia' : adapter;
    try {
      // Dynamic import of the adapter package
      const module = await import(packageName);
      // Try common export names: default, createSocket, or the module itself if it's a function
      adapterFn = module.default || module.createSocket || (typeof module === 'function' ? module : undefined);
      
      if (!adapterFn) {
        throw new Error(`Package "${packageName}" does not export a valid WebSocket adapter (expected default export or "createSocket").`);
      }

      // Try to load and validate adapter manifest for compatibility checking
      const manifest = await loadAdapterManifest(packageName, module);
      if (manifest) {
        const capskitVersion = await getCapsKitVersion();
        // Check if manifest declares WebSocket capability
        if (manifest.capabilities.includes('websocket')) {
          const compatResult = checkVersionCompatibility(
            manifest.version,
            capskitVersion,
            manifest.capskitVersion
          );
          if (!compatResult.compatible) {
            const errorMsg = buildIncompatibilityError(
              manifest.name,
              manifest.version,
              capskitVersion,
              compatResult
            );
            throw new Error(errorMsg);
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Cannot find module')) {
        throw new Error(`WebSocket adapter "${packageName}" not found. Run 'npm install ${packageName}' to use it.`);
      }
      throw error;
    }
  }

  if (adapterFn) {
    return { sockets: await adapterFn(capskit, {}) };
  }

  throw new Error(`Unsupported WebSocket adapter: ${typeof adapter}`);
};

