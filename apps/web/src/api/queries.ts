import { queryOptions, skipToken } from '@tanstack/react-query';
import type { Delivery } from '@checkout/contracts';
import { checkoutApi } from './checkoutApi';

export const queryKeys = {
  products: ['products'],
  sandbox: ['sandbox'],
  cart: ['cart'],
  checkoutOptions: ['checkout-options'],
  quotes: ['quotes'],
  quote: (cartVersion: number, delivery: Delivery | undefined) => ['quotes', cartVersion, delivery],
  orders: ['orders'],
  orderList: ['orders', 'list'],
  order: (orderId: string) => ['orders', orderId],
  payments: (orderId: string) => ['orders', orderId, 'payments'],
  payment: (orderId: string, paymentId: string) => ['orders', orderId, 'payments', paymentId],
} as const;

// Запас, чтобы расчёт не истёк, пока создаётся заказ.
const QUOTE_EXPIRY_MARGIN_MS = 30_000;

export const productsQuery = () =>
  queryOptions({
    queryKey: queryKeys.products,
    queryFn: ({ signal }) => checkoutApi.products(signal),
    staleTime: 5 * 60_000,
  });

export const sandboxQuery = () =>
  queryOptions({
    queryKey: queryKeys.sandbox,
    queryFn: ({ signal }) => checkoutApi.sandbox(signal),
    staleTime: Infinity,
  });

export const cartQuery = () =>
  queryOptions({ queryKey: queryKeys.cart, queryFn: ({ signal }) => checkoutApi.cart(signal) });

export const checkoutOptionsQuery = () =>
  queryOptions({
    queryKey: queryKeys.checkoutOptions,
    queryFn: ({ signal }) => checkoutApi.checkoutOptions(signal),
  });

// Версия корзины и доставка входят в ключ, поэтому ответ по устаревшим данным на экран не попадёт.
export const quoteQuery = (cartVersion: number, delivery: Delivery | undefined) =>
  queryOptions({
    queryKey: queryKeys.quote(cartVersion, delivery),
    queryFn: delivery
      ? ({ signal }) => checkoutApi.createQuote(cartVersion, delivery, signal)
      : skipToken,
    staleTime: ({ state }) =>
      state.data ? Date.parse(state.data.expiresAt) - Date.now() - QUOTE_EXPIRY_MARGIN_MS : 0,
  });

export const orderListQuery = () =>
  queryOptions({
    queryKey: queryKeys.orderList,
    queryFn: ({ signal }) => checkoutApi.orders(signal),
  });

export const orderQuery = (orderId: string) =>
  queryOptions({
    queryKey: queryKeys.order(orderId),
    queryFn: ({ signal }) => checkoutApi.order(orderId, signal),
  });

export const paymentsQuery = (orderId: string) =>
  queryOptions({
    queryKey: queryKeys.payments(orderId),
    queryFn: ({ signal }) => checkoutApi.payments(orderId, signal),
  });

export const paymentQuery = (orderId: string, paymentId: string) =>
  queryOptions({
    queryKey: queryKeys.payment(orderId, paymentId),
    queryFn: ({ signal }) => checkoutApi.payment(paymentId, signal),
  });
