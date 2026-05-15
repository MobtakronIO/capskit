import { ActionInput, CapContext } from '../../../../types';
import { HttpAdapter } from '../../src/types';
import {
  loadAdapterManifest,
  checkVersionCompatibility,
  buildIncompatibilityError,
} from '../../../../kernel/adapter-validation';
import { getCapsKitVersion } from '../../../../kernel/version';

/**
 * Cap: buildRouter — Returns an Elysia Router containing all platform
 * capabilities mapped to HTTP endpoints.
 *
 * Actions:
 * - buildRouter
 */
export default class BuildRouterCap {
  [action: string]: any;

  async buildRouter(payload: ActionInput, context: CapContext): Promise<{ router: any }> {
    const { adapter = 'elysia', traitHandlers = {} } = payload?.body || payload || {};
    const capskit = context.deps.capskit;

    let adapterFn: HttpAdapter | undefined;

    if (typeof adapter === 'function') {
      adapterFn = adapter as HttpAdapter;
    } else if (typeof adapter === 'string') {
      const packageName = adapter === 'elysia' ? '@mobtakronio/elysia' : adapter;
      try {
        const module = await import(packageName);
        // Prefer createRouter (specific HTTP adapter) over default (unified adapter)
        adapterFn = module.createRouter || module.default || (typeof module === 'function' ? module : undefined);

        if (!adapterFn) {
          throw new Error(
            `Package "${packageName}" does not export a valid HTTP adapter (expected default export or "createRouter").`,
          );
        }

        const manifest = await loadAdapterManifest(packageName, module);
        if (manifest) {
          const capskitVersion = await getCapsKitVersion();
          if (manifest.capabilities.includes('http')) {
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
            `HTTP adapter "${packageName}" not found. Run 'npm install ${packageName}' to use it.`,
          );
        }
        throw error;
      }
    }

    if (adapterFn) {
      return { router: await adapterFn(capskit, { traitHandlers }) };
    }

    throw new Error(`Unsupported HTTP adapter: ${typeof adapter}`);
  }
}
