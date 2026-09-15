import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product } from '@checkout/contracts';
import { productsQuery } from '../api/queries';
import { cartDrafts, maxQuantity, useCart } from '../cart/cart';
import { QuantityStepper } from '../cart/QuantityStepper';
import { formatMoney } from '../lib/money';
import { Button, ErrorNotice, Page, QueryView } from '../ui/components';

export function CatalogPage() {
  const products = useQuery(productsQuery());
  const cart = useCart();
  return (
    <Page title="Каталог">
      <QueryView query={products} loadingText="Загружаем каталог…">
        {(list) => (
          <ul className="product-grid">
            {list.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  quantity={cart.quantityOf(product.id)}
                  error={cart.drafts.errors.get(product.id)}
                  cartReady={cart.query.isSuccess}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </Page>
  );
}

interface ProductCardProps {
  product: Product;
  quantity: number;
  error: unknown;
  cartReady: boolean;
}

const ProductCard = memo(function ProductCard({
  product,
  quantity,
  error,
  cartReady,
}: ProductCardProps) {
  const available = product.stock > 0;
  return (
    <article className="card product">
      <div className="product__art" aria-hidden>
        {product.title.charAt(0)}
      </div>
      <h2 className="product__title">{product.title}</h2>
      <p className="product__description">{product.description}</p>
      <p className="product__price">{formatMoney(product.price)}</p>
      <p className={available ? 'product__stock' : 'product__stock product__stock--out'}>
        {available ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
      </p>
      <div className="product__actions">
        {!available ? (
          <Button disabled>Недоступно</Button>
        ) : quantity === 0 ? (
          <Button
            variant="primary"
            disabled={!cartReady}
            onClick={() => cartDrafts.setQuantity(product.id, 1)}
          >
            В корзину
          </Button>
        ) : (
          <QuantityStepper
            label={`Количество: ${product.title}`}
            value={quantity}
            min={0}
            max={maxQuantity(product.stock)}
            onChange={(value) => cartDrafts.setQuantity(product.id, value)}
          />
        )}
      </div>
      {error !== undefined && <ErrorNotice error={error} />}
    </article>
  );
});
