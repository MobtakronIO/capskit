export interface CompiledWSEndpoint {
  event: string;         // WS event name
  cap: string;        // "capsule.cap" format
  capsuleName: string;
  hooks: { pre: string[]; post: string[] };
  description?: string;
}

export interface BuildWSResult {
  endpoints: CompiledWSEndpoint[];
  totalEndpoints: number;
  capsulesWithEndpoints: number;
}
