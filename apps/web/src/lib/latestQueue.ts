// По каждому ключу идёт один запрос за раз. Значения, пришедшие во время запроса,
// не копятся: следующим уйдёт только последнее.
export class KeyedLatestQueue<Key, Value> {
  private readonly running = new Set<Key>();
  private readonly waiting = new Map<Key, Value>();

  constructor(
    private readonly send: (key: Key, value: Value) => Promise<unknown>,
    private readonly onIdle: (key: Key, error: unknown) => void,
  ) {}

  push(key: Key, value: Value): void {
    if (this.running.has(key)) {
      this.waiting.set(key, value);
      return;
    }
    void this.drain(key, value);
  }

  isBusy(key: Key): boolean {
    return this.running.has(key);
  }

  private async drain(key: Key, first: Value): Promise<void> {
    this.running.add(key);
    let value: Value | undefined = first;
    let error: unknown;
    while (value !== undefined) {
      try {
        await this.send(key, value);
        error = undefined;
      } catch (reason) {
        error = reason;
      }
      value = this.waiting.get(key);
      this.waiting.delete(key);
    }
    this.running.delete(key);
    this.onIdle(key, error);
  }
}
