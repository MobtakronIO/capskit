import { CapsuleManifest } from '@capskit/types';
import * as fs from 'fs';
import * as path from 'path';

export async function loadCapsules(capsulesDir: string): Promise<CapsuleManifest[]> {
  const manifests: CapsuleManifest[] = [];

  if (!fs.existsSync(capsulesDir)) {
    return manifests;
  }

  const entries = fs.readdirSync(capsulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifestPath = path.join(capsulesDir, entry.name, 'manifest.ts');
      const manifestJsPath = path.join(capsulesDir, entry.name, 'manifest.js');
      
      let finalPath = '';
      if (fs.existsSync(manifestPath)) {
        finalPath = manifestPath;
      } else if (fs.existsSync(manifestJsPath)) {
        finalPath = manifestJsPath;
      }

      if (finalPath) {
        try {
          // In Windows, absolute paths must be prefixed with file:// for dynamic import()
          const module = await import(`file://${finalPath}`);
          const manifest = module.manifest || module.default;
          if (manifest) {
            manifests.push(manifest);
          }
        } catch (error) {
          console.error(`Failed to load manifest at ${finalPath}:`, error);
        }
      }
    }
  }

  return manifests;
}
