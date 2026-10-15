// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '../src/Layout';
import { ExpensesPage } from '../src/pages';
import { financeStore, createFinanceTransport } from '../src/lib/finance-client';
import { api } from '../src/lib/api';
import { today, type Snapshot, type Movement } from '../shared/domain';

vi.mock('../src/lib/api', async (original) => ({ ...await original<typeof import('../src/lib/api')>(), api: vi.fn() }));
const accountId = '12345678-1234-4234-8234-123456789012';
const data: Snapshot = { accounts: [{ id: accountId, userId: 'A', name: 'PCACHE-Bank', type: 'bank', currency: 'ARS', emoji: 'B', color: null, archived: false, version: 1 }],
  movements: [], recurring: [], occurrences: [], plans: [], installments: [], categories: [] };
const boot = { data, userId: 'A', user: { name: 'PCACHE-Person', email: 'fiction@example.invalid' } };
let router: ReturnType<typeof createMemoryRouter> | undefined;
beforeEach(() => {
  financeStore.resetSession(); vi.mocked(api).mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); router?.dispose(); financeStore.resetSession(); vi.unstubAllGlobals(); });
it('adds sync metadata only to financial deltas and retains cancellable no-store reads', async () => {
  const transport = createFinanceTransport(), controller = new AbortController();
  vi.mocked(api).mockResolvedValue({});
  await transport.mutation({ path: '/occurrences/opaque%3A2026-10/charge', body: { amount: 100 }, month: '2026-10', signal: controller.signal });
  expect(api).toHaveBeenLastCalledWith('/occurrences/opaque%3A2026-10/charge?sync=1&month=2026-10', expect.objectContaining({ method: 'POST', signal: controller.signal }));
  await transport.mutation({ path: '/backup/restore', body: {}, month: '2026-10', responseMode: 'full-refresh', signal: controller.signal });
  expect(api).toHaveBeenLastCalledWith('/backup/restore', expect.anything());
  await transport.bootstrap({ month: '2026-10', signal: controller.signal });
  expect(api).toHaveBeenLastCalledWith('/bootstrap?month=2026-10', { signal: controller.signal, cache: 'no-store' });
});
it('renders confirmed values before success and makes no post-save bootstrap request', async () => {
  let confirm!: (value: unknown) => void;
  const bootstrap = vi.fn().mockResolvedValue(boot);
  const mutation = vi.fn(() => new Promise<unknown>((resolve) => { confirm = resolve; }));
  financeStore.setTransport({ bootstrap, mutation, history: vi.fn().mockResolvedValue([]) });
  router = createMemoryRouter([{ path: '/', loader: () => financeStore.load({ month: today().slice(0, 7) }), element: createElement(Layout),
    children: [{ index: true, element: createElement(ExpensesPage) }] }]);
  render(createElement(RouterProvider, { router }));
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar gasto' }));
  const dialog = await screen.findByRole('dialog', { name: 'Agregar gasto' });
  fireEvent.change(within(dialog).getByLabelText('Concepto'), { target: { value: 'PCACHE-Confirmed' } });
  fireEvent.change(within(dialog).getByLabelText('Importe en ARS'), { target: { value: '100,00' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(mutation).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Guardado.')).toBeNull(); expect(financeStore.getState().data?.movements).toHaveLength(0);
  const row: Movement = { id: 'movement', userId: 'A', accountId, amount: 10000, currency: 'ARS', date: today(), concept: 'PCACHE-Confirmed',
    kind: 'expense', destinationId: null, receivedAmount: null, destinationCurrency: null, direction: 'outgoing', classification: 'expense',
    counterpart: '', fee: 0, expenseAmount: 10000, category: 'General', emoji: 'E', notes: '', sourceType: 'single', sourceId: null,
    version: 1, voided: false, createdAt: new Date().toISOString() };
  confirm({ result: row, changes: { version: 1, collections: { movements: { upserts: [row], removes: [] },
    accounts: { upserts: [{ ...data.accounts[0], version: 2 }], removes: [] } }, historyAccountIds: [accountId] } });
  await screen.findByText('Guardado.');
  expect(screen.getByText('PCACHE-Confirmed')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Resumen mensual' })).getByText('ARS 100')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull(); expect(bootstrap).toHaveBeenCalledTimes(1);
});
