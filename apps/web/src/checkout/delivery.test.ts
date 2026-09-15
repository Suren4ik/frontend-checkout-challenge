import { describe, expect, it } from 'vitest';
import type { CheckoutOptions } from '../api/checkoutApi';
import { describeDelivery, indexPickupPoints } from './delivery';

const options = {
  deliveryMethods: [
    {
      id: 'pickup',
      title: 'Самовывоз',
      price: 0,
      freeFrom: null,
      pickupPoints: [
        { id: 'point-center', title: 'Центральный пункт', address: 'ул. Примерная, 1' },
      ],
    },
    { id: 'courier', title: 'Курьер', price: 39000, freeFrom: 500000, pickupPoints: [] },
  ],
} as unknown as CheckoutOptions;

describe('delivery', () => {
  it('описывает самовывоз по индексу пунктов и курьера по адресу', () => {
    const points = indexPickupPoints(options);
    expect(describeDelivery({ method: 'pickup', pickupPointId: 'point-center' }, points)).toBe(
      'Самовывоз: Центральный пункт, ул. Примерная, 1',
    );
    expect(
      describeDelivery(
        {
          method: 'courier',
          address: { city: 'Учебный', street: 'Примерная', house: '10', apartment: '2' },
        },
        points,
      ),
    ).toBe('Курьер: Учебный, Примерная, д. 10, кв. 2');
  });

  it('без ответа API индекс пустой и переиспользуется', () => {
    expect(indexPickupPoints(undefined)).toBe(indexPickupPoints(undefined));
  });
});
