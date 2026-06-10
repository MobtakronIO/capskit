import { CapMeta } from './cap-meta.type';
import { CapRoute } from './cap-meta.type';

/**
 * Runtime manifest for a single capsule.
 * Produced by the kernel during boot and exposed via getManifests().
 * Transportable across HTTP, WebSocket, and client boundaries.
 */
export interface CapsuleManifest {
  name: string;
  dependencies?: string[];
  requires?: string[];
  description?: string;
  caps: CapsuleCapManifest[];
  actions?: Record<string, unknown>;
  routes?: RouteManifest[];
  sockets?: SocketManifest[];
  events?: {
    publishes?: string[];
    subscribes?: { event: string }[];
  };
}

/**
 * Per-cap metadata with resolved cap path and schemas.
 */
export interface CapsuleCapManifest {
  name: string;
  capPath: string;
  actionPath?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  routes?: CapRoute[];
  hooks?: string[] | { pre?: string[]; post?: string[] };
  events?: {
    publishes?: string[];
    subscribes?: { event: string }[];
  };
}

/**
 * HTTP route entry in the manifest.
 */
export interface RouteManifest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  cap: string;
  action: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * WebSocket socket entry in the manifest.
 */
export interface SocketManifest {
  path: string;
  open?: string;
  message?: string;
  close?: string;
  drain?: string;
  description?: string;
}
