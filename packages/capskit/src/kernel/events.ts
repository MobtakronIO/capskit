/**
 * Event registry for CapsKit kernel.
 * Manages event publishing and subscription.
 */

export class EventRegistry {
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  /**
   * Register an event listener.
   */
  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Remove an event listener.
   */
  off(event: string, listener: (...args: any[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * Emit an event to all registered listeners.
   */
  emit(event: string, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      // Snapshot the Set before iterating to prevent issues if listeners are added/removed during iteration
      for (const listener of [...listeners]) {
        try {
          listener(...args);
        } catch (err) {
          // Log listener errors to prevent silent failures while keeping other listeners running
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[EventRegistry] Listener error for event "${event}": ${message}`);
        }
      }
    }
  }

  /**
   * Check if an event has any listeners.
   */
  hasListeners(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  /**
   * Remove all listeners for all events.
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Shutdown the event registry, clearing all listeners.
   * Alias for clear() for consistency with other kernel modules.
   */
  shutdown(): void {
    this.clear();
  }

  /**
   * Close the event registry, releasing any resources.
   * Alias for shutdown() for consistency with other kernel modules.
   */
  close(): void {
    this.shutdown();
  }
}
