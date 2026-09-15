import type { Static } from '@sinclair/typebox';
import type {
  Cart,
  CheckoutOptionsSchema,
  CreateOrder,
  Delivery,
  Order,
  Payment,
  Product,
  Quote,
  SandboxSchema,
  Scenario,
  Simulation,
} from '@checkout/contracts';
import { STORAGE_KEYS } from '../lib/storage';
import { sendIdempotent, type IdempotentCommand } from './commands';
import { createApiClient } from './http';
import { createSessionAuth } from './session';

export type CartItem = Cart['items'][number];
export type CheckoutOptions = Static<typeof CheckoutOptionsSchema>;
export type Sandbox = Static<typeof SandboxSchema>;
export type PaymentStatus = Payment['status'];

export interface SimulationStarted {
  simulation: Simulation;
  retryAfterMs: number | undefined;
}

export const session = createSessionAuth((spec) => client.json<{ token: string }>(spec));

const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000',
  timeoutMs: 10_000,
  auth: session,
});

const idempotencyHeaders = (command: IdempotentCommand<unknown>) => ({
  'Idempotency-Key': command.key,
});
const itemPath = (productId: string) => `/api/cart/items/${encodeURIComponent(productId)}`;

export const checkoutApi = {
  products: (signal?: AbortSignal) =>
    client.json<Product[]>({ path: '/api/products', auth: false, signal }),

  sandbox: (signal?: AbortSignal) =>
    client.json<Sandbox>({ path: '/api/sandbox', auth: false, signal }),

  cart: (signal?: AbortSignal) => client.json<Cart>({ path: '/api/cart', signal }),

  setItemQuantity: (productId: string, quantity: number) =>
    client.json<CartItem>({ method: 'PUT', path: itemPath(productId), body: { quantity } }),

  removeItem: (productId: string) =>
    client.json<void>({ method: 'DELETE', path: itemPath(productId) }),

  checkoutOptions: (signal?: AbortSignal) =>
    client.json<CheckoutOptions>({ path: '/api/checkout/options', signal }),

  createQuote: (cartVersion: number, delivery: Delivery, signal?: AbortSignal) =>
    client.json<Quote>({
      method: 'POST',
      path: '/api/quotes',
      body: { cartVersion, delivery },
      signal,
    }),

  createOrder: (body: CreateOrder) =>
    sendIdempotent(STORAGE_KEYS.orderCommand, body, (command) =>
      client.json<Order>({
        method: 'POST',
        path: '/api/orders',
        body: command.body,
        headers: idempotencyHeaders(command),
      }),
    ),

  orders: (signal?: AbortSignal) => client.json<Order[]>({ path: '/api/orders', signal }),

  order: (orderId: string, signal?: AbortSignal) =>
    client.json<Order>({ path: `/api/orders/${encodeURIComponent(orderId)}`, signal }),

  payments: (orderId: string, signal?: AbortSignal) =>
    client.json<Payment[]>({ path: `/api/orders/${encodeURIComponent(orderId)}/payments`, signal }),

  createPayment: (orderId: string) =>
    sendIdempotent(STORAGE_KEYS.paymentCommand(orderId), {}, (command) =>
      client.json<Payment>({
        method: 'POST',
        path: `/api/orders/${encodeURIComponent(orderId)}/payments`,
        body: command.body,
        headers: idempotencyHeaders(command),
      }),
    ),

  payment: (paymentId: string, signal?: AbortSignal) =>
    client.json<Payment>({ path: `/api/payments/${encodeURIComponent(paymentId)}`, signal }),

  async simulatePayment(paymentId: string, scenario: Scenario): Promise<SimulationStarted> {
    const { data, meta } = await client.request<Simulation>({
      method: 'POST',
      path: `/api/payments/${encodeURIComponent(paymentId)}/simulations`,
      body: { scenario },
    });
    return { simulation: data, retryAfterMs: meta.retryAfterMs };
  },
};
