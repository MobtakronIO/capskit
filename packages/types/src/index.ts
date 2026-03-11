export interface CapsuleManifest {
  name: string;
  requires?: string[];
  actions: Record<string, ActionDefinition>;
  events?: {
    publishes?: string[];
    subscribes?: EventSubscription[];
  };
  routes?: RouteDefinition[];
}

export interface ActionDefinition {
  handler: string | ActionHandler;
  description?: string;
}

export type ActionHandler = (input: any, context: ActionContext) => Promise<any>;

export interface ActionContext {
  params?: any;
  body?: any;
  query?: any;
  deps: Record<string, any>;
  emit: (event: string, data: any) => void;
  call: (action: string, payload: any) => Promise<any>;
}

export interface EventSubscription {
  event: string;
  action: string;
}

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  action: string;
  schema?: any; // Zod schema
  traits?: Record<string, any>;
}

export interface PlatformConfig {
  capsulesDir?: string;
  dependencies?: Record<string, any>;
}

export interface IPlatform {
  start(): Promise<void>;
  call(actionName: string, payload: any): Promise<any>;
  emit(event: string, data: any): void;
}
