import { Button } from '../ui/components';

interface QuantityStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function QuantityStepper({ label, value, min, max, onChange }: QuantityStepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <Button
        size="sm"
        className="stepper__button"
        aria-label={value === 1 && min === 0 ? 'Убрать из корзины' : 'Уменьшить количество'}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </Button>
      <output className="stepper__value" aria-live="polite">
        {value}
      </output>
      <Button
        size="sm"
        className="stepper__button"
        aria-label="Увеличить количество"
        title={value >= max ? `Доступно не больше ${max} шт.` : undefined}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}
