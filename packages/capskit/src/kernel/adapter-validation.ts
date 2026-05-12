import type { AdapterPluginManifest } from '../types';

/**
 * Lightweight semver comparison utility.
 * Parses version strings and compares major.minor.patch.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^[^0-9]*/, '').split('.').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);
  
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  return aPatch < bPatch ? -1 : aPatch > bPatch ? 1 : 0;
}

/**
 * Check if a version satisfies a range string (e.g., ">=1.0.0 <2.0.0").
 * Supports simple >= and < comparisons.
 */
function satisfiesSemver(version: string, range: string): boolean {
  const parts = range.trim().split(/\s+/);
  
  for (const part of parts) {
    const match = part.match(/^([><=]+)(.+)$/);
    if (!match) continue;
    
    const [, operator, target] = match;
    const cmp = compareSemver(version, target);
    
    if (operator === '>=' && cmp < 0) return false;
    if (operator === '>' && cmp <= 0) return false;
    if (operator === '<=' && cmp > 0) return false;
    if (operator === '<' && cmp >= 0) return false;
    if (operator === '=' && cmp !== 0) return false;
  }
  
  return true;
}

/**
 * Validate an adapter manifest object.
 * Returns the validated manifest or null if validation fails.
 */
export function validateAdapterManifest(manifest: any): AdapterPluginManifest | null {
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }
  
  // Required fields
  if (typeof manifest.name !== 'string' || !manifest.name) {
    return null;
  }
  if (typeof manifest.version !== 'string' || !manifest.version) {
    return null;
  }
  if (!manifest.capskitVersion || typeof manifest.capskitVersion !== 'object') {
    return null;
  }
  if (typeof manifest.capskitVersion.min !== 'string' || !manifest.capskitVersion.min) {
    return null;
  }
  if (manifest.capskitVersion.max !== undefined && typeof manifest.capskitVersion.max !== 'string') {
    return null;
  }
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    return null;
  }
  
  // Validate capabilities - each must be 'http' or 'websocket'
  for (const cap of manifest.capabilities) {
    if (typeof cap !== 'string' || (cap !== 'http' && cap !== 'websocket')) {
      return null;
    }
  }
  
  return {
    name: manifest.name,
    version: manifest.version,
    capskitVersion: {
      min: manifest.capskitVersion.min,
      max: manifest.capskitVersion.max,
    },
    capabilities: manifest.capabilities,
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
  };
}

/**
 * Result of version compatibility check.
 */
export interface CompatibilityResult {
  /** Whether the adapter is compatible with the given capskit version */
  compatible: boolean;
  /** Human-readable reason if incompatible */
  reason?: string;
}

/**
 * Check if an adapter version is compatible with a capskit version range.
 * Uses semver for proper version comparison including pre-release handling.
 */
export function checkVersionCompatibility(
  adapterName: string,
  capskitVersion: string,
  range: { min: string; max?: string }
): CompatibilityResult {
  // Build the range string for semver.satisfies
  // min is inclusive, max is exclusive
  let rangeStr: string;
  if (range.max) {
    rangeStr = `>=${range.min} <${range.max}`;
  } else {
    rangeStr = `>=${range.min}`;
  }
  
  if (!satisfiesSemver(capskitVersion, rangeStr)) {
    // Determine the specific reason
    const minResult = compareSemver(capskitVersion, range.min);
    if (minResult < 0) {
      // capskitVersion < range.min - adapter requires newer capskit
      return {
        compatible: false,
        reason: `Adapter '${adapterName}' requires capskit@^${range.min} but you're using @${capskitVersion}. Run 'npm install @mobtakronio/capskit@^${range.min}' to upgrade.`,
      };
    } else {
      // capskitVersion >= range.max - adapter doesn't support this capskit version yet
      return {
        compatible: false,
        reason: `Adapter '${adapterName}' supports capskit@<${range.max} but you're using @${capskitVersion}. The adapter may not be compatible with this capskit version.`,
      };
    }
  }
  
  return { compatible: true };
}

/**
 * Load and validate an adapter manifest from a package module.
 * Returns null if no manifest is exported or if validation fails.
 */
export async function loadAdapterManifest(
  packageName: string,
  module: any
): Promise<AdapterPluginManifest | null> {
  // Try to get manifest from module
  const manifest = module.manifest || module;
  
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }
  
  // If manifest has name/version, it's likely a manifest object
  if (!manifest.name || !manifest.version) {
    return null;
  }
  
  return validateAdapterManifest(manifest);
}

/**
 * Build an actionable error message for adapter compatibility issues.
 */
export function buildIncompatibilityError(
  adapterName: string,
  adapterVersion: string,
  capskitVersion: string,
  result: CompatibilityResult
): string {
  if (result.compatible) {
    return '';
  }
  
  return `Adapter compatibility error: ${result.reason}`;
}
