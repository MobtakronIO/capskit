import { CapsuleManifest } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

export async function loadCapsules(capsulesDir: string): Promise<CapsuleManifest[]> {
  const manifests: CapsuleManifest[] = [];

  if (!fs.existsSync(capsulesDir)) {
    return manifests;
  }

  const entries = fs.readdirSync(capsulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifestPath = path.resolve(capsulesDir, entry.name, 'manifest.ts');
      const manifestJsPath = path.resolve(capsulesDir, entry.name, 'manifest.js');
      
      let finalPath: string | null = null;
      if (fs.existsSync(manifestPath)) {
        finalPath = manifestPath;
      } else if (fs.existsSync(manifestJsPath)) {
        finalPath = manifestJsPath;
      }

      if (finalPath) {
        try {
          // Use Node's pathToFileURL for cross-platform safe URL conversion
          const module = await import(pathToFileURL(finalPath).href);
          const manifest = module.service || module.manifest || module.default;
          if (manifest) {
            // Store the capsule's root directory for string handler resolution
            const capsuleDir = path.dirname(finalPath);
            (manifest as any).__capsuleDir = capsuleDir;
            manifests.push(manifest);
          }
        } catch (error: any) {
          // In production, we might want to fail fast or collect errors for diagnostics.
          // For now, we'll re-throw to fail fast during development to surface issues clearly.
          throw new Error(`Failed to load capsule manifest at ${finalPath}: ${error.message}`);
        }
      }
    }
  }

  return manifests;
}
