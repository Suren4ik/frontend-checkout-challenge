import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { ApiError } from '../api/http';

export function useGuardedMutation<Data, Variables>(
  options: UseMutationOptions<Data, ApiError, Variables>,
) {
  const mutation = useMutation(options);
  const running = useRef(false);
  const { mutateAsync } = mutation;

  const run = useCallback(
    async (variables: Variables) => {
      // isPending обновится только после рендера, а двойной клик приходит раньше.
      if (running.current) return;
      running.current = true;
      try {
        await mutateAsync(variables);
      } catch {
        // ошибка доступна в mutation.error
      } finally {
        running.current = false;
      }
    },
    [mutateAsync],
  );

  return {
    run,
    data: mutation.data,
    error: mutation.error,
    isPending: mutation.isPending,
  };
}

// Сравниваем по ключу, а не по ссылке: объект доставки пересоздаётся на каждом рендере.
export function useDebouncedValue<T>(value: T, delayMs: number, keyOf: (value: T) => string): T {
  const key = keyOf(value);
  const [debounced, setDebounced] = useState(value);
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(latest.current), delayMs);
    return () => clearTimeout(timer);
  }, [key, delayMs]);

  return debounced;
}
