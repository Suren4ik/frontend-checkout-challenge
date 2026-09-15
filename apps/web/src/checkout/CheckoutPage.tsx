import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { Cart, Customer, Delivery, Quote } from '@checkout/contracts';
import { checkoutApi, type CheckoutOptions } from '../api/checkoutApi';
import { ApiError } from '../api/http';
import { cartQuery, checkoutOptionsQuery, queryKeys, quoteQuery } from '../api/queries';
import { queryClient } from '../app/queryClient';
import { useCartDrafts } from '../cart/cart';
import { EmptyCart } from '../cart/EmptyCart';
import { useDebouncedValue, useGuardedMutation } from '../lib/hooks';
import { formatMoney } from '../lib/money';
import { STORAGE_KEYS, storage } from '../lib/storage';
import { LineItems, Totals } from '../orders/OrderLines';
import {
  Button,
  ChoiceGroup,
  ErrorNotice,
  Loading,
  Page,
  QueriesFallback,
  Spinner,
  TextField,
  type Choice,
} from '../ui/components';
import { indexPickupPoints, type PickupPoint } from './delivery';
import {
  deliveryKey,
  EMPTY_DRAFT,
  fieldErrorsFromApi,
  validateCheckout,
  type CheckoutDraft,
  type DeliveryMethod,
  type PaymentMethod,
} from './form';

const QUOTE_DEBOUNCE_MS = 400;

export function CheckoutPage() {
  const cart = useQuery(cartQuery());
  const options = useQuery(checkoutOptionsQuery());
  const syncing = useCartDrafts().quantities.size > 0;

  let content;
  if (!cart.data || !options.data) {
    content = <QueriesFallback queries={[cart, options]} loadingText="Готовим оформление…" />;
  } else if (cart.data.items.length === 0) {
    content = <EmptyCart />;
  } else {
    content = <CheckoutForm cart={cart.data} options={options.data} syncing={syncing} />;
  }
  return <Page title="Оформление заказа">{content}</Page>;
}

function useCheckoutDraft(pickupPoints: ReadonlyMap<string, PickupPoint>) {
  const [draft, setDraft] = useState<CheckoutDraft>(() => {
    const saved = {
      ...EMPTY_DRAFT,
      ...storage.read<Partial<CheckoutDraft>>(STORAGE_KEYS.checkoutForm),
    };
    // Сразу выбираем первый пункт выдачи, чтобы стоимость посчиталась без лишнего клика.
    if (!pickupPoints.has(saved.pickupPointId)) {
      saved.pickupPointId = pickupPoints.keys().next().value ?? '';
    }
    return saved;
  });

  useEffect(() => storage.write(STORAGE_KEYS.checkoutForm, draft), [draft]);

  const setField = <Name extends keyof CheckoutDraft>(name: Name, value: CheckoutDraft[Name]) =>
    setDraft((current) => (current[name] === value ? current : { ...current, [name]: value }));

  return [draft, setField] as const;
}

interface SubmitVariables {
  customer: Customer;
  delivery: Delivery;
  paymentMethod: PaymentMethod;
  shownTotal: number | undefined;
}

function useSubmitOrder() {
  const navigate = useNavigate();
  return useGuardedMutation({
    mutationFn: async ({ customer, delivery, paymentMethod, shownTotal }: SubmitVariables) => {
      const cart = await queryClient.fetchQuery(cartQuery());
      const quote = await queryClient.fetchQuery(quoteQuery(cart.version, delivery));
      // Корзину могли поменять в другой вкладке. Создавать заказ на сумму, которую
      // пользователь не видел, нельзя: показываем новую и ждём повторного подтверждения.
      if (quote.total !== shownTotal) {
        throw new ApiError({
          kind: 'http',
          status: 409,
          code: 'QUOTE_CHANGED',
          message: `Итоговая сумма обновилась: ${formatMoney(quote.total)}.`,
        });
      }
      return checkoutApi.createOrder({ quoteId: quote.id, paymentMethod, customer });
    },
    onSuccess: (order) => {
      queryClient.setQueryData(queryKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderList });
      storage.remove(STORAGE_KEYS.checkoutForm);
      navigate(`/orders/${order.id}`, { replace: true });
    },
  });
}

interface CheckoutFormProps {
  cart: Cart;
  options: CheckoutOptions;
  syncing: boolean;
}

