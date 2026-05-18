import type { EventHandler } from './types/client.type';

interface Subscription {
  id: string;
  patterns: string[];
  handler: EventHandler;
}

/**
 * Matches an event name against a wildcard pattern.
 * - `*` matches everything
 * - `orders.*` matches `orders.created`, `orders.updated`, etc.
 * - `orders.*.items` matches `orders.123.items`
 * - Exact match when no wildcards
 */
export function matchEventPattern(pattern: string, event: string): boolean {
  if (pattern === '*') return true;
  if (pattern === event) return true;

  const patternParts = pattern.split('.');
  const eventParts = event.split('.');

  if (patternParts.length !== eventParts.length) {
    // Allow `*` at the last position to match remaining segments
    if (patternParts.length < eventParts.length) {
      const lastPattern = patternParts[patternParts.length - 1];
      if (lastPattern === '*') {
        // Check all parts before the last wildcard match
        for (let i = 0; i < patternParts.length - 1; i++) {
          if (patternParts[i] !== '*' && patternParts[i] !== eventParts[i]) {
            return false;
          }
        }
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (patternParts[i] !== eventParts[i]) return false;
  }

  return true;
}

export class EventBus {
  private subscriptions = new Map<string, Subscription>();

  subscribe(id: string, patterns: string[], handler: EventHandler): void {
    this.subscriptions.set(id, { id, patterns, handler });
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);
  }

  dispatch(event: string, data: unknown): void {
    for (const sub of this.subscriptions.values()) {
      for (const pattern of sub.patterns) {
        if (matchEventPattern(pattern, event)) {
          sub.handler(data, event);
          break; // Only call handler once per subscription even if multiple patterns match
        }
      }
    }
  }

  clear(): void {
    this.subscriptions.clear();
  }

  get size(): number {
    return this.subscriptions.size;
  }
}
