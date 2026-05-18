import { useState, useEffect } from 'react';
import { useCapsKit } from './context';

export interface UseSubscriptionOptions {
  /** Default true */
  enabled?: boolean;
}

export interface UseSubscriptionResult<T> {
  events: T[];
  latest: T | null;
  error: Error | null;
}

export function useSubscription<T = unknown>(
  pattern: string,
  options: UseSubscriptionOptions = {},
): UseSubscriptionResult<T> {
  const client = useCapsKit();
  const [events, setEvents] = useState<T[]>([]);
  const [latest, setLatest] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const handler = (data: unknown, _event: string) => {
      setLatest(data as T);
      setEvents((prev) => [...prev.slice(-99), data as T]); // Keep last 100
    };

    let unsub: (() => void) | undefined;
    try {
      unsub = client.subscribe(pattern, handler);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    return () => {
      unsub?.();
    };
  }, [client, pattern, enabled]);

  return { events, latest, error };
}
