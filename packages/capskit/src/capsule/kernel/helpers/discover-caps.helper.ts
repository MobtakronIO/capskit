import { CapFile } from '../types/capsule-definition.type';
import { CapMeta } from '../types/cap-meta.type';
import { filesystemRepository } from '../repository/filesystem.repository';
import { validateCapMeta } from '../rules/validate-cap-meta.rule';

export async function discoverCaps(capsuleDir: string, capsuleName: string): Promise<CapFile[]> {
  const capPaths = await filesystemRepository.discoverCaps(capsuleDir);
  const caps: CapFile[] = [];

  for (const capPath of capPaths) {
    const { meta, handler } = await filesystemRepository.readCapFile(capPath);
    if (!meta || !handler) {
      throw new Error(`Cap file ${capPath} must export both 'meta' and 'default'`);
    }
    if (!validateCapMeta(meta)) {
      throw new Error(`Invalid CapMeta in ${capPath}: ${JSON.stringify(meta)}`);
    }
    caps.push({
      meta: meta as CapMeta,
      handler,
      capsuleName,
      filePath: capPath,
    });
  }

  return caps;
}
