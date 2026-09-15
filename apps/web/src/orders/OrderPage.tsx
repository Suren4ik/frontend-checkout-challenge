import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { Order, Payment, Scenario } from '@checkout/contracts';
import { checkoutApi, type PaymentStatus } from '../api/checkoutApi';
import {
  checkoutOptionsQuery,
  orderQuery,
  paymentQuery,
  paymentsQuery,
  queryKeys,
  sandboxQuery,
} from '../api/queries';
import { queryClient } from '../app/queryClient';
import { describeDelivery, indexPickupPoints } from '../checkout/delivery';
import { useGuardedMutation } from '../lib/hooks';
import { formatMoney } from '../lib/money';
import {
  Button,
  ChoiceGroup,
  ErrorNotice,
  Notice,
  Page,
  QueriesFallback,
  QueryView,
  Spinner,
} from '../ui/components';
import { LineItems, Totals } from './OrderLines';

const FINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);
const DEFAULT_POLL_MS = 1000;

// Успех показываем только по статусу заказа с сервера, а не по факту отправки оплаты.
const isOrderComplete = (order: Order) =>
  order.paymentMethod === 'cash_on_delivery'
    ? order.status === 'confirmed'
    : order.status === 'paid' && order.paymentStatus === 'succeeded';

export function OrderPage() {
  const { orderId = '' } = useParams();
  const order = useQuery(orderQuery(orderId));
  return (
    <QueryView query={order} loadingText="Загружаем заказ…">
      {(data) =>
        isOrderComplete(data) ? (
          <OrderReceipt order={data} />
        ) : (
          <Page title={`Оплата заказа ${data.number}`}>
            <PaymentPanel order={data} />
          </Page>
        )
      }
    </QueryView>
  );
}

async function createAttempt(orderId: string): Promise<Payment> {
  const payment = await checkoutApi.createPayment(orderId);
  // Сохранённый ключ мог вернуть уже завершённую попытку: для новой оплаты нужен новый ключ.
  return payment.status === 'failed' || payment.status === 'cancelled'
    ? checkoutApi.createPayment(orderId)
    : payment;
}

interface PayVariables {
  scenario: Scenario;
  latest: Payment | undefined;
}

function usePayOrder(orderId: string) {
  return useGuardedMutation({
    mutationFn: async ({ scenario, latest }: PayVariables) => {
      // Созданная, но не запущенная попытка не даст создать новую, поэтому используем её.
      const payment = latest?.status === 'pending' ? latest : await createAttempt(orderId);
      const { retryAfterMs } = await checkoutApi.simulatePayment(payment.id, scenario);
      return { paymentId: payment.id, retryAfterMs };
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.payments(orderId), exact: true }),
  });
}

function PaymentPanel({ order }: { order: Order }) {
  const payments = useQuery(paymentsQuery(order.id));
  const sandbox = useQuery(sandboxQuery());
  const pay = usePayOrder(order.id);
  const [cardId, setCardId] = useState<string>();

  const cardChoices = useMemo(
    () =>
      sandbox.data?.cards.map((card) => ({
        value: card.id,
        label: card.title,
        description: card.maskedNumber,
      })) ?? [],
    [sandbox.data],
  );

  if (payments.data === undefined || sandbox.data === undefined) {
    return <QueriesFallback queries={[payments, sandbox]} loadingText="Готовим оплату…" />;
  }

  const latest = payments.data[0];
  if (latest?.status === 'processing') {
    return (
      <PaymentProgress
        order={order}
        paymentId={latest.id}
        pollMs={pay.data?.paymentId === latest.id ? pay.data.retryAfterMs : undefined}
      />
    );
  }

  const { cards } = sandbox.data;
  const selected = cards.find((card) => card.id === cardId) ?? cards[0];

  function handlePay(event: FormEvent) {
    event.preventDefault();
    if (selected) void pay.run({ scenario: selected.scenario, latest });
  }

  return (
    <div className="two-columns">
      <form className="card form-section" onSubmit={handlePay}>
        <h2>Тестовая оплата картой</h2>
        {latest && <AttemptOutcome payment={latest} />}
        <ChoiceGroup
          legend="Выберите тестовую карту"
          name="card"
          value={selected?.id}
          choices={cardChoices}
          onChange={setCardId}
        />
        <p className="muted">Номер карты и CVC не нужны: оплата учебная, деньги не списываются.</p>
        {pay.error && <ErrorNotice error={pay.error} />}
        <div className="actions">
          <Button type="submit" variant="primary" busy={pay.isPending} disabled={!selected}>
            Оплатить {formatMoney(order.total)}
          </Button>
          <Button
            variant="ghost"
            disabled={pay.isPending}
            onClick={() => void pay.run({ scenario: 'cancel', latest })}
          >
            Отменить оплату
          </Button>
        </div>
      </form>
      <OrderSummary order={order} />
    </div>
  );
}

