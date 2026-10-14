import { createContext, useContext } from 'react';
import type { MutationOptions, MutationResult } from './lib/finance-store';
export type Mutate = (path: string, body: unknown, method?: string, options?: Pick<MutationOptions, 'responseMode' | 'onConfirmed'>) => Promise<MutationResult>;
import type { AuthUser } from '../shared/auth';
import type { Snapshot, Currency, Movement, Recurring, Occurrence, Installment, FinanceAccount } from '../shared/domain';
export type Composer =
  | { type: 'expense'; movement?: Movement; duplicate?: boolean }
  | { type: 'plan' }
  | { type: 'recurring'; rule?: Recurring }
  | { type: 'income'; accountId?: string }
  | { type: 'account'; account?: FinanceAccount }
  | { type: 'charge'; occurrence?: Occurrence; installment?: Installment };
export type Confirmation = { title: string; description: string; action: () => Promise<MutationResult>; success: string; destructive?: boolean };
export const FinanceContext = createContext<{
  data: Snapshot; month: string; currency: Currency; setCurrency: (value: Currency) => void;
  open: (form: Composer) => void; confirm: (confirmation: Confirmation) => void;
  notify: (message: string) => void; refresh: () => Promise<void>; mutate: Mutate;
  user: AuthUser; theme: string;
  setTheme: (value: string) => void; signOut: () => Promise<void>;
} | null>(null);
export function useFinance() { const context = useContext(FinanceContext); if (!context) throw new Error('Falta el contexto de la aplicación.'); return context; }
