// Version information for capskit
// This is set at build time via the package.json version

// Build-time injected version (set by bundlers like tsup/rollup)
declare const __CAPSKIT_VERSION__: string | undefined;

let versionCache: string | undefined;

/**
 * Get the current capskit version.
 * Uses build-time injection when available, falls back to dynamic import for ESM compatibility.
 */
export async function getCapsKitVersion(): Promise<string> {
  if (versionCache) {
    return versionCache;
  }
  
  // Prefer build-time injected version (works in both ESM and CJS)
  if (typeof __CAPSKIT_VERSION__ === 'string') {
    versionCache = __CAPSKIT_VERSION__;
    return versionCache;
  }
  
  // Fallback: try dynamic import for ESM environments
  try {
    // @ts-ignore - JSON module with assert/import attributes may not be typed
    const packageJson = await import('../../../package.json', { with: { type: 'json' } });
    const pkg = packageJson.default as { version?: string } | undefined;
    versionCache = pkg?.version ?? '0.3.0';
    return versionCache;
  } catch {
    // Legacy fallback: try require for CJS environments
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const packageJson = require('../../../package.json') as { version?: string };
      versionCache = packageJson.version ?? '0.3.0';
      return versionCache;
    } catch {
      // Final fallback for bundled environments
      versionCache = '0.3.0';
      return versionCache;
    }
  }
}

/**
 * Synchronous version getter for backwards compatibility.
 * Returns cached value or default. Use async getCapsKitVersion() for accurate results.
 */
export function getCapsKitVersionSync(): string {
  return versionCache ?? '0.3.0';
}

/**
 * Get the capskit version as an array of numbers.
 * Useful for comparison operations.
 */
export async function getCapsKitVersionParts(): Promise<[number, number, number]> {
  const version = await getCapsKitVersion();
  const parts = version.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