function AttemptOutcome({ payment }: { payment: Payment }) {
  switch (payment.status) {
    case 'failed':
      return (
        <Notice tone="error" title="Банк отклонил оплату">
          <p className="notice__text">
            Заказ сохранён. Выберите карту и оплатите снова — будет создана новая попытка.
          </p>
        </Notice>
      );
    case 'cancelled':
      return (
        <Notice tone="warning" title="Оплата отменена">
          <p className="notice__text">
            Деньги не списаны. Заказ ждёт оплаты, можно оплатить снова.
          </p>
        </Notice>
      );
    default:
      return null;
  }
}

interface PaymentProgressProps {
  order: Order;
  paymentId: string;
  pollMs?: number;
}

function PaymentProgress({ order, paymentId, pollMs = DEFAULT_POLL_MS }: PaymentProgressProps) {
  const payment = useQuery({
    ...paymentQuery(order.id, paymentId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && FINAL_PAYMENT_STATUSES.has(status) ? false : pollMs;
    },
  });
  const status = payment.data?.status;

  useEffect(() => {
    if (!status || !FINAL_PAYMENT_STATUSES.has(status)) return;
    const keys = [queryKeys.order(order.id), queryKeys.payments(order.id), queryKeys.orderList];
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey, exact: true });
  }, [order.id, status]);

  return (
    <div className="two-columns">
      <section className="card progress" aria-live="polite">
        <Spinner />
        <h2>Ожидаем подтверждение оплаты</h2>
        <p className="muted">
          Статус проверяется на сервере. Страницу можно перезагрузить, проверка продолжится.
        </p>
        {payment.error && <ErrorNotice error={payment.error} />}
      </section>
      <OrderSummary order={order} />
    </div>
  );
}

function OrderSummary({ order }: { order: Order }) {
  const options = useQuery(checkoutOptionsQuery());
  const pickupPoints = useMemo(() => indexPickupPoints(options.data), [options.data]);
  return (
    <aside className="card summary" aria-label="Состав заказа">
      <h2>Заказ {order.number}</h2>
      <LineItems items={order.items} />
      <p className="muted">{describeDelivery(order.delivery, pickupPoints)}</p>
      <Totals subtotal={order.subtotal} shipping={order.shipping} total={order.total} />
    </aside>
  );
}

function OrderReceipt({ order }: { order: Order }) {
  const cash = order.paymentMethod === 'cash_on_delivery';
  return (
    <Page title={cash ? 'Заказ оформлен' : 'Заказ оплачен'}>
      <div className="receipt">
        <Notice
          tone="success"
          title={cash ? 'Заказ оформлен, оплата при получении' : 'Оплата прошла успешно'}
        >
          <p className="notice__text">
            Номер заказа: <strong>{order.number}</strong>
          </p>
        </Notice>
        <OrderSummary order={order} />
        <section className="card">
          <h2>Получатель</h2>
          <p>{order.customer.name}</p>
          <p className="muted">
            {order.customer.email} · {order.customer.phone}
          </p>
          <p className="muted">
            Оплата: {cash ? 'наличными при получении' : 'картой онлайн, подтверждена банком'}
          </p>
        </section>
        <Link className="btn btn--primary btn--md" to="/">
          Вернуться в каталог
        </Link>
      </div>
    </Page>
  );
}
