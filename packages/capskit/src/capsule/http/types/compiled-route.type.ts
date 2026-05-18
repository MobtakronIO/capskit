export interface CompiledRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  cap: string;        // "capsule.cap" format
  capsuleName: string;
  hooks: { pre: string[]; post: string[] };
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  description?: string;
}

export interface BuildRouterResult {
  routes: CompiledRoute[];
  totalRoutes: number;
  capsulesWithRoutes: number;
}
