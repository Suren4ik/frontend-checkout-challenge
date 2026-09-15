import { ApiError, type ApiErrorKind } from '../api/http';

export interface ErrorDescription {
  message: string;
  hint: string | undefined;
  requestId: string | undefined;
}

const CODE_HINTS: ReadonlyMap<string, string> = new Map([
  ['INSUFFICIENT_STOCK', 'Уменьшите количество: в корзине не может быть больше остатка.'],
  ['PRODUCT_NOT_FOUND', 'Товар больше недоступен. Обновите каталог.'],
  ['CART_VERSION_CONFLICT', 'Корзина обновлена. Проверьте состав и итог, затем продолжите.'],
  ['CART_EMPTY', 'Добавьте товары в корзину, чтобы оформить заказ.'],
  ['QUOTE_EXPIRED', 'Стоимость пересчитана. Проверьте итог и подтвердите заказ ещё раз.'],
  ['QUOTE_NOT_FOUND', 'Стоимость пересчитана. Проверьте итог и подтвердите заказ ещё раз.'],
  ['QUOTE_CHANGED', 'Проверьте новую сумму справа и подтвердите заказ ещё раз.'],
  ['ORDER_NOT_FOUND', 'Проверьте ссылку или вернитесь в каталог.'],
  ['PAYMENT_IN_PROGRESS', 'Дождитесь результата текущей попытки оплаты.'],
  ['PAYMENT_FINALIZED', 'Статус оплаты обновлён. Если оплата не прошла, начните новую попытку.'],
  ['ORDER_ALREADY_PAID', 'Заказ уже оплачен — повторная оплата не нужна.'],
  ['PAYMENT_NOT_REQUIRED', 'Этот заказ оплачивается при получении.'],
  ['IDEMPOTENCY_CONFLICT', 'Повторите действие.'],
  ['VALIDATION_ERROR', 'Исправьте отмеченные поля и отправьте форму снова.'],
]);

const KIND_HINTS: Readonly<Record<ApiErrorKind, string | undefined>> = {
  network: 'Проверьте подключение и что API запущен, затем повторите.',
  timeout: 'Сервер отвечает слишком долго. Повторите — повтор не создаст дубль.',
  parse: 'Сервер вернул неожиданный ответ. Повторите попытку.',
  http: undefined,
  aborted: undefined,
};

export function describeError(error: unknown): ErrorDescription {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      hint:
        CODE_HINTS.get(error.code) ??
        KIND_HINTS[error.kind] ??
        (error.status !== undefined && error.status >= 500
          ? 'Повторите попытку позже.'
          : undefined),
      requestId: error.requestId,
    };
  }
  return {
    message: 'Что-то пошло не так.',
    hint: 'Обновите страницу и повторите действие.',
    requestId: undefined,
  };
}
