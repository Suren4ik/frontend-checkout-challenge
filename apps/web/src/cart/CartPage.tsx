import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { Product } from '@checkout/contracts';
import type { CartItem } from '../api/checkoutApi';
import { productsQuery } from '../api/queries';
import { formatMoney } from '../lib/money';
import { Button, cx, ErrorNotice, Page, QueryView, Spinner } from '../ui/components';
import { cartDrafts, maxQuantity, useCart } from './cart';
import { EmptyCart } from './EmptyCart';
import { QuantityStepper } from './QuantityStepper';

function indexStock(products: readonly Product[] | undefined): ReadonlyMap<string, number> {
  const stock = new Map<string, number>();
  if (products) for (const product of products) stock.set(product.id, product.stock);
  return stock;
}

export function CartPage() {
  const cart = useCart();
  const products = useQuery(productsQuery());
  const stockById = useMemo(() => indexStock(products.data), [products.data]);
  const navigate = useNavigate();

  return (
    <Page title="Корзина">
      <QueryView query={cart.query} loadingText="Загружаем корзину…">
        {(data) =>
          data.items.length === 0 && !cart.syncing ? (
            <EmptyCart />
          ) : (
            <div className="two-columns">
              <ul className="cart-lines">
                {data.items.map((item) => (
                  <CartLine
                    key={item.productId}
                    item={item}
                    quantity={cart.quantityOf(item.productId)}
                    max={maxQuantity(stockById.get(item.productId) ?? 99)}
                    error={cart.drafts.errors.get(item.productId)}
                  />
                ))}
              </ul>
              <aside className="card summary" aria-busy={cart.syncing}>
                <h2>Итого</h2>
                <dl className="totals">
                  <div>
                    <dt>Товаров</dt>
                    <dd>{data.quantity} шт.</dd>
                  </div>
                  <div className="totals__total">
                    <dt>Сумма</dt>
                    <dd>{formatMoney(data.subtotal)}</dd>
                  </div>
                </dl>
                {cart.syncing && (
                  <p className="muted" role="status">
                    <Spinner /> Обновляем корзину…
                  </p>
                )}
                <p className="muted">Стоимость доставки рассчитается при оформлении.</p>
                <Button
                  variant="primary"
                  disabled={cart.syncing || data.items.length === 0}
                  onClick={() => navigate('/checkout')}
                >
                  Оформить заказ
                </Button>
              </aside>
            </div>
          )
        }
      </QueryView>
    </Page>
  );
}

interface CartLineProps {
  item: CartItem;
  quantity: number;
  max: number;
  error: unknown;
}

function CartLine({ item, quantity, max, error }: CartLineProps) {
  const removing = quantity === 0;
  const pending = quantity !== item.quantity;
  return (
    <li className={cx('card cart-line', removing && 'cart-line--removing')}>
      <div className="cart-line__info">
        <h2 className="cart-line__title">{item.title}</h2>
        <p className="muted">{formatMoney(item.unitPrice)} за шт.</p>
      </div>
      <QuantityStepper
        label={`Количество: ${item.title}`}
        value={removing ? item.quantity : quantity}
        min={1}
        max={max}
        onChange={(value) => cartDrafts.setQuantity(item.productId, value)}
      />
      <p className="cart-line__total" aria-busy={pending}>
        {pending ? <Spinner /> : formatMoney(item.lineTotal)}
      </p>
      <Button
        variant="ghost"
        size="sm"
        disabled={removing}
        aria-label={`Удалить «${item.title}» из корзины`}
        onClick={() => cartDrafts.setQuantity(item.productId, 0)}
      >
        {removing ? 'Удаляем…' : 'Удалить'}
      </Button>
      {error !== undefined && <ErrorNotice error={error} />}
    </li>
  );
}
