import type { CapturedEvent } from './types';

/**
 * Creates an event capture array and emit function for testing
 * 
 * @returns An object with the events array and an emit function
 * 
 * @example
 * ```typescript
 * const { events, emit } = captureEvents();
 * 
 * // Simulate event emission
 * emit('user:created', { id: 1, name: 'Alice' });
 * emit('user:updated', { id: 1, name: 'Bob' });
 * 
 * console.log(events);
 * // [
 * //   { name: 'user:created', data: { id: 1, name: 'Alice' } },
 * //   { name: 'user:updated', data: { id: 1, name: 'Bob' } }
 * // ]
 * ```
 */
export function captureEvents(): { events: CapturedEvent[]; emit: (name: string, data: unknown) => void } {
  const events: CapturedEvent[] = [];
  
  function emit(name: string, data: unknown) {
    events.push({
      name,
      data,
      timestamp: Date.now()
    });
  }
  
  return { events, emit };
}

/**
 * A class-based event capture with additional utility methods
 * 
 * @example
 * ```typescript
 * const capture = new EventCapture();
 * 
 * // Use as emit function
 * capture.emit('order:created', { orderId: '123' });
 * 
 * // Check events
 * const orderEvents = capture.getEvents('order:*');
 * console.log(orderEvents.length); // 1
 * 
 * // Clear events
 * capture.clear();
 * console.log(capture.events.length); // 0
 * ```
 */
export class EventCapture {
  /**
   * All captured events
   */
  readonly events: CapturedEvent[] = [];
  
  /**
   * Captures an event
   */
  emit(name: string, data: unknown): void {
    this.events.push({
      name,
      data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Gets all captured events
   */
  getEvents(): CapturedEvent[] {
    return [...this.events];
  }
  
  /**
   * Gets events matching a pattern (supports * wildcard)
   * 
   * @param pattern - Pattern to match (e.g., 'user:*' matches 'user:created', 'user:deleted')
   */
  getEventsByPattern(pattern: string): CapturedEvent[] {
    // Convert wildcards to regex first, then escape remaining regex special characters
    const wildcardReplaced = pattern.replace(/\*/g, '<<STAR>>').replace(/\?/g, '<<QM>>');
    const escaped = wildcardReplaced.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      '^' + escaped.replace(/<<STAR>>/g, '.*').replace(/<<QM>>/g, '.') + '$'
    );
    return this.events.filter(event => regex.test(event.name));
  }
  
  /**
   * Gets events by name
   */
  getEventsByName(name: string): CapturedEvent[] {
    return this.events.filter(event => event.name === name);
  }
  
  /**
   * Clears all captured events
   */
  clear(): void {
    this.events.length = 0;
  }
  
  /**
   * Checks if an event was emitted at least once
   */
  hasEvent(name: string, data?: unknown): boolean {
    return this.events.some(event => {
      if (event.name !== name) return false;
      if (data !== undefined) {
        return JSON.stringify(event.data) === JSON.stringify(data);
      }
      return true;
    });
  }
  
  /**
   * Gets the count of events
   */
  count(): number {
    return this.events.length;
  }
  
  /**
   * Gets the count of events matching a pattern
   */
  countByPattern(pattern: string): number {
    return this.getEventsByPattern(pattern).length;
  }
}
