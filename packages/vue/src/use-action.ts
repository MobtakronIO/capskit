import { ref, readonly, watch, onMounted, type Ref } from 'vue';
import { injectCapsKit } from './injection';

export interface UseActionOptions {
  immediate?: boolean;
  watch?: Ref<unknown>[];
}

export interface UseActionResult<T> {
  data: Readonly<Ref<T | null>>;
  loading: Readonly<Ref<boolean>>;
  error: Readonly<Ref<Error | null>>;
  refetch: () => Promise<void>;
}

export function useAction<T = unknown>(
  actionPath: string,
  payload?: unknown,
  options: UseActionOptions = {},
): UseActionResult<T> {
  const client = injectCapsKit();
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false) as Ref<boolean>;
  const error = ref<Error | null>(null) as Ref<Error | null>;

  async function execute() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await client.call<T>(actionPath, payload);
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      loading.value = false;
    }
  }

  if (options.immediate) {
    onMounted(execute);
  }

  if (options.watch) {
    watch(options.watch, execute);
  }

  return {
    data: readonly(data) as Readonly<Ref<T | null>>,
    loading: readonly(loading) as Readonly<Ref<boolean>>,
    error: readonly(error) as Readonly<Ref<Error | null>>,
    refetch: execute,
  };
}
