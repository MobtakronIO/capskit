import * as fs from 'fs';
import * as path from 'path';

export const filesystemRepository = {
  /**
   * Recursively find all capsule.ts files under a directory.
   * A capsule.ts file is the entry point of a capsule (NOT inside caps/ subdirs).
   */
  async discoverCapsules(dir: string): Promise<string[]> {
    const results: string[] = [];
    await scanDir(dir, results);
    return results;
  },

  /**
   * Scan a capsule's caps/ directory for .cap.ts files.
   * Returns absolute paths to all cap files.
   */
  async discoverCaps(capsuleDir: string): Promise<string[]> {
    const capsDir = path.join(capsuleDir, 'caps');
    if (!fs.existsSync(capsDir)) return [];
    const files: string[] = [];
    await scanCapsDir(capsDir, files);
    return files;
  },

  /**
   * Read and parse a TypeScript file's default export and named 'meta' export.
   * Uses dynamic import.
   */
  async readCapFile(filePath: string) {
    const mod = await import(filePath);
    return {
      meta: mod.meta,
      handler: mod.default,
    };
  },

  /**
   * Read a capsule.ts file's default export.
   */
  async readCapsuleDef(filePath: string) {
    const mod = await import(filePath);
    return mod.default;
  },
};

async function scanDir(dir: string, results: string[], depth = 0) {
  if (depth > 10) return; // prevent infinite recursion
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, dist, .git, etc.
      if (['node_modules', 'dist', '.git', 'test', 'tests', '__tests__'].includes(entry.name)) continue;
      // If this dir has a capsule.ts, record it and don't go deeper
      const capsuleFile = path.join(fullPath, 'capsule.ts');
      const capsFile = path.join(fullPath, 'caps.ts');
      if (fs.existsSync(capsuleFile)) {
        results.push(capsuleFile);
      } else if (fs.existsSync(capsFile)) {
        results.push(capsFile);
      } else {
        await scanDir(fullPath, results, depth + 1);
      }
    }
  }
}

async function scanCapsDir(dir: string, files: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanCapsDir(fullPath, files);
    } else if (entry.name.endsWith('.cap.ts') && entry.name !== 'platform.cap.ts') {
      files.push(fullPath);
    }
  }
}
