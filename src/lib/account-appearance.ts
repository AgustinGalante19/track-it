import type { AccountType } from '../../shared/domain';

export const accountTypes = {
  bank: 'Cuenta bancaria', wallet: 'Billetera virtual', cash: 'Efectivo', credit: 'Tarjeta de crédito',
};

export function accountIconColor(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#15252c' : '#ffffff';
}

// Colores de referencia visual; no representan una vinculación con la entidad.
export function accountColor(name: string, type: AccountType) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const brands: [RegExp, string][] = [
    [/\bmercado\s*pago\b/, '#009ee3'], [/\bgalicia\b/, '#ed6b25'],
    [/\bnaranja\s*x\b/, '#e76524'], [/\buala\b/, '#6455ce'],
    [/\bbrubank\b/, '#7256cf'], [/\bsantander\b/, '#db3038'],
    [/\bbbva\b/, '#2371b5'], [/\bpersonal\s*pay\b/, '#7756c9'],
    [/\bnacion\b/, '#258eac'], [/\bmodo\b/, '#23866d'],
  ];
  return brands.find(([pattern]) => pattern.test(normalized))?.[1]
    ?? { bank: '#477da6', wallet: '#795eb2', cash: '#39866b', credit: '#ac6d38' }[type];
}
