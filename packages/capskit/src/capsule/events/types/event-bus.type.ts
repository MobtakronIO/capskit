export interface EventBus {
  emit(event: string, data: unknown): void;
  dispatch(event: string, data: unknown): void;
  subscribe(sub: EventSubscriber, patterns: string[]): void;
  unsubscribe(id: string): void;
}

export interface EventSubscriber {
  id: string;
  patterns: string[];
  onEvent: (event: string, data: unknown, pattern: string) => void;
}

export type EventHandler = (event: string, data: unknown) => void | Promise<void>;
export type EventPattern = string | RegExp;
