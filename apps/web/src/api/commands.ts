import { storage } from '../lib/storage';
import { ApiError } from './http';

export interface IdempotentCommand<Body> {
  readonly key: string;
  readonly body: Body;
}

interface StoredCommand {
  key: string;
  body: string;
}

// Ключ хранится, пока исход запроса неизвестен (сеть, таймаут, 5xx). Повтор с тем же телом,
// в том числе после перезагрузки, уходит с тем же ключом, и сервер вернёт уже созданный объект.
export async function sendIdempotent<Body, Result>(
  storageKey: string,
  body: Body,
  send: (command: IdempotentCommand<Body>) => Promise<Result>,
): Promise<Result> {
  const json = JSON.stringify(body);
  const saved = storage.read<StoredCommand>(storageKey);
  const key = saved?.body === json ? saved.key : crypto.randomUUID();
  if (key !== saved?.key) storage.write(storageKey, { key, body: json } satisfies StoredCommand);
  try {
    const result = await send({ key, body });
    storage.remove(storageKey);
    return result;
  } catch (error) {
    if (!(error instanceof ApiError && error.outcomeUnknown)) storage.remove(storageKey);
    throw error;
  }
}
