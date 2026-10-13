// Estas utilidades no cargan validadores ni formularios al abrir el resumen.
export const MAX_MONEY = 100_000_000_000_000;
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2100-12-31';
}
export function parseMoney(raw: string, allowNegative = false): number | null {
  let value = raw.trim().replace(/\s/g, '');
  if (value.includes(',')) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value)) return null;
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  if (!(allowNegative ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, decimal = ''] = value.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  const result = negative ? -cents : cents;
  return Number.isSafeInteger(result) && Math.abs(result) <= MAX_MONEY ? result : null;
}
export function moneyInput(cents: number) { return (cents / 100).toFixed(2).replace('.', ','); }
const wholeFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatMoney(cents: number, currency: 'ARS' | 'USD') {
  return `${currency} ${(cents % 100 ? decimalFormatter : wholeFormatter).format(cents / 100)}`;
}
export function splitInstallments(total: number, count: number): number[] {
  if (!Number.isSafeInteger(total) || !Number.isInteger(count) || count < 2 || count > 60 || total < count || total > MAX_MONEY) throw new Error('Plan de cuotas inválido.');
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => i === count - 1 ? total - base * (count - 1) : base);
}
export function monthDate(month: string, day: number) {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
export function addMonth(date: string, offset: number) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  return monthDate(target.toISOString().slice(0, 7), day);
}
const calendarFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
export function today() { return calendarFormatter.format(new Date()); }
