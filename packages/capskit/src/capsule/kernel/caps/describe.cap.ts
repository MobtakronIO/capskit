import { CapInput, CapContext } from '../types/cap-input.type';
import { CapMeta, CapRoute } from '../types/cap-meta.type';
import { CapFile } from '../types/capsule-definition.type';
import { CapsuleManifest, CapsuleCapManifest, RouteManifest } from '../types/capsule-manifest.type';

export const meta: CapMeta = {
  name: 'describe',
  kind: 'action',
  description: 'Returns the full runtime manifest for all registered capsules',
};

export default async function describeCaps(_input: CapInput, ctx: CapContext): Promise<{
  capsules: CapsuleManifest[];
  capsuleCount: number;
  capCount: number;
}> {
  const capsulesMap = ctx.deps.capsules;
  const capsMap = ctx.deps.capsMap;

  const capsules: CapsuleManifest[] = [];

  for (const [capsuleName, capsuleEntry] of capsulesMap) {
    const capsuleCaps: CapsuleCapManifest[] = [];
    const routes: RouteManifest[] = [];
    const eventPublishes = new Set<string>();
    const eventSubscribes: { event: string }[] = [];

    for (const [capPath, capFile] of capsMap) {
      if (capFile.capsuleName !== capsuleName) continue;

      const capMeta = capFile.meta;

      capsuleCaps.push({
        name: capMeta.name,
        kind: capMeta.kind,
        capPath,
        description: capMeta.description,
        inputSchema: capMeta.inputSchema,
        outputSchema: capMeta.outputSchema,
        routes: capMeta.routes,
        hooks: capMeta.hooks,
        events: capMeta.events,
      });

      if (capMeta.routes) {
        for (const route of capMeta.routes) {
          routes.push({
            method: route.method,
            path: route.path,
            cap: capPath,
            action: route.action,
            description: capMeta.description,
            inputSchema: capMeta.inputSchema,
            outputSchema: capMeta.outputSchema,
          });
        }
      }

      if (capMeta.events?.publishes) {
        for (const evt of capMeta.events.publishes) {
          eventPublishes.add(evt);
        }
      }

      if (capMeta.events?.subscribes) {
        for (const sub of capMeta.events.subscribes) {
          eventSubscribes.push(sub);
        }
      }
    }

    capsules.push({
      name: capsuleName,
      dependencies: capsuleEntry.def.dependencies,
      caps: capsuleCaps,
      routes: routes.length > 0 ? routes : undefined,
      events: {
        publishes: eventPublishes.size > 0 ? Array.from(eventPublishes) : undefined,
        subscribes: eventSubscribes.length > 0 ? eventSubscribes : undefined,
      },
    });
  }

  let capCount = 0;
  for (const capsule of capsules) {
    capCount += capsule.caps.length;
  }

  return {
    capsules,
    capsuleCount: capsules.length,
    capCount,
  };
}
