import { CapsuleDefinition, CapFile } from '../../types/capsule-definition.type';
import { BootState } from '../boot-helpers.helper';
import { BUILTIN_CAPSULES } from '../../constants';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { filesystemRepository } from '../../repository/filesystem.repository';
import { discoverCaps } from '../discover-caps.helper';

export async function scanUserCapsules(capsuleDirs: string[], state: BootState): Promise<void> {
  for (const dir of capsuleDirs) {
    const directCapsule = path.join(dir, 'capsule.ts');
    const directCaps = path.join(dir, 'caps.ts');
    let capsulePaths: string[] = [];

    if (fs.existsSync(directCapsule)) {
      capsulePaths.push(directCapsule);
    } else if (fs.existsSync(directCaps)) {
      capsulePaths.push(directCaps);
    } else {
      capsulePaths = await filesystemRepository.discoverCapsules(dir);
    }

    for (const capsulePath of capsulePaths) {
      let capsuleDef: CapsuleDefinition;
      let capsuleDir: string;

      if (capsulePath.endsWith('capsule.ts')) {
        capsuleDef = await filesystemRepository.readCapsuleDef(capsulePath);
        capsuleDir = capsulePath.replace(/capsule\.ts$/, '');
      } else {
        throw new Error(`Unsupported capsule file format: ${capsulePath}. Legacy registry formats (caps.ts) have been removed.`);
      }


      state.capsules.set(capsuleDef.name, { def: capsuleDef, dir: capsuleDir });

      if (capsuleDef.caps) {
        for (const cap of capsuleDef.caps) {
          const capPath = `${capsuleDef.name}.${cap.meta.name}`;
          state.caps.set(capPath, {
            meta: cap.meta,
            handler: cap.handler,
            capsuleName: capsuleDef.name,
            filePath: `virtual://${capsuleDef.name}/${cap.meta.name}`,
            capsuleDef,
          });
        }
      } else {
        const caps = await discoverCaps(capsuleDir, capsuleDef.name);
        for (const cap of caps) {
          const capPath = `${cap.capsuleName}.${cap.meta.name}`;
          state.caps.set(capPath, { ...cap, capsuleDef });
        }
      }
    }
  }
}