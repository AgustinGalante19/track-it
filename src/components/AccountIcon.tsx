import { useState, type CSSProperties } from 'react';
import { Landmark, Wallet, Banknote, CreditCard } from 'lucide-react';
import type { AccountType } from '../../shared/domain';
import { accountBrand } from '../lib/account-brand';
import { accountColor, accountIconColor } from '../lib/account-appearance';
import '../account-icons.css';

const logos = import.meta.glob<string>('../assets/banks/*.svg', { eager: true, query: '?url', import: 'default' });
const icons = { bank: Landmark, wallet: Wallet, cash: Banknote, credit: CreditCard };
type AccountAppearance = { name: string; type: AccountType; color?: string | null };

export function AccountIcon({ account, small = false }: { account: AccountAppearance; small?: boolean }) {
  const brand = accountBrand(account.name, account.type);
  const src = brand ? logos[`../assets/banks/${brand}.svg`] : undefined;
  const [failedSrc, setFailedSrc] = useState<string>();
  const Icon = icons[account.type];
  const color = account.color ?? accountColor(account.name, account.type);
  return <span className={`account-visual${small ? ' account-visual-small' : ''}`} aria-hidden="true" data-bank={brand ?? undefined} style={{ '--account-color': color, '--account-ink': accountIconColor(color) } as CSSProperties}>
    {src && failedSrc !== src ? <img src={src} alt="" width="40" height="40" onError={() => setFailedSrc(src)} /> : <Icon size={small ? 14 : 25} />}
  </span>;
}
