import { InternalState, CapsuleManifest } from '../../types/platform.types';

export function buildManifests(state: InternalState): CapsuleManifest[] {
  const manifests: CapsuleManifest[] = [];
  for (const [capsuleName, capsuleEntry] of state.capsules) {
    const caps: CapsuleManifest['caps'] = [];
    const routes: CapsuleManifest['routes'] = [];
    const eventPublishes = new Set<string>();
    const eventSubscribes: { event: string }[] = [];
    const actions: Record<string, unknown> = {};

    for (const [capPath, capFile] of state.caps) {
      if (capFile.capsuleName !== capsuleName) continue;
      const capMeta = capFile.meta;
      caps.push({
        name: capMeta.name,
        capPath,
        description: capMeta.description,
        inputSchema: capMeta.inputSchema,
        outputSchema: capMeta.outputSchema,
        routes: capMeta.routes,
        hooks: capMeta.hooks,
        events: capMeta.events,
      });
      actions[capMeta.name] = {
        handler: capFile.handler,
        meta: capMeta,
        description: capMeta.description,
        inputSchema: capMeta.inputSchema,
        outputSchema: capMeta.outputSchema,
        routes: capMeta.routes,
        hooks: capMeta.hooks,
        events: capMeta.events,
      };
      if (capMeta.routes) {
        for (const route of capMeta.routes) {
          routes.push({
            method: route.method,
            path: route.path,
            cap: capPath,
            action: route.action,
          });
        }
      }
      if (capMeta.events?.publishes) {
        for (const evt of capMeta.events.publishes) eventPublishes.add(evt);
      }
      if (capMeta.events?.subscribes) {
        for (const sub of capMeta.events.subscribes) eventSubscribes.push(sub);
      }
    }

    manifests.push({
      name: capsuleName,
      dependencies: capsuleEntry.def.dependencies,
      requires: capsuleEntry.def.dependencies,
      caps,
      actions,
      routes: routes.length > 0 ? routes : undefined,
      events: {
        publishes: eventPublishes.size > 0 ? Array.from(eventPublishes) : undefined,
        subscribes: eventSubscribes.length > 0 ? eventSubscribes : undefined,
      },
    });
  }
  return manifests;
}
