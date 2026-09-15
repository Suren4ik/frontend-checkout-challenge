const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// API отдаёт суммы в копейках.
export const formatMoney = (kopecks: number): string => rub.format(kopecks / 100);
