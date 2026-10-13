import { createContext, useContext } from 'react';
import type { AuthUser } from '../shared/auth';
import type { Snapshot, Currency, Movement, Recurring, Occurrence, Installment, FinanceAccount } from '../shared/domain';
export type Composer =
  | { type: 'expense'; movement?: Movement; duplicate?: boolean }
  | { type: 'plan' }
  | { type: 'recurring'; rule?: Recurring }
  | { type: 'income'; accountId?: string }
  | { type: 'account'; account?: FinanceAccount }
  | { type: 'charge'; occurrence?: Occurrence; installment?: Installment };
export type Confirmation = { title: string; description: string; action: () => Promise<unknown>; success: string; destructive?: boolean };
export const FinanceContext = createContext<{
  data: Snapshot; month: string; currency: Currency; setCurrency: (value: Currency) => void;
  open: (form: Composer) => void; confirm: (confirmation: Confirmation) => void;
  notify: (message: string) => void; refresh: () => void;
  user: AuthUser; theme: string;
  setTheme: (value: string) => void; signOut: () => Promise<void>;
} | null>(null);
export function useFinance() { const context = useContext(FinanceContext); if (!context) throw new Error('Falta el contexto de la aplicación.'); return context; }
