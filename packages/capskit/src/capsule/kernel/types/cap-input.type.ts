import { CapMeta } from './cap-meta.type';
import { CapsuleDefinition, CapFile } from './capsule-definition.type';

export interface CapInput {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface CapEntry {
  meta: CapMeta;
  handler: CapHandler;
  capsuleName: string;
  filePath: string;
  capsuleDef?: CapsuleDefinition;
}

export interface EventsState {
  subscriptions: Map<string, { capPath: string }[]>;
  wildcardSubscribers: { pattern: string; capPath: string }[];
}

export interface KernelDeps {
  capsMap: Map<string, CapEntry>;
  allCaps: Map<string, CapEntry>;
  capsules: Map<string, { def: CapsuleDefinition; dir?: string }>;
  eventsState?: EventsState;
  dependencies: Record<string, unknown>;
}

export interface CapContext<TDeps extends KernelDeps = KernelDeps> {
  deps: TDeps;
  emit: (event: string, data: unknown) => void;
  invoke: (capPath: string, payload: unknown) => Promise<unknown>;
  tell: (capPath: string, payload: unknown) => void;
  use: <T = unknown>(capsuleName: string) => T;
  user?: unknown;
  next?: () => Promise<unknown>;
  result?: unknown;
}

export type CapHandler<TDeps extends KernelDeps = KernelDeps> = (
  input: CapInput,
  ctx: CapContext<TDeps>,
) => Promise<unknown>;
