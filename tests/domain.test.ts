import { describe, expect, it } from 'vitest';
import { addMonth, monthDate, parseMoney, splitInstallments, validDate } from '../shared/domain';
describe('Importes y fechas', () => {
  it('interpreta importes argentinos y evita entradas ambiguas o precisión excesiva', () => {
    expect(parseMoney('1.250,50')).toBe(125050); expect(parseMoney('1250.50')).toBe(125050);
    expect(parseMoney('1.250')).toBe(125000); expect(parseMoney('0,01')).toBe(1);
    expect(parseMoney('-12,50', true)).toBe(-1250); expect(parseMoney('-12,50')).toBeNull();
    expect(parseMoney('1,234')).toBeNull(); expect(parseMoney('1e5')).toBeNull(); expect(parseMoney('12.34,50')).toBeNull();
    expect(parseMoney('999999999999999999999')).toBeNull();
  });
  it('conserva exactamente el total y ajusta la última cuota', () => {
    const amounts = splitInstallments(10000, 3);
    expect(amounts).toEqual([3333, 3333, 3334]);
    expect(splitInstallments(1_234_567, 60).reduce((a, b) => a + b, 0)).toBe(1_234_567);
    expect(() => splitInstallments(2, 3)).toThrow();
  });
  it('respeta fin de mes sin arrastrar el día reducido a meses posteriores', () => {
    expect(monthDate('2026-02', 31)).toBe('2026-02-28'); expect(monthDate('2028-02', 31)).toBe('2028-02-29');
    expect(addMonth('2026-01-31', 1)).toBe('2026-02-28'); expect(addMonth('2026-01-31', 2)).toBe('2026-03-31');
    expect(validDate('2026-02-31')).toBe(false); expect(validDate('2026-10-10')).toBe(true);
  });
});
