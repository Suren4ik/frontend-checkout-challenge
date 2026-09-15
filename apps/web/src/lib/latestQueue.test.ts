import { describe, expect, it, vi } from 'vitest';
import { KeyedLatestQueue } from './latestQueue';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('KeyedLatestQueue', () => {
  it('по одному ключу шлёт последовательно и схлопывает ожидание до последнего значения', async () => {
    const sent: [string, number][] = [];
    const replies: ReturnType<typeof deferred>[] = [];
    const onIdle = vi.fn();
    const queue = new KeyedLatestQueue<string, number>((key, value) => {
      sent.push([key, value]);
      const reply = deferred();
      replies.push(reply);
      return reply.promise;
    }, onIdle);

    queue.push('lamp', 1);
    queue.push('lamp', 2);
    queue.push('lamp', 3);
    queue.push('lamp', 4);
    queue.push('mug', 1);
    expect(sent).toEqual([
      ['lamp', 1],
      ['mug', 1],
    ]);

    replies[0].resolve();
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]).toEqual(['lamp', 4]);
    expect(queue.isBusy('lamp')).toBe(true);

    replies[2].resolve();
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledWith('lamp', undefined));
    expect(queue.isBusy('lamp')).toBe(false);
  });

  it('сообщает ошибку последней отправки, а успешный повтор её снимает', async () => {
    const onIdle = vi.fn();
    const send = vi
      .fn<(key: string, value: number) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('stock'))
      .mockResolvedValueOnce(undefined);

    const queue = new KeyedLatestQueue<string, number>(send, onIdle);
    queue.push('lamp', 20);
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledTimes(1));
    expect(onIdle.mock.calls[0][1]).toBeInstanceOf(Error);

    queue.push('lamp', 5);
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledTimes(2));
    expect(onIdle.mock.calls[1]).toEqual(['lamp', undefined]);
  });
});
