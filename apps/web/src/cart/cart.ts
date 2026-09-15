import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { checkoutApi, type CartItem } from '../api/checkoutApi';
import { cartQuery, queryKeys } from '../api/queries';
import { queryClient } from '../app/queryClient';
import { KeyedLatestQueue } from '../lib/latestQueue';

// В контракте quantity от 1 до 99, сервер ещё ограничивает остатком.
export const maxQuantity = (stock: number) => Math.min(stock, 99);

export interface CartDrafts {
  // количество, которое выбрал пользователь, пока сервер его не подтвердил
  readonly quantities: ReadonlyMap<string, number>;
  readonly errors: ReadonlyMap<string, unknown>;
}

function withEntry<Value>(
  map: ReadonlyMap<string, Value>,
  key: string,
  value: Value | undefined,
): ReadonlyMap<string, Value> {
  if (value === undefined ? !map.has(key) : map.get(key) === value) return map;
  const next = new Map(map);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  return next;
}

function createCartDrafts() {
  let snapshot: CartDrafts = { quantities: new Map(), errors: new Map() };
  const listeners = new Set<() => void>();

  function update(productId: string, quantity: number | undefined, error: unknown) {
    const quantities = withEntry(snapshot.quantities, productId, quantity);
    const errors = withEntry(snapshot.errors, productId, error);
    if (quantities === snapshot.quantities && errors === snapshot.errors) return;
    snapshot = { quantities, errors };
    for (const listener of listeners) listener();
  }

  // quantity = 0 означает удаление позиции.
  const queue = new KeyedLatestQueue<string, number>(
    (productId, quantity) =>
      quantity === 0
        ? checkoutApi.removeItem(productId)
        : checkoutApi.setItemQuantity(productId, quantity),
    async (productId, error) => {
      // Черновик снимаем только после свежей корзины, иначе число на секунду откатится к старому.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.cart }),
        queryClient.invalidateQueries({ queryKey: queryKeys.checkoutOptions }),
      ]);
      if (!queue.isBusy(productId)) update(productId, undefined, error);
    },
  );

  return {
    setQuantity(productId: string, quantity: number) {
      update(productId, quantity, undefined);
      queue.push(productId, quantity);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

export const cartDrafts = createCartDrafts();

export const useCartDrafts = () =>
  useSyncExternalStore(cartDrafts.subscribe, cartDrafts.getSnapshot);

const EMPTY_INDEX: ReadonlyMap<string, CartItem> = new Map();

export function indexCartItems(
  items: readonly CartItem[] | undefined,
): ReadonlyMap<string, CartItem> {
  if (!items?.length) return EMPTY_INDEX;
  const index = new Map<string, CartItem>();
  for (const item of items) index.set(item.productId, item);
  return index;
}

export function useCart() {
  const query = useQuery(cartQuery());
  const drafts = useCartDrafts();
  const items = useMemo(() => indexCartItems(query.data?.items), [query.data]);
  return {
    query,
    drafts,
    syncing: drafts.quantities.size > 0,
    quantityOf: (productId: string) =>
      drafts.quantities.get(productId) ?? items.get(productId)?.quantity ?? 0,
  };
}
