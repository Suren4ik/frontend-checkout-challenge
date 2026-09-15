import { Link } from 'react-router';

export function EmptyCart() {
  return (
    <div className="card empty">
      <p className="empty__title">В корзине пока ничего нет</p>
      <p className="muted">Оформить заказ можно после добавления товаров.</p>
      <Link className="btn btn--primary btn--md" to="/">
        Перейти в каталог
      </Link>
    </div>
  );
}
