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

export type ActionPreHook = (payload: any, context: ActionContext) => Promise<void> | void;
export type ActionPostHook = (payload: any, result: any, context: ActionContext) => Promise<any> | any;

export interface ActionDefinition {
  handler: string | ActionHandler;
  description?: string;
  pre?: ActionPreHook[];
  post?: ActionPostHook[];
}

export type ActionHandler = (input: any, context: ActionContext) => Promise<any>;

export type ActionInterceptor = (actionName: string, payload: any, context: ActionContext, next: () => Promise<any>) => Promise<any>;

export interface ActionContext {
  params?: any;
  body?: any;
  query?: any;
  deps: Record<string, any>;
  emit: (event: string, data: any) => void;
  call: (action: string, payload: any) => Promise<any>;
  use: <TCapsule = any>(capsuleName: string) => TCapsule;
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

export interface CapsKitConfig {
  capsuleDirs?: string[];
  dependencies?: Record<string, any>;
}

export interface ICapsKit {
  start(): Promise<void>;
  call(actionName: string, payload: any): Promise<any>;
  use<TCapsule = any>(capsuleName: string): TCapsule;
  describe(capsuleName: string): CapsuleManifest | undefined;
  emit(event: string, data: any): void;
  addInterceptor(interceptor: ActionInterceptor): void;
}
