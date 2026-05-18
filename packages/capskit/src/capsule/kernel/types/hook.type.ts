import type { CapHandler } from './cap-input.type';

export interface HookCap {
  name: string;
  handler: CapHandler;
}

export interface HookPipeline {
  pre: HookCap[];
  post: HookCap[];
  handler: CapHandler;
}
