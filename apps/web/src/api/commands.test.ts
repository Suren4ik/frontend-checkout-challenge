import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendIdempotent } from './commands';
import { ApiError } from './http';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

const networkError = () => new ApiError({ kind: 'network', message: 'offline' });

describe('sendIdempotent', () => {
  it('после потери ответа повтор с тем же телом получает прежний ключ', async () => {
    const keys: string[] = [];
    const send = vi.fn(async ({ key }: { key: string }) => {
      keys.push(key);
      if (keys.length === 1) throw networkError();
      return 'order';
    });
    await expect(sendIdempotent('cmd', { quoteId: 'q1' }, send)).rejects.toThrow('offline');
    await expect(sendIdempotent('cmd', { quoteId: 'q1' }, send)).resolves.toBe('order');
    expect(keys[0]).toBe(keys[1]);
  });

  it('новая попытка после определённого ответа получает новый ключ', async () => {
    const keys: string[] = [];
    const send = async ({ key }: { key: string }) => {
      keys.push(key);
      return 'payment';
    };
    await sendIdempotent('cmd', {}, send);
    await sendIdempotent('cmd', {}, send);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('ошибка с известным исходом тоже освобождает ключ', async () => {
    const keys: string[] = [];
    const send = async ({ key }: { key: string }) => {
      keys.push(key);
      throw new ApiError({
        kind: 'http',
        status: 409,
        code: 'CART_VERSION_CONFLICT',
        message: 'x',
      });
    };
    await sendIdempotent('cmd', { a: 1 }, send).catch(() => undefined);
    await sendIdempotent('cmd', { a: 1 }, send).catch(() => undefined);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('изменённое тело не переиспользует ключ неудачной попытки', async () => {
    const keys: string[] = [];
    const send = async ({ key }: { key: string }) => {
      keys.push(key);
      throw networkError();
    };
    await sendIdempotent('cmd', { quoteId: 'q1' }, send).catch(() => undefined);
    await sendIdempotent('cmd', { quoteId: 'q2' }, send).catch(() => undefined);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
