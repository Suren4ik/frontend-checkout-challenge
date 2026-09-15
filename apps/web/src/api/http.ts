export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse' | 'aborted';

export interface FieldIssue {
  // путь в теле запроса, например body/customer/email
  path: string;
  message: string;
}

interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: string;
  fields?: readonly FieldIssue[];
  requestId?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly code: string;
  readonly fields: readonly FieldIssue[];
  readonly requestId: string | undefined;

  constructor({ kind, message, status, code, fields, requestId, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code ?? kind.toUpperCase();
    this.fields = fields ?? [];
    this.requestId = requestId;
  }

  // Ответа нет или он нечитаемый: сервер мог успеть выполнить запрос.
  get outcomeUnknown(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      this.kind === 'parse' ||
      (this.status !== undefined && this.status >= 500)
    );
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);

export interface RequestSpec {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  // каталог и тестовые карты доступны без сессии
  auth?: boolean;
}

interface ResponseMeta {
  status: number;
  retryAfterMs: number | undefined;
  requestId: string | undefined;
}

export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
}

export interface AuthProvider {
  token(): Promise<string>;
  refresh(rejected: string): Promise<string>;
}

interface ClientConfig {
  baseUrl: string;
  timeoutMs: number;
  auth?: AuthProvider;
}

function prepareRequest(baseUrl: string, spec: RequestSpec, token: string | undefined): Request {
  const headers = new Headers({ Accept: 'application/json', ...spec.headers });
  if (spec.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request(new URL(spec.path, baseUrl), {
    method: spec.method ?? 'GET',
    headers,
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function readMeta(response: Response): ResponseMeta {
  return {
    status: response.status,
    retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
    requestId: response.headers.get('X-Request-Id') ?? undefined,
  };
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Сервер отклонил запрос.',
  401: 'Сессия недействительна.',
  404: 'Не найдено.',
  409: 'Данные изменились.',
  422: 'Сервер не принял данные.',
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function httpError(meta: ResponseMeta, text: string): ApiError {
  const body = parseJson(text) as
    { error?: { code?: unknown; message?: unknown; fields?: unknown } } | undefined;
  const error = body?.error;
  return new ApiError({
    kind: 'http',
    status: meta.status,
    code: typeof error?.code === 'string' ? error.code : `HTTP_${meta.status}`,
    message:
      typeof error?.message === 'string'
        ? error.message
        : (STATUS_MESSAGES[meta.status] ??
          (meta.status >= 500 ? 'Сервер не смог выполнить запрос.' : 'Запрос не выполнен.')),
    fields: Array.isArray(error?.fields) ? (error.fields as FieldIssue[]) : undefined,
    requestId: meta.requestId,
  });
}

async function readResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const meta = readMeta(response);
  if (!response.ok) throw httpError(meta, await response.text());
  if (response.status === 204) return { data: undefined as T, meta };

  const text = await response.text();
  const envelope = parseJson(text);
  if (envelope === null || typeof envelope !== 'object' || !('data' in envelope)) {
    throw new ApiError({
      kind: 'parse',
      status: meta.status,
      message: text ? 'Сервер вернул ответ неожиданного формата.' : 'Сервер вернул пустой ответ.',
      requestId: meta.requestId,
    });
  }
  return { data: envelope.data as T, meta };
}

function toApiError(error: unknown, signal: AbortSignal | undefined): ApiError {
  if (error instanceof ApiError) return error;
  if (signal?.aborted) {
    return new ApiError({ kind: 'aborted', message: 'Запрос отменён.', cause: error });
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new ApiError({ kind: 'timeout', message: 'Сервер не ответил вовремя.', cause: error });
  }
  return new ApiError({ kind: 'network', message: 'Нет связи с сервером.', cause: error });
}

export function createApiClient({ baseUrl, timeoutMs, auth }: ClientConfig) {
  async function send<T>(spec: RequestSpec, token: string | undefined): Promise<ApiResponse<T>> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = spec.signal ? AbortSignal.any([spec.signal, timeout]) : timeout;
    try {
      const response = await fetch(prepareRequest(baseUrl, spec, token), { signal });
      return await readResponse<T>(response);
    } catch (error) {
      throw toApiError(error, spec.signal);
    }
  }

  async function request<T>(spec: RequestSpec): Promise<ApiResponse<T>> {
    if (!auth || spec.auth === false) return send<T>(spec, undefined);
    const token = await auth.token();
    try {
      return await send<T>(spec, token);
    } catch (error) {
      // Сессия могла пропасть после сброса данных API: получаем новую и повторяем один раз.
      if (!isApiError(error) || error.status !== 401) throw error;
      return send<T>(spec, await auth.refresh(token));
    }
  }

  return {
    request,
    json: async <T>(spec: RequestSpec): Promise<T> => (await request<T>(spec)).data,
  };
}
