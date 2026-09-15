import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import { session } from '../api/checkoutApi';
import { ApiError } from '../api/http';
import { queryKeys } from '../api/queries';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}

// После этих ошибок данные на экране устарели. Расчёт при конфликте версии не трогаем:
// его ключ сменится сам, когда придёт новая версия корзины.
const STALE_AFTER: ReadonlyMap<string, readonly QueryKey[]> = new Map<string, QueryKey[]>([
  ['CART_VERSION_CONFLICT', [queryKeys.cart, queryKeys.checkoutOptions]],
  ['CART_EMPTY', [queryKeys.cart, queryKeys.checkoutOptions]],
  ['INSUFFICIENT_STOCK', [queryKeys.cart]],
  ['QUOTE_EXPIRED', [queryKeys.quotes, queryKeys.cart]],
  ['QUOTE_NOT_FOUND', [queryKeys.quotes]],
  ['PAYMENT_IN_PROGRESS', [queryKeys.orders]],
  ['PAYMENT_FINALIZED', [queryKeys.orders]],
  ['ORDER_ALREADY_PAID', [queryKeys.orders]],
  ['PAYMENT_NOT_REQUIRED', [queryKeys.orders]],
]);

function refreshStaleData(error: unknown) {
  const keys = error instanceof ApiError ? STALE_AFTER.get(error.code) : undefined;
  if (keys) for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

const retryTransient = (failureCount: number, error: unknown) =>
  error instanceof ApiError && error.outcomeUnknown && failureCount < 2;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: refreshStaleData }),
  mutationCache: new MutationCache({ onError: refreshStaleData }),
  defaultOptions: {
    queries: { retry: retryTransient, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

session.subscribe(() => void queryClient.invalidateQueries());
