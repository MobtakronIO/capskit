export interface CapsuleManifest {
  name: string;
  requires?: string[];
  actions: Record<string, ActionDefinition>;
  events?: {
    publishes?: string[];
    subscribes?: EventSubscription[];
  };
  // Allow system capsules to extend the manifest with their own definitions (e.g., routes, sockets)
  [key: string]: any;
}

export type ActionPreHook = (input: ActionInput, context: ActionContext) => Promise<void> | void;
export type ActionPostHook = (input: ActionInput, result: any, context: ActionContext) => Promise<any> | any;

export interface ActionDefinition {
  handler: string | ActionHandler;
  description?: string;
  pre?: ActionPreHook[];
  post?: ActionPostHook[];
  schema?: ActionSchema;
}

export interface ActionSchema {
  type: 'object';
  properties?: Record<string, any>;
  required?: string[];
}

export type ActionHandler = (input: ActionInput, context: ActionContext) => Promise<any>;

export type ActionInterceptor = (actionName: string, input: ActionInput, context: ActionContext, next: () => Promise<any>) => Promise<any>;

export interface ActionContext {
  params?: any;
  body?: any;
  query?: any;
  deps: Record<string, any>;
  emit: (event: string, data: any) => void;
  call: (action: string, payload: any) => Promise<any>;
  use: <TCapsule = any>(capsuleName: string) => TCapsule;
}

export interface ActionInput {
  body: any;
  params?: any;
  query?: Record<string, any>; // Always an object, never undefined
}

export interface EventSubscription {
  event: string;
  action: string;
}

export interface CapsKitConfig {
  capsules?: CapsuleSource[];
  capsuleDirs?: string[]; // Deprecated: use 'capsules' array for explicit precedence
  dependencies?: Record<string, any>;
  boot?: {
    action: string;
    payload?: any;
  };
}

export type CapsuleSource = 
  | { type: 'directory'; path: string }
  | { type: 'manifest'; manifest: CapsuleManifest }
  | { type: 'package'; name: string };

export interface ICapsKit {
  start(): Promise<any>;
  call(actionName: string, payload: any): Promise<any>;
  use<TCapsule = any>(capsuleName: string): TCapsule;
  describe(capsuleName: string): CapsuleManifest | undefined;
  getManifests(): CapsuleManifest[];
  emit(event: string, data: any): void;
  addInterceptor(interceptor: ActionInterceptor): void;
}
