import { FormatRegistry, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  CustomerSchema,
  DeliverySchema,
  type CreateOrder,
  type Customer,
  type Delivery,
} from '@checkout/contracts';
import { isApiError } from '../api/http';

// Тот же шаблон, что формат email в ajv-formats на сервере.
const EMAIL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
if (!FormatRegistry.Has('email')) FormatRegistry.Set('email', (value) => EMAIL.test(value));

export type PaymentMethod = CreateOrder['paymentMethod'];
export type DeliveryMethod = Delivery['method'];

export interface CheckoutDraft {
  name: string;
  email: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  pickupPointId: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  paymentMethod: PaymentMethod;
}

export type FieldName = keyof CheckoutDraft;
export type FieldErrors = Partial<Record<FieldName, string>>;

export const EMPTY_DRAFT: CheckoutDraft = {
  name: '',
  email: '',
  phone: '',
  deliveryMethod: 'pickup',
  pickupPointId: '',
  city: '',
  street: '',
  house: '',
  apartment: '',
  paymentMethod: 'card',
};

const MESSAGES: Readonly<Record<FieldName, string>> = {
  name: 'Укажите имя: от 2 до 100 символов.',
  email: 'Укажите email, например buyer@example.test.',
  phone: 'Укажите телефон в формате +79990000000: плюс и 10–15 цифр.',
  deliveryMethod: 'Выберите способ доставки.',
  pickupPointId: 'Выберите пункт выдачи.',
  city: 'Укажите город: от 2 символов.',
  street: 'Укажите улицу: от 2 символов.',
  house: 'Укажите номер дома.',
  apartment: 'Не больше 20 символов.',
  paymentMethod: 'Выберите способ оплаты.',
};

// Одна таблица и для локальной проверки, и для fields из ответа API.
const FIELD_BY_PATH: ReadonlyMap<string, FieldName> = new Map<string, FieldName>([
  ['/customer/name', 'name'],
  ['/customer/email', 'email'],
  ['/customer/phone', 'phone'],
  ['/delivery/method', 'deliveryMethod'],
  ['/delivery/pickupPointId', 'pickupPointId'],
  ['/delivery/address/city', 'city'],
  ['/delivery/address/street', 'street'],
  ['/delivery/address/house', 'house'],
  ['/delivery/address/apartment', 'apartment'],
  ['/paymentMethod', 'paymentMethod'],
]);

const DELIVERY_SCHEMAS: ReadonlyMap<DeliveryMethod, TSchema> = new Map<DeliveryMethod, TSchema>(
  DeliverySchema.anyOf.map((schema) => [schema.properties.method.const, schema]),
);

// Разрешаем вводить телефон с пробелами и скобками, в API уходят только плюс и цифры.
export const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '');

export const toCustomer = (draft: CheckoutDraft): Customer => ({
  name: draft.name.trim(),
  email: draft.email.trim(),
  phone: normalizePhone(draft.phone),
});

export function toDelivery(draft: CheckoutDraft): Delivery {
  if (draft.deliveryMethod === 'pickup') {
    return { method: 'pickup', pickupPointId: draft.pickupPointId };
  }
  const apartment = draft.apartment.trim();
  return {
    method: 'courier',
    address: {
      city: draft.city.trim(),
      street: draft.street.trim(),
      house: draft.house.trim(),
      ...(apartment ? { apartment } : {}),
    },
  };
}

function collect(errors: FieldErrors, prefix: string, schema: TSchema, value: unknown): boolean {
  let valid = true;
  for (const issue of Value.Errors(schema, value)) {
    valid = false;
    const field = FIELD_BY_PATH.get(prefix + issue.path);
    if (field) errors[field] ??= MESSAGES[field];
  }
  return valid;
}

export interface CheckoutValidation {
  errors: FieldErrors;
  customer: Customer | undefined;
  delivery: Delivery | undefined;
}

// Проверяем теми же схемами контракта, что и сервер. enum пунктов выдачи TypeBox не проверяет,
// поэтому сверяем пункт со списком из API сами.
export function validateCheckout(
  draft: CheckoutDraft,
  pickupPoints: { has(id: string): boolean },
): CheckoutValidation {
  const errors: FieldErrors = {};
  const customer = toCustomer(draft);
  const customerValid = collect(errors, '/customer', CustomerSchema, customer);
  const delivery = toDelivery(draft);
  let deliveryValid = collect(
    errors,
    '/delivery',
    DELIVERY_SCHEMAS.get(delivery.method)!,
    delivery,
  );
  if (delivery.method === 'pickup' && !pickupPoints.has(delivery.pickupPointId)) {
    errors.pickupPointId = MESSAGES.pickupPointId;
    deliveryValid = false;
  }
  return {
    errors,
    customer: customerValid ? customer : undefined,
    delivery: deliveryValid ? delivery : undefined,
  };
}

export function fieldErrorsFromApi(error: unknown): FieldErrors {
  const errors: FieldErrors = {};
  if (!isApiError(error)) return errors;
  for (const issue of error.fields) {
    const field = FIELD_BY_PATH.get(issue.path.replace(/^body/, ''));
    if (field) errors[field] ??= MESSAGES[field];
  }
  return errors;
}

export const deliveryKey = (delivery: Delivery | undefined) =>
  delivery ? JSON.stringify(delivery) : '';
