import { STORAGE_KEYS, storage } from '../lib/storage';
import type { AuthProvider, RequestSpec } from './http';

type Listener = () => void;

// Токен переживает перезагрузку, а параллельные запросы ждут одного создания сессии.
export function createSessionAuth(
  createSession: (spec: RequestSpec) => Promise<{ token: string }>,
): AuthProvider & { subscribe: (listener: Listener) => () => void } {
  let creating: Promise<string> | undefined;
  const listeners = new Set<Listener>();

  function create(): Promise<string> {
    creating ??= createSession({ method: 'POST', path: '/api/sessions', body: {}, auth: false })
      .then(({ token }) => {
        storage.write(STORAGE_KEYS.session, token);
        return token;
      })
      .finally(() => {
        creating = undefined;
      });
    return creating;
  }

  return {
    token: async () => storage.read<string>(STORAGE_KEYS.session) ?? create(),

    async refresh(rejected) {
      // Другой запрос уже мог обновить сессию: тогда используем новый токен.
      const current = storage.read<string>(STORAGE_KEYS.session);
      if (current && current !== rejected) return current;
      storage.remove(STORAGE_KEYS.session);
      const token = await create();
      // У новой сессии своя корзина и заказы, старый кэш больше не подходит.
      for (const listener of listeners) listener();
      return token;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
