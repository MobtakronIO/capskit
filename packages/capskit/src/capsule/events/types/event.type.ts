export interface EventPayload {
  event: string;
  data: unknown;
  timestamp?: number;
  source?: string;
}

export type EventName = string;
