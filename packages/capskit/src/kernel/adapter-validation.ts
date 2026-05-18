// Adapter validation compatibility shim

export interface AdapterManifest {
  name: string;
  version: string;
  capskitVersion: {
    min: string;
    max: string;
  };
  capabilities: string[];
}

export interface VersionCompatibilityResult {
  compatible: boolean;
  errors: string[];
}

/**
 * Validate an adapter manifest.
 */
export function validateAdapterManifest(manifest: AdapterManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!manifest.name) errors.push('Missing adapter name');
  if (!manifest.version) errors.push('Missing adapter version');
  if (!manifest.capskitVersion?.min) errors.push('Missing capskitVersion.min');
  if (!manifest.capskitVersion?.max) errors.push('Missing capskitVersion.max');
  if (!Array.isArray(manifest.capabilities)) errors.push('Missing capabilities array');
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check version compatibility.
 */
export function checkVersionCompatibility(
  adapterVersion: string,
  requiredMin: string,
  requiredMax: string,
): VersionCompatibilityResult {
  // Simple semver comparison stub
  const compatible = adapterVersion >= requiredMin && adapterVersion <= requiredMax;
  return {
    compatible,
    errors: compatible ? [] : [`Version ${adapterVersion} not compatible with ${requiredMin}-${requiredMax}`],
  };
}

/**
 * Load an adapter manifest from a file path.
 */
export async function loadAdapterManifest(_path: string): Promise<AdapterManifest> {
  throw new Error('loadAdapterManifest: filesystem loading not implemented in test shim');
}

/**
 * Build an incompatibility error message.
 */
export function buildIncompatibilityError(
  adapterName: string,
  adapterVersion: string,
  requiredMin: string,
  requiredMax: string,
): string {
  return `Adapter ${adapterName}@${adapterVersion} is incompatible with CapsKit ${requiredMin}-${requiredMax}`;
}
