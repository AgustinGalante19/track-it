import type { CurrencyView } from '../context';

export function CurrencyFilter({ value, onChange }: { value: CurrencyView; onChange: (value: CurrencyView) => void }) {
  return <select className="list-currency-filter" aria-label="Filtrar por moneda" value={value} onChange={(event) => onChange(event.target.value as CurrencyView)}>
    <option value="ALL">Todas las monedas</option>
    <option value="ARS">Solo ARS</option>
    <option value="USD">Solo USD</option>
  </select>;
}
