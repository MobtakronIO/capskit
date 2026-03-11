interface CapsuleManifest {
    name: string;
    requires?: string[];
    actions: Record<string, ActionDefinition>;
    events?: {
        publishes?: string[];
        subscribes?: EventSubscription[];
    };
    routes?: RouteDefinition[];
}
type ActionPreHook = (payload: any, context: ActionContext) => Promise<void> | void;
type ActionPostHook = (payload: any, result: any, context: ActionContext) => Promise<any> | any;
interface ActionDefinition {
    handler: string | ActionHandler;
    description?: string;
    pre?: ActionPreHook[];
    post?: ActionPostHook[];
}
type ActionHandler = (input: any, context: ActionContext) => Promise<any>;
type ActionInterceptor = (actionName: string, payload: any, context: ActionContext, next: () => Promise<any>) => Promise<any>;
interface ActionContext {
    params?: any;
    body?: any;
    query?: any;
    deps: Record<string, any>;
    emit: (event: string, data: any) => void;
    call: (action: string, payload: any) => Promise<any>;
    use: <TCapsule = any>(capsuleName: string) => TCapsule;
}
interface EventSubscription {
    event: string;
    action: string;
}
interface RouteDefinition {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    action: string;
    schema?: any;
    traits?: Record<string, any>;
}
interface CapsKitConfig {
    capsuleDirs?: string[];
    dependencies?: Record<string, any>;
}
interface ICapsKit {
    start(): Promise<void>;
    call(actionName: string, payload: any): Promise<any>;
    use<TCapsule = any>(capsuleName: string): TCapsule;
    describe(capsuleName: string): CapsuleManifest | undefined;
    emit(event: string, data: any): void;
    addInterceptor(interceptor: ActionInterceptor): void;
}

declare class CapsKit implements ICapsKit {
    private config;
    private actions;
    private manifests;
    private interceptors;
    private eventRegistry;
    private dependencies;
    constructor(config: CapsKitConfig);
    start(): Promise<void>;
    private registerCapsule;
    private validateDependencies;
    addInterceptor(interceptor: ActionInterceptor): void;
    call(actionName: string, payload: any): Promise<any>;
    use<TCapsule = any>(capsuleName: string): TCapsule;
    describe(capsuleName: string): CapsuleManifest | undefined;
    emit(event: string, data: any): void;
    getManifests(): CapsuleManifest[];
}
declare function createCapsKit(config: CapsKitConfig): Promise<CapsKit>;

declare function loadCapsules(capsulesDir: string): Promise<CapsuleManifest[]>;

export { type ActionContext, type ActionDefinition, type ActionHandler, type ActionInterceptor, type ActionPostHook, type ActionPreHook, CapsKit, type CapsKitConfig, type CapsuleManifest, type EventSubscription, type ICapsKit, type RouteDefinition, createCapsKit, loadCapsules };
