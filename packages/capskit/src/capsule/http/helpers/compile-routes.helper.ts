import { CompiledRoute, BuildRouterResult } from '../types/compiled-route.type';
import { CapMeta } from '../../kernel/types/cap-meta.type';

/**
 * Compile all CapMeta routes from loaded capsules into a unified format.
 */
export function compileRoutes(
  allCaps: { capsuleName: string; meta: CapMeta }[],
): BuildRouterResult {
  const routes: CompiledRoute[] = [];
  const capsulesWithRoutes = new Set<string>();

  for (const cap of allCaps) {
    if (!cap.meta.routes) continue;

    capsulesWithRoutes.add(cap.capsuleName);

    const hooks = cap.meta.hooks || [];
    const hookConfig = Array.isArray(hooks)
      ? { pre: hooks as string[], post: [] as string[] }
      : { pre: (hooks as { pre?: string[]; post?: string[] }).pre || [], post: (hooks as { pre?: string[]; post?: string[] }).post || [] };

    for (const route of cap.meta.routes) {
      routes.push({
        method: route.method,
        path: route.path,
        cap: `${cap.capsuleName}.${cap.meta.name}`,
        capsuleName: cap.capsuleName,
        hooks: hookConfig,
        inputSchema: cap.meta.inputSchema,
        outputSchema: cap.meta.outputSchema,
        description: cap.meta.description,
      });
    }
  }

  return {
    routes,
    totalRoutes: routes.length,
    capsulesWithRoutes: capsulesWithRoutes.size,
  };
}
