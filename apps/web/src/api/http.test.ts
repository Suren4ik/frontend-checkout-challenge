import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, type AuthProvider } from './http';

type Handler = (request: Request) => Response | Promise<Response>;

function mockFetch(...handlers: Handler[]) {
  const requests: Request[] = [];
  const fetchMock = vi.fn(async (request: Request) => {
    requests.push(request);
    const handler = handlers[Math.min(requests.length - 1, handlers.length - 1)];
    return handler(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init });

function authWith(tokens: string[]): AuthProvider & { refreshed: string[] } {
  const refreshed: string[] = [];
  return {
    refreshed,
    token: async () => tokens[0],
    refresh: async (rejected) => {
      refreshed.push(rejected);
      return tokens[1];
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createApiClient', () => {
  it('разворачивает конверт и читает Retry-After', async () => {
    mockFetch(() =>
      json(
        {
          data: { id: 'p1' },
          meta: { requestId: 'r1' },
          links: { self: { href: '/x', method: 'GET' } },
        },
        { status: 202, headers: { 'Retry-After': '1', 'X-Request-Id': 'r1' } },
      ),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', timeoutMs: 1000 });
    const result = await client.request<{ id: string }>({ path: '/x' });
    expect(result.data).toEqual({ id: 'p1' });
    expect(result.meta).toMatchObject({ status: 202, retryAfterMs: 1000 });
  });

  it('добавляет токен и JSON-тело в одном месте, публичные методы — без токена', async () => {
    const requests = mockFetch(() => json({ data: {}, meta: {}, links: {} }));
    const client = createApiClient({
      baseUrl: 'http://api.test',
      timeoutMs: 1000,
      auth: authWith(['t1']),
    });
    await client.request({ method: 'PUT', path: '/api/cart/items/a', body: { quantity: 2 } });
    await client.request({ path: '/api/products', auth: false });
    expect(requests[0].headers.get('Authorization')).toBe('Bearer t1');
    expect(requests[0].headers.get('Content-Type')).toBe('application/json');
    expect(await requests[0].text()).toBe('{"quantity":2}');
    expect(requests[1].headers.get('Authorization')).toBeNull();
  });

  it('не читает тело у 204', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    const client = createApiClient({ baseUrl: 'http://api.test', timeoutMs: 1000 });
    expect((await client.request({ method: 'DELETE', path: '/x' })).data).toBeUndefined();
  });

  it('при 401 один раз обновляет сессию и повторяет запрос с новым токеном', async () => {
    const unauthorized = () =>
      json(
        { error: { code: 'SESSION_INVALID', message: 'Сессия не найдена.' }, meta: {} },
        { status: 401 },
      );
    const requests = mockFetch(unauthorized, () => json({ data: 'ok', meta: {}, links: {} }));
    const auth = authWith(['old', 'new']);
    const client = createApiClient({ baseUrl: 'http://api.test', timeoutMs: 1000, auth });
    await expect(client.json({ path: '/api/cart' })).resolves.toBe('ok');
    expect(auth.refreshed).toEqual(['old']);
    expect(requests[1].headers.get('Authorization')).toBe('Bearer new');
  });

  it('разбирает ошибку API вместе с полями', async () => {
    mockFetch(() =>
      json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Проверьте формат и поля запроса.',
            fields: [{ path: 'body/customer/email', message: 'must match format "email"' }],
          },
          meta: { requestId: 'r2' },
        },
        { status: 400, headers: { 'X-Request-Id': 'r2' } },
      ),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', timeoutMs: 1000 });
    const error = await client.request({ path: '/x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'r2',
      fields: [{ path: 'body/customer/email' }],
      outcomeUnknown: false,
    });
  });

  it('ответ без конверта и сетевой сбой приводятся к ApiError', async () => {
    const client = createApiClient({ baseUrl: 'http://api.test', timeoutMs: 1000 });
    mockFetch(() => json({ id: 1 }));
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({ kind: 'parse' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      kind: 'network',
      outcomeUnknown: true,
    });
  });
});
