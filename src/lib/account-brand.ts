import type { AccountType } from '../../shared/domain';

const brands: [RegExp, string][] = [
  [/\bastro\s*pay\b/, 'astropay'], [/\barq\b|\bdolar\s*app\b/, 'arq'],
  [/\bmercado\s*pago\b/, 'mercadopago'], [/\bcuenta\s*dni\b/, 'cuenta-dni'],
  [/\bgalicia\b/, 'banco-galicia'], [/\bnaranja\s*x\b/, 'naranja-x'],
  [/\buala\b/, 'uala'], [/\bbrubank\b/, 'brubank'], [/\bsantander\b/, 'banco-santander'],
  [/\bbbva\b/, 'banco-bbva'], [/\bpersonal\s*pay\b/, 'personal-pay'],
  [/\b(?:banco\s+(?:de\s+la\s+)?nacion|nacion|bna)\b/, 'banco-nacion'],
  [/\bmodo\b/, 'modo'], [/\b(?:banco\s+)?macro\b/, 'banco-macro'],
  [/\b(?:banco\s+)?ciudad\b/, 'banco-ciudad'], [/\b(?:banco\s+)?patagonia\b/, 'banco-patagonia'],
  [/\bsupervielle\b/, 'banco-supervielle'], [/\bcomafi\b/, 'banco-comafi'],
  [/\bbancor\b|\bbanco\s+de\s+cordoba\b/, 'bancor'],
  [/\bbpn\b|\bbanco\s+provincia\s+(?:de\s+)?neuquen\b/, 'bpn'],
  [/\bicbc\b/, 'banco-icbc'], [/\b(?:banco\s+)?provincia\b/, 'banco-provincia'],
];

/** Only match known names locally. Never send user-provided account names to a logo service. */
export function accountBrand(name: string, type: AccountType): string | null {
  if (type === 'cash') return null;
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return brands.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}
