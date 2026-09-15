import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useRouteError } from 'react-router';
import type { Order } from '@checkout/contracts';
import { cartQuery, orderListQuery } from '../api/queries';
import { ErrorNotice, Notice, Page } from '../ui/components';

const selectQuantity = (cart: { quantity: number }) => cart.quantity;
const selectUnpaidOrder = (orders: Order[]) =>
  orders.find((order) => order.status === 'awaiting_payment');

export function Layout() {
  const quantity = useQuery({ ...cartQuery(), select: selectQuantity });
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header className="topbar">
        <div className="container topbar__inner">
          <Link className="brand" to="/">
            Учебный магазин
          </Link>
          <NavLink className="cart-link" to="/cart">
            Корзина
            {quantity.data ? (
              <span className="badge" aria-label={`товаров: ${quantity.data}`}>
                {quantity.data}
              </span>
            ) : null}
          </NavLink>
        </div>
      </header>
      <main id="main" className="container">
        <UnpaidOrderBanner />
        <Outlet />
      </main>
    </div>
  );
}

function UnpaidOrderBanner() {
  const { pathname } = useLocation();
  const { data: order } = useQuery({ ...orderListQuery(), select: selectUnpaidOrder });
  if (!order || pathname.startsWith('/orders/')) return null;
  return (
    <Notice
      tone="info"
      className="banner"
      title={`Заказ ${order.number} ожидает оплаты`}
      actions={
        <Link className="btn btn--primary btn--sm" to={`/orders/${order.id}`}>
          Перейти к оплате
        </Link>
      }
    />
  );
}

export function RouteError() {
  const error = useRouteError();
  return (
    <main className="container">
      <Page title="Не удалось открыть страницу">
        <ErrorNotice
          error={error}
          actions={
            <Link className="btn btn--sm" to="/">
              В каталог
            </Link>
          }
        />
      </Page>
    </main>
  );
}

export function NotFound() {
  return (
    <Page title="Страница не найдена">
      <Link className="btn btn--primary btn--md" to="/">
        Перейти в каталог
      </Link>
    </Page>
  );
}
