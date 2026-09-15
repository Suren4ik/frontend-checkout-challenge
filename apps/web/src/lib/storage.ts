// localStorage бросает исключения в приватном режиме и при переполнении: тогда просто работаем без него.
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

export const storage = {
  read<T>(key: string): T | undefined {
    return safely(() => {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    });
  },
  write(key: string, value: unknown): void {
    safely(() => localStorage.setItem(key, JSON.stringify(value)));
  },
  remove(key: string): void {
    safely(() => localStorage.removeItem(key));
  },
};

export const STORAGE_KEYS = {
  session: 'checkout.session',
  checkoutForm: 'checkout.form',
  orderCommand: 'checkout.command.order',
  paymentCommand: (orderId: string) => `checkout.command.payment.${orderId}`,
} as const;
