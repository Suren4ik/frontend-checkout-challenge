import type { Delivery } from '@checkout/contracts';
import type { CheckoutOptions } from '../api/checkoutApi';

export type PickupPoint = CheckoutOptions['deliveryMethods'][number]['pickupPoints'][number];

const NO_POINTS: ReadonlyMap<string, PickupPoint> = new Map();

export function indexPickupPoints(
  options: CheckoutOptions | undefined,
): ReadonlyMap<string, PickupPoint> {
  if (!options) return NO_POINTS;
  const points = new Map<string, PickupPoint>();
  for (const method of options.deliveryMethods) {
    for (const point of method.pickupPoints) points.set(point.id, point);
  }
  return points;
}

export function describeDelivery(
  delivery: Delivery,
  pickupPoints: ReadonlyMap<string, PickupPoint>,
): string {
  if (delivery.method === 'pickup') {
    const point = pickupPoints.get(delivery.pickupPointId);
    return point ? `Самовывоз: ${point.title}, ${point.address}` : 'Самовывоз';
  }
  const { city, street, house, apartment } = delivery.address;
  return `Курьер: ${city}, ${street}, д. ${house}${apartment ? `, кв. ${apartment}` : ''}`;
}
