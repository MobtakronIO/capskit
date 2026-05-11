import { CapsuleManifest } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Load a single capsule manifest from a directory.
 * Looks for manifest.ts or manifest.js inside the given directory.
 * Returns the manifest with __capsuleDir attached, or null if no manifest found.
 */
async function loadManifestFromDir(dirPath: string): Promise<CapsuleManifest | null> {
  const manifestTsPath = path.resolve(dirPath, 'manifest.ts');
  const manifestJsPath = path.resolve(dirPath, 'manifest.js');

  let finalPath: string | null = null;
  if (fs.existsSync(manifestTsPath)) {
    finalPath = manifestTsPath;
  } else if (fs.existsSync(manifestJsPath)) {
    finalPath = manifestJsPath;
  }

  if (!finalPath) {
    return null;
  }

  try {
    // Use Node's pathToFileURL for cross-platform safe URL conversion
    const module = await import(pathToFileURL(finalPath).href);
    const manifest = module.service || module.manifest || module.default;
    if (manifest) {
      // Store the capsule's root directory for string handler resolution
      (manifest as any).__capsuleDir = dirPath;
      return manifest as CapsuleManifest;
    }
    return null;
  } catch (error: any) {
    // Fail fast during development to surface issues clearly
    throw new Error(`Failed to load capsule manifest at ${finalPath}: ${error.message}`);
  }
}

/**
 * Load capsules from a directory by scanning all subdirectories
 * that contain a manifest.ts or manifest.js file.
 *
 * This is the original "directory" source loader — scans ALL subdirectories
 * regardless of naming convention.
 */
export async function loadCapsules(capsulesDir: string): Promise<CapsuleManifest[]> {
  const manifests: CapsuleManifest[] = [];

  if (!fs.existsSync(capsulesDir)) {
    return manifests;
  }

  const entries = fs.readdirSync(capsulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = path.resolve(capsulesDir, entry.name);
    const manifest = await loadManifestFromDir(dirPath);
    if (manifest) {
      manifests.push(manifest);
    }
  }

  return manifests;
}

/**
 * Discover and load capsules from .cap/ directories inside a root folder.
 *
 * Scans the given root directory for subdirectories whose name ends with ".cap"
 * (e.g. "user.cap", "order.cap") and loads the manifest from each one.
 *
 * This enables a convention where capsule directories are explicitly marked
 * with a .cap suffix, making them easily identifiable in the filesystem and
 * avoiding accidental loading of non-capsule folders.
 *
 * Inside each .cap directory, the loader looks for:
 *   - manifest.ts  (TypeScript, preferred)
 *   - manifest.js  (JavaScript, fallback)
 *
 * Both .ts and .js file extensions are supported. Paths are resolved correctly
 * for cross-platform compatibility using pathToFileURL.
 *
 * @param rootDir - The root directory to scan for .cap/ subdirectories.
 * @returns Array of loaded capsule manifests (with __capsuleDir attached).
 *
 * @example
 * ```ts
 * // Given this filesystem layout:
 * // src/capsules/
 * //   user.cap/
 * //     manifest.ts
 * //     actions/create.ts
 * //   order.cap/
 * //     manifest.js
 * //     actions/place.js
 *
 * const manifests = await loadCapCapsules('./src/capsules');
 * // Returns manifests for user.cap and order.cap
 * ```
 */
export async function loadCapCapsules(rootDir: string): Promise<CapsuleManifest[]> {
  const manifests: CapsuleManifest[] = [];

  if (!fs.existsSync(rootDir)) {
    return manifests;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    // Only process directories whose name ends with ".cap"
    if (!entry.isDirectory() || !entry.name.endsWith('.cap')) {
      continue;
    }

    const dirPath = path.resolve(rootDir, entry.name);
    const manifest = await loadManifestFromDir(dirPath);
    if (manifest) {
      manifests.push(manifest);
    }
  }

  return manifests;
}
