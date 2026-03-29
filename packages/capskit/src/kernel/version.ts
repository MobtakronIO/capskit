// Version information for capskit
// This is set at build time via the package.json version

let versionCache: string | undefined;

/**
 * Get the current capskit version.
 * Uses a cached value if available to avoid repeated require() calls.
 */
export function getCapsKitVersion(): string {
  if (versionCache) {
    return versionCache;
  }
  
  // Try to get version from package.json
  // In production, this is bundled with the package
  try {
    // Dynamic require for CommonJS interop
    const packageJson = require('../../../package.json') as { version?: string };
    versionCache = packageJson.version ?? '0.3.0';
    return versionCache;
  } catch {
    // Fallback for ESM or bundled environments
    versionCache = '0.3.0';
    return versionCache;
  }
}

/**
 * Get the capskit version as an array of numbers.
 * Useful for comparison operations.
 */
export function getCapsKitVersionParts(): [number, number, number] {
  const version = getCapsKitVersion();
  const parts = version.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