function CheckoutForm({ cart, options, syncing }: CheckoutFormProps) {
  const pickupPoints = useMemo(() => indexPickupPoints(options), [options]);
  const choices = useMemo(() => buildChoices(options), [options]);
  const [draft, setField] = useCheckoutDraft(pickupPoints);
  const validation = useMemo(() => validateCheckout(draft, pickupPoints), [draft, pickupPoints]);

  const quoteDelivery = useDebouncedValue(validation.delivery, QUOTE_DEBOUNCE_MS, deliveryKey);
  const quote = useQuery({
    ...quoteQuery(cart.version, quoteDelivery),
    placeholderData: keepPreviousData,
  });
  const submit = useSubmitOrder();

  const [attempted, setAttempted] = useState(false);
  const errors = useMemo(() => {
    const server = fieldErrorsFromApi(submit.error);
    return attempted ? { ...server, ...validation.errors } : server;
  }, [attempted, submit.error, validation.errors]);
  const hasFieldErrors = Object.keys(errors).length > 0;

  const formRef = useRef<HTMLFormElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const { customer, delivery } = validation;
    if (!customer || !delivery) {
      setFocusRequest((count) => count + 1);
      return;
    }
    void submit.run({
      customer,
      delivery,
      paymentMethod: draft.paymentMethod,
      shownTotal: quote.isPlaceholderData ? undefined : quote.data?.total,
    });
  }

  return (
    <form ref={formRef} className="checkout" onSubmit={handleSubmit} noValidate>
      <div className="checkout__main">
        <section className="card form-section" aria-labelledby="contacts-title">
          <h2 id="contacts-title">Контакты получателя</h2>
          <div className="form-grid">
            <TextField
              label="Имя и фамилия"
              name="name"
              autoComplete="name"
              value={draft.name}
              onChange={(value) => setField('name', value)}
              error={errors.name}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="buyer@example.test"
              value={draft.email}
              onChange={(value) => setField('email', value)}
              error={errors.email}
            />
            <TextField
              label="Телефон"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+79990000000"
              hint="С плюсом и кодом страны"
              value={draft.phone}
              onChange={(value) => setField('phone', value)}
              error={errors.phone}
            />
          </div>
        </section>

        <section className="card form-section" aria-labelledby="delivery-title">
          <h2 id="delivery-title">Доставка</h2>
          <ChoiceGroup
            legend="Способ доставки"
            name="deliveryMethod"
            value={draft.deliveryMethod}
            choices={choices.delivery}
            onChange={(value) => setField('deliveryMethod', value)}
            error={errors.deliveryMethod}
          />
          {draft.deliveryMethod === 'pickup' ? (
            <ChoiceGroup
              legend="Пункт выдачи"
              name="pickupPointId"
              value={draft.pickupPointId}
              choices={choices.pickupPoints}
              onChange={(value) => setField('pickupPointId', value)}
              error={errors.pickupPointId}
            />
          ) : (
            <div className="form-grid form-grid--address">
              <TextField
                label="Город"
                name="city"
                autoComplete="address-level2"
                value={draft.city}
                onChange={(value) => setField('city', value)}
                error={errors.city}
              />
              <TextField
                label="Улица"
                name="street"
                autoComplete="address-line1"
                value={draft.street}
                onChange={(value) => setField('street', value)}
                error={errors.street}
              />
              <TextField
                label="Дом"
                name="house"
                value={draft.house}
                onChange={(value) => setField('house', value)}
                error={errors.house}
              />
              <TextField
                label="Квартира (необязательно)"
                name="apartment"
                value={draft.apartment}
                onChange={(value) => setField('apartment', value)}
                error={errors.apartment}
              />
            </div>
          )}
        </section>

        <section className="card form-section" aria-labelledby="payment-title">
          <h2 id="payment-title">Оплата</h2>
          <ChoiceGroup
            legend="Способ оплаты"
            name="paymentMethod"
            value={draft.paymentMethod}
            choices={choices.payment}
            onChange={(value) => setField('paymentMethod', value)}
            error={errors.paymentMethod}
          />
        </section>
      </div>

      <aside className="card checkout__summary" aria-labelledby="summary-title">
        <h2 id="summary-title">Ваш заказ</h2>
        <LineItems items={cart.items} />
        <QuoteTotals quote={quote} hasDelivery={quoteDelivery !== undefined} />
        {hasFieldErrors ? (
          <p className="field__error" role="alert">
            Проверьте отмеченные поля.
          </p>
        ) : (
          submit.error && <ErrorNotice error={submit.error} />
        )}
        <Button type="submit" variant="primary" busy={submit.isPending} disabled={syncing}>
          {draft.paymentMethod === 'card' ? 'Оформить и перейти к оплате' : 'Оформить заказ'}
        </Button>
        {syncing && <p className="muted">Дождитесь обновления корзины.</p>}
      </aside>
    </form>
  );
}

interface QuoteTotalsProps {
  quote: UseQueryResult<Quote, ApiError>;
  hasDelivery: boolean;
}

function QuoteTotals({ quote, hasDelivery }: QuoteTotalsProps) {
  if (!hasDelivery) return <p className="muted">Заполните доставку, чтобы рассчитать итог.</p>;

  const retry = (
    <Button size="sm" onClick={() => void quote.refetch()}>
      Пересчитать
    </Button>
  );
  if (quote.data === undefined) {
    return quote.isError ? (
      <ErrorNotice error={quote.error} actions={retry} />
    ) : (
      <Loading text="Рассчитываем стоимость…" />
    );
  }

  const updating = quote.isFetching || quote.isPlaceholderData;
  return (
    <div className="quote" aria-busy={updating}>
      <Totals
        subtotal={quote.data.subtotal}
        shipping={quote.data.shipping}
        total={quote.data.total}
      />
      {updating && (
        <p className="muted" role="status">
          <Spinner /> Пересчитываем…
        </p>
      )}
      {quote.isError && <ErrorNotice error={quote.error} actions={retry} />}
    </div>
  );
}

function describeDeliveryPrice(price: number, freeFrom: number | null) {
  if (price === 0) return 'Бесплатно';
  const base = formatMoney(price);
  return freeFrom === null ? base : `${base}, бесплатно от ${formatMoney(freeFrom)}`;
}

function buildChoices(options: CheckoutOptions) {
  const delivery: Choice<DeliveryMethod>[] = options.deliveryMethods.map((method) => ({
    value: method.id,
    label: method.title,
    description: describeDeliveryPrice(method.price, method.freeFrom),
  }));
  const pickupPoints: Choice<string>[] = [];
  for (const method of options.deliveryMethods) {
    for (const point of method.pickupPoints) {
      pickupPoints.push({ value: point.id, label: point.title, description: point.address });
    }
  }
  const payment: Choice<PaymentMethod>[] = options.paymentMethods.map((method) => ({
    value: method.id,
    label: method.title,
  }));
  return { delivery, pickupPoints, payment };
}
