import { CapHandler, KernelDeps } from './cap-input.type';
import { CapMeta } from './cap-meta.type';

/**
 * A hook applied at the capsule level, optionally scoped to specific caps.
 */
export interface CapsuleHook {
  /** Hook cap name */
  name: string;
  /** Which caps this hook applies to. '*' (default) = all caps in the capsule. */
  caps?: string | string[];
}

export interface CapsuleCap {
  meta: CapMeta;
  handler: CapHandler;
}

export interface CapsuleDefinition {
  name: string;
  dependencies?: string[];
  /** Hooks applied to all caps in this capsule. Merged with per-cap hooks. */
  hooks?: {
    pre?: CapsuleHook[];
    post?: CapsuleHook[];
  };
  boot?: {
    init?: (context: { deps: KernelDeps }) => Promise<void>;
    shutdown?: (context: { deps: KernelDeps }) => Promise<void>;
  };
  /** Inline caps for factory-created capsules (no filesystem directory). */
  caps?: CapsuleCap[];
}

export interface CapFile {
  meta: CapMeta;
  handler: CapHandler;
  capsuleName: string;
  filePath: string;
}
