import { useState, useEffect, useCallback, useRef } from 'react';
import { useCapsKit } from './context';

export interface UseActionOptions {
  /** Execute immediately on mount */
  immediate?: boolean;
  /** Re-execute when deps change */
  deps?: unknown[];
}

export interface UseActionResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useAction<T = unknown>(
  actionPath: string,
  payload?: unknown,
  options: UseActionOptions = {},
): UseActionResult<T> {
  const client = useCapsKit();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.call<T>(actionPath, payload);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, actionPath, JSON.stringify(payload)]);

  const executeRef = useRef(execute);
  executeRef.current = execute;

  useEffect(() => {
    if (options.immediate) {
      void executeRef.current();
    }
  }, [options.immediate, ...(options.deps ?? [])]);

  return { data, loading, error, refetch: execute };
}
