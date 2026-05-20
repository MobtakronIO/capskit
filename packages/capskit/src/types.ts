// Types - comprehensive type definitions for CapsKit

export interface ICapsKit {
  start(): Promise<{ status: string; capsuleCount: number; capCount: number }>;
  call(capPath: string, payload?: unknown): Promise<unknown>;
  use<TCapsule = unknown>(capsuleName: string): TCapsule;
  emit(event: string, data: unknown): void;
  tell(capPath: string, payload: unknown): void;
  describe(capsuleName: string): CapsuleManifest | undefined;
  getManifests(): CapsuleManifest[];
  addHook(hook: { name: string; handler: CapHandler }): void;
  shutdown(): Promise<{ status: string }>;
}

export interface CapMeta {
  name: string;
  routes?: CapRoute[];
  events?: { publishes?: string[]; subscribes?: CapEventSubscription[] };
  dependencies?: string[];
  description?: string;
}

export interface CapRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  path: string;
  cap: string;
  action: string;
}

export interface CapEventSubscription {
  event: string;
  action: string;
}

export interface CapActionMeta {
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export type CapHandler = (input: unknown, ctx: unknown) => Promise<unknown> | unknown;
export interface CapInput {
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}
export interface CapContext {
  deps: Record<string, unknown>;
  call: (path: string, payload?: unknown) => Promise<unknown>;
}
export interface KernelDeps { capskit?: ICapsKit; [key: string]: unknown; }

export interface CapDefinition {
  class: new (deps?: Record<string, unknown>) => unknown;
  meta: CapMeta;
  dependencies?: string[];
}

export interface CapsuleRegistry {
  name: string;
  caps: Array<{ class: new (deps?: Record<string, unknown>) => unknown; meta: CapMeta }>;
  dependencies?: string[];
}

export interface CapsuleManifest {
  name: string;
  version?: string;
  actions: Record<string, { handler: (...args: unknown[]) => unknown; meta?: CapMeta; description?: string }>;
  routes?: Array<{ method: string; path: string; action: string }>;
  dependencies?: string[];
  requires?: string[];
  events?: { publishes?: string[]; subscribes?: CapEventSubscription[] };
}

export interface CapsuleDefinition {
  name: string;
  dependencies?: string[];
}

export interface CapsuleHook {
  name: string;
  caps?: string | string[];
}

export interface CapFile {
  meta: CapMeta;
  handler: CapHandler;
  capsuleName: string;
  filePath: string;
}

export interface HookCap {
  name: string;
  handler: CapHandler;
}

export interface HookPipeline {
  pre: HookCap[];
  post: HookCap[];
  handler: CapHandler;
}

export interface CapsKitInstance {
  state: unknown;
  call: CapHandler;
  use: CapHandler;
  register: CapHandler;
  shutdown: CapHandler;
  boot: CapHandler;
  describe: CapHandler;
  rpc: CapHandler;
}

export interface InternalState {
  capsules: Map<string, unknown>;
  caps: Map<string, unknown>;
  allCaps: Map<string, unknown>;
  dependencies: Record<string, string[]>;
  booted: boolean;
}

export interface ActionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface ActionError {
  code: string;
  message: string;
  status?: number;
}

export interface CapsuleFormatDetection {
  kind: 'caps-registry' | 'cap-directories' | 'legacy-manifest' | 'unknown';
  hasCapsTs: boolean;
  hasCapDirs: boolean;
  hasManifest: boolean;
}

export interface EventBus {
  emit(event: string, data: unknown): void;
  subscribe(sub: { id: string; patterns: string[]; onEvent: (e: string, d: unknown, p: string) => void }, patterns: string[]): void;
  unsubscribe(id: string): void;
}

export interface EventSubscriber {
  id: string;
  patterns: string[];
  onEvent: (event: string, data: unknown, pattern: string) => void;
}

export type EventHandler = (event: string, data: unknown) => void | Promise<void>;
export type EventPattern = string | RegExp;

export interface KernelLifecycle {
  hooks: Map<string, Array<KernelLifecycleHook>>;
  addHook(hook: KernelLifecycleHook): void;
}

export interface KernelLifecycleHook {
  name: string;
  handler: CapHandler;
}

export interface KernelLifecycleManager {
  lifecycle: KernelLifecycle;
  executeHook(name: string, context?: unknown): Promise<void>;
}

export function redactPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization', 'key'];
  if (Array.isArray(payload)) {
    return payload.map(redactPayload);
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (sensitiveKeys.includes(k)) {
      result[k] = '[REDACTED]';
    } else {
      result[k] = redactPayload(v);
    }
  }
  return result;
}
