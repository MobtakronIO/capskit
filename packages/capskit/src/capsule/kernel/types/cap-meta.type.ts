export interface CapRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  cap: string;
  action: string;
}

export interface CapEventSubscription {
  event: string;
}

export interface CapMeta {
  name: string;
  kind: 'action' | 'hook';
  routes?: CapRoute[];
  events?: {
    publishes?: string[];
    subscribes?: CapEventSubscription[];
  };
  /** Pre/post hook cap paths. Note: "interceptors" was the original design term; hooks are the implementation. */
  hooks?: string[] | { pre?: string[]; post?: string[] };
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  actions?: Record<string, CapActionMeta>;
  dependencies?: string[];
  description?: string;
}

export interface CapActionMeta {
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  cache?: { ttl?: number; key?: string };
  resiliency?: {
    fallback?: { type: string; chain?: string[] };
    circuitBreaker?: { failureThreshold?: number; resetTimeoutMs?: number };
  };
}
