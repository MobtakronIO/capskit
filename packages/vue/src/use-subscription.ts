import { ref, readonly, onUnmounted, type Ref } from 'vue';
import { injectCapsKit } from './injection';

export interface UseSubscriptionOptions {
  enabled?: Ref<boolean> | boolean;
}

export interface UseSubscriptionResult<T> {
  events: Readonly<Ref<T[]>>;
  latest: Readonly<Ref<T | null>>;
  error: Readonly<Ref<Error | null>>;
}

export function useSubscription<T = unknown>(
  pattern: string,
  options: UseSubscriptionOptions = {},
): UseSubscriptionResult<T> {
  const client = injectCapsKit();
  const events = ref<T[]>([]) as Ref<T[]>;
  const latest = ref<T | null>(null) as Ref<T | null>;
  const error = ref<Error | null>(null) as Ref<Error | null>;

  const enabled =
    typeof options.enabled === 'boolean'
      ? options.enabled
      : (options.enabled?.value ?? true);

  let unsub: (() => void) | undefined;

  function setup() {
    if (!enabled) return;
    try {
      unsub = client.subscribe(pattern, (data) => {
        latest.value = data as T;
        events.value = [...events.value.slice(-99), data as T];
      });
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    }
  }

  setup();

  onUnmounted(() => {
    unsub?.();
  });

  return {
    events: readonly(events) as Readonly<Ref<T[]>>,
    latest: readonly(latest) as Readonly<Ref<T | null>>,
    error: readonly(error) as Readonly<Ref<Error | null>>,
  };
}
