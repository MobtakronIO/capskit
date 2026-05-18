export function isValidEventName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 0) return false;
  // Allow dots for namespacing and * for wildcards
  return /^[a-zA-Z0-9._*-]+$/.test(name);
}
