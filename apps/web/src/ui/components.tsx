import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiError } from '../api/http';
import { describeError } from './describeError';

export const cx = (...names: (string | false | null | undefined)[]) => {
  let result = '';
  for (const name of names) if (name) result = result ? `${result} ${name}` : name;
  return result;
};

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Loading({ text }: { text: string }) {
  return (
    <p className="loading" role="status">
      <Spinner />
      {text}
    </p>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

interface ControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = hintId && errorId ? `${hintId} ${errorId}` : (hintId ?? errorId);
  return (
    <div className={cx('field', className)}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'value' | 'onChange'
> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
}

export function TextField({
  label,
  hint,
  error,
  value,
  onChange,
  className,
  ...input
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(control) => (
        <input
          {...input}
          {...control}
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export interface Choice<Value extends string> {
  value: Value;
  label: ReactNode;
  description?: ReactNode;
}

interface ChoiceGroupProps<Value extends string> {
  legend: string;
  name: string;
  value: Value | undefined;
  choices: readonly Choice<Value>[];
  onChange: (value: Value) => void;
  error?: string;
}

export function ChoiceGroup<Value extends string>({
  legend,
  name,
  value,
  choices,
  onChange,
  error,
}: ChoiceGroupProps<Value>) {
  const errorId = useId();
  return (
    <fieldset className="choices" aria-describedby={error ? errorId : undefined}>
      <legend className="choices__legend">{legend}</legend>
      {choices.map((choice) => (
        <label
          key={choice.value}
          className={cx('choice', choice.value === value && 'choice--checked')}
        >
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={choice.value === value}
            aria-invalid={error ? true : undefined}
            onChange={() => onChange(choice.value)}
          />
          <span className="choice__body">
            <span className="choice__label">{choice.label}</span>
            {choice.description && (
              <span className="choice__description">{choice.description}</span>
            )}
          </span>
        </label>
      ))}
      {error && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface NoticeProps {
  tone: 'error' | 'warning' | 'info' | 'success';
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Notice({ tone, title, children, actions, className }: NoticeProps) {
  return (
    <div
      className={cx('notice', `notice--${tone}`, className)}
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
    >
      <p className="notice__title">{title}</p>
      {children}
      {actions && <div className="notice__actions">{actions}</div>}
    </div>
  );
}

export function ErrorNotice({ error, actions }: { error: unknown; actions?: ReactNode }) {
  const { message, hint, requestId } = describeError(error);
  return (
    <Notice tone="error" title={message} actions={actions}>
      {hint && <p className="notice__text">{hint}</p>}
      {requestId && <p className="notice__meta">Код запроса: {requestId}</p>}
    </Notice>
  );
}

function QueryError({ query }: { query: UseQueryResult<unknown, ApiError> }) {
  return (
    <ErrorNotice
      error={query.error}
      actions={
        <Button size="sm" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      }
    />
  );
}

// Для экранов, которым нужны данные нескольких запросов сразу.
export function QueriesFallback({
  queries,
  loadingText,
}: {
  queries: readonly UseQueryResult<unknown, ApiError>[];
  loadingText: string;
}) {
  const failed = queries.find((query) => query.isError && query.data === undefined);
  return failed ? <QueryError query={failed} /> : <Loading text={loadingText} />;
}

interface QueryViewProps<T> {
  query: UseQueryResult<T, ApiError>;
  loadingText: string;
  children: (data: T) => ReactNode;
}

export function QueryView<T>({ query, loadingText, children }: QueryViewProps<T>) {
  if (query.data === undefined) {
    return <QueriesFallback queries={[query]} loadingText={loadingText} />;
  }
  return (
    <>
      {query.isError && <QueryError query={query} />}
      {children(query.data)}
    </>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="page">
      <title>{`${title} — Учебный магазин`}</title>
      <h1 className="page__title">{title}</h1>
      {children}
    </section>
  );
}
