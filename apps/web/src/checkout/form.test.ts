import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import {
  EMPTY_DRAFT,
  fieldErrorsFromApi,
  normalizePhone,
  toDelivery,
  validateCheckout,
  type CheckoutDraft,
} from './form';

const points = new Set(['point-center', 'point-north']);

const filled: CheckoutDraft = {
  ...EMPTY_DRAFT,
  name: '  Тестовый Покупатель ',
  email: 'buyer@example.test',
  phone: '+7 (999) 000-00-00',
  pickupPointId: 'point-center',
};

describe('validateCheckout', () => {
  it('пустая форма даёт ошибки полей с понятными подписями и не отдаёт данные', () => {
    const result = validateCheckout(EMPTY_DRAFT, points);
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'name', 'phone', 'pickupPointId']);
    expect(result.errors.phone).toMatch(/\+79990000000/);
    expect(result.customer).toBeUndefined();
    expect(result.delivery).toBeUndefined();
  });

  it('заполненная форма отдаёт нормализованные данные для API', () => {
    const result = validateCheckout(filled, points);
    expect(result.errors).toEqual({});
    expect(result.customer).toEqual({
      name: 'Тестовый Покупатель',
      email: 'buyer@example.test',
      phone: '+79990000000',
    });
    expect(result.delivery).toEqual({ method: 'pickup', pickupPointId: 'point-center' });
  });

  it('курьер требует адрес, квартира необязательна', () => {
    const courier = { ...filled, deliveryMethod: 'courier' as const };
    expect(Object.keys(validateCheckout(courier, points).errors).sort()).toEqual([
      'city',
      'house',
      'street',
    ]);
    const address = { ...courier, city: 'Учебный', street: 'Примерная', house: '10' };
    expect(validateCheckout(address, points).delivery).toEqual({
      method: 'courier',
      address: { city: 'Учебный', street: 'Примерная', house: '10' },
    });
    expect(toDelivery({ ...address, apartment: ' 5 ' })).toMatchObject({
      address: { apartment: '5' },
    });
  });

  it('неизвестный пункт выдачи не проходит проверку', () => {
    expect(validateCheckout({ ...filled, pickupPointId: 'nowhere' }, points).errors).toHaveProperty(
      'pickupPointId',
    );
  });

  it('некорректные email и телефон', () => {
    const errors = validateCheckout(
      { ...filled, email: 'buyer@', phone: '89990000000' },
      points,
    ).errors;
    expect(Object.keys(errors).sort()).toEqual(['email', 'phone']);
  });
});

describe('fieldErrorsFromApi', () => {
  it('сопоставляет fields ответа API с полями формы', () => {
    const error = new ApiError({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'x',
      fields: [
        { path: 'body/customer/email', message: 'must match format "email"' },
        { path: 'body/delivery/address/house', message: 'must NOT have fewer than 1 characters' },
      ],
    });
    expect(Object.keys(fieldErrorsFromApi(error)).sort()).toEqual(['email', 'house']);
    expect(fieldErrorsFromApi(new Error('x'))).toEqual({});
  });
});

it('normalizePhone убирает пробелы, скобки и дефисы', () => {
  expect(normalizePhone('+7 (999) 000-00-00')).toBe('+79990000000');
});
