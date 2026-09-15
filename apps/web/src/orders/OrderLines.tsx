import type { CartItem } from '../api/checkoutApi';
import { formatMoney } from '../lib/money';

export function LineItems({ items }: { items: readonly CartItem[] }) {
  return (
    <ul className="line-items">
      {items.map((item) => (
        <li key={item.productId} className="line-items__row">
          <span className="line-items__title">
            {item.title} <span className="muted">× {item.quantity}</span>
          </span>
          <span>{formatMoney(item.lineTotal)}</span>
        </li>
      ))}
    </ul>
  );
}

interface TotalsProps {
  subtotal: number;
  shipping: number;
  total: number;
}

export function Totals({ subtotal, shipping, total }: TotalsProps) {
  return (
    <dl className="totals">
      <div>
        <dt>Товары</dt>
        <dd>{formatMoney(subtotal)}</dd>
      </div>
      <div>
        <dt>Доставка</dt>
        <dd>{shipping === 0 ? 'Бесплатно' : formatMoney(shipping)}</dd>
      </div>
      <div className="totals__total">
        <dt>Итого</dt>
        <dd>{formatMoney(total)}</dd>
      </div>
    </dl>
  );
}
