import { ActionInput, CapContext } from '../../../../types';
import { WebSocketAdapter } from '../../src/types';
import {
  loadAdapterManifest,
  checkVersionCompatibility,
  buildIncompatibilityError,
} from '../../../../kernel/adapter-validation';
import { getCapsKitVersion } from '../../../../kernel/version';

/**
 * Cap: buildSocket — Returns a WebSocket configuration containing all
 * platform capabilities mapped to WebSocket endpoints.
 *
 * Actions:
 * - buildSocket
 */
export default class BuildSocketCap {
  [action: string]: any;

  async buildSocket(payload: ActionInput, context: CapContext): Promise<{ sockets: any }> {
    const { adapter = 'elysia' } = payload?.body || payload || {};
    const capskit = context.deps.capskit;

    let adapterFn: WebSocketAdapter | undefined;

    if (typeof adapter === 'function') {
      adapterFn = adapter as WebSocketAdapter;
    } else if (typeof adapter === 'string') {
      const packageName = adapter === 'elysia' ? '@mobtakronio/elysia' : adapter;
      try {
        const module = await import(packageName);
        // Prefer createSocket (specific WebSocket adapter) over default (unified adapter)
        adapterFn = module.createSocket || module.default || (typeof module === 'function' ? module : undefined);

        if (!adapterFn) {
          throw new Error(
            `Package "${packageName}" does not export a valid WebSocket adapter (expected default export or "createSocket").`,
          );
        }

        const manifest = await loadAdapterManifest(packageName, module);
        if (manifest) {
          const capskitVersion = await getCapsKitVersion();
          if (manifest.capabilities.includes('websocket')) {
            const compatResult = checkVersionCompatibility(
              manifest.version,
              capskitVersion,
              manifest.capskitVersion,
            );
            if (!compatResult.compatible) {
              const errorMsg = buildIncompatibilityError(
                manifest.name,
                manifest.version,
                capskitVersion,
                compatResult,
              );
              throw new Error(errorMsg);
            }
          }
        }
      } catch (error: any) {
        if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Cannot find module')) {
          throw new Error(
            `WebSocket adapter "${packageName}" not found. Run 'npm install ${packageName}' to use it.`,
          );
        }
        throw error;
      }
    }

    if (adapterFn) {
      return { sockets: await adapterFn(capskit, {}) };
    }

    throw new Error(`Unsupported WebSocket adapter: ${typeof adapter}`);
  }
}
