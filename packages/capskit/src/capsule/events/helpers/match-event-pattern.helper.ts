/**
 * Check if an event name matches a pattern.
 * Supports exact match and wildcard patterns:
 * - "orders.created" matches "orders.created"
 * - "orders.*" matches "orders.created", "orders.shipped"
 * - "*" matches everything
 */
export function matchEventPattern(pattern: string, event: string): boolean {
  if (pattern === '*') return true;
  if (pattern === event) return true;

  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]+');

  return new RegExp(`^${regexPattern}$`).test(event);
}
