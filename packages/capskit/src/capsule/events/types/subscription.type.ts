export interface SubscriptionEntry {
  capPath: string;
  pattern?: string;  // For wildcard subscriptions
}

export type SubscriptionMap = Map<string, SubscriptionEntry[]>;
export type WildcardSubscribers = { pattern: string; capPath: string }[];
