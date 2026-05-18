export function parseCapPath(capPath: string): { capsule: string; cap: string } {
  const parts = capPath.split('.');
  if (parts.length !== 2) {
    throw new Error(`Invalid cap path: "${capPath}". Expected format: "capsule.cap"`);
  }
  return { capsule: parts[0], cap: parts[1] };
}
