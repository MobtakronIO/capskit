import { CapsuleDefinition } from '../../types/capsule-definition.type';

export function validateManifest(manifest: any): void {
  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    const err = new Error('Capsule manifest must have a non-empty name');
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
  if (!VALID_NAME.test(manifest.name)) {
    const err = new Error(`Capsule manifest has invalid name "${manifest.name}". Name must be alphanumeric, hyphens, and underscores only`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!manifest.actions || typeof manifest.actions !== 'object') {
    const err = new Error(`Capsule manifest "${manifest.name}" must have an actions object`);
    (err as any).code = 'VALIDATION_ERROR';
    throw err;
  }
  for (const actionName of Object.keys(manifest.actions)) {
    if (!VALID_NAME.test(actionName)) {
      const err = new Error(`Capsule "${manifest.name}" has invalid action name "${actionName}". Action names must be alphanumeric, hyphens, and underscores only`);
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }
  }
}

export function toCapsuleDefinition(manifest: any): CapsuleDefinition {
  validateManifest(manifest);
  const manifestRoutes = manifest.routes || [];
  const manifestSubscribes = manifest.events?.subscribes || [];
  const manifestPublishes = manifest.events?.publishes || [];

  return {
    name: manifest.name,
    dependencies: manifest.dependencies || manifest.requires,
    caps: Object.entries(manifest.actions || {}).map(([actionName, actionDef]: [string, any]) => {
      const matchedRoutes = manifestRoutes.filter((r: any) => r.action === actionName);
      const actionRoutes = [
        ...(actionDef.routes || []),
        ...matchedRoutes.map((r: any) => ({
          method: r.method,
          path: r.path,
          action: r.action,
        })),
      ];

      // Match manifest-level event subscriptions for this action
      const matchedSubscribes = manifestSubscribes.filter((s: any) => s.action === actionName);
      const actionSubscribes = [
        ...(actionDef.events?.subscribes || []),
        ...matchedSubscribes.map((s: any) => ({
          event: s.event,
        })),
      ];

      const actionPublishes = actionDef.events?.publishes || [];

      const actionEvents = (actionSubscribes.length > 0 || actionPublishes.length > 0)
        ? {
            subscribes: actionSubscribes.length > 0 ? actionSubscribes : undefined,
            publishes: actionPublishes.length > 0 ? actionPublishes : undefined,
          }
        : actionDef.events;

      return {
        meta: {
          name: actionName,
          inputSchema: actionDef.inputSchema || actionDef.schema,
          outputSchema: actionDef.outputSchema,
          resiliency: actionDef.resiliency,
          hooks: actionDef.hooks,
          events: actionEvents,
          routes: actionRoutes.length > 0 ? actionRoutes : undefined,
        },
        handler: actionDef.handler,
      };
    }),
  };
}
