import { CompiledWSEndpoint, BuildWSResult } from '../types/compiled-endpoint.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

/**
 * Compile all CapMeta WS events from loaded capsules into a unified format.
 * WS endpoints are derived from cap meta — caps that have events or special WS routes.
 */
export function compileEndpoints(
  allCaps: { capsuleName: string; meta: CapMeta }[],
): BuildWSResult {
  const endpoints: CompiledWSEndpoint[] = [];
  const capsulesWithEndpoints = new Set<string>();

  for (const cap of allCaps) {
    const hooks = cap.meta.hooks || [];
    const hookConfig = Array.isArray(hooks)
      ? { pre: hooks as string[], post: [] as string[] }
      : { pre: (hooks as { pre?: string[]; post?: string[] }).pre || [], post: (hooks as { pre?: string[]; post?: string[] }).post || [] };

    // WS endpoints come from caps that declare WS-specific routes or events
    // For now, we extract from routes that have WS method or from events.subscribes
    // This is a placeholder — the actual WS route extraction depends on how caps declare WS endpoints
    if (cap.meta.routes) {
      for (const route of cap.meta.routes) {
        // If the route is meant to be a WS endpoint (can be identified by path pattern or metadata)
        // For the initial implementation, we include all routes as potential WS endpoints
        // The adapter decides which transport to use
        endpoints.push({
          event: route.path,
          cap: `${cap.capsuleName}.${cap.meta.name}`,
          capsuleName: cap.capsuleName,
          hooks: hookConfig,
          description: cap.meta.description,
        });
        capsulesWithEndpoints.add(cap.capsuleName);
      }
    }
  }

  return {
    endpoints,
    totalEndpoints: endpoints.length,
    capsulesWithEndpoints: capsulesWithEndpoints.size,
  };
}
