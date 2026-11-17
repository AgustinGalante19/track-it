// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../src/Layout';
import { ExpensesPage, RecurringPage } from '../src/pages';
import { send } from '../src/lib/api';
import { financeStore } from '../src/lib/finance-store';
import { addMonth, today, type Occurrence, type Recurring, type Snapshot } from '../shared/domain';

vi.mock('../src/components/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
vi.mock('../src/lib/api', () => ({ send: vi.fn(), api: vi.fn(), authClient: {} }));

const month = today().slice(0, 7);
const ruleId = '23456789-1234-4234-8234-123456789012';
beforeEach(() => {
  financeStore.resetSession();
  vi.mocked(send).mockReset();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  localStorage.clear();
});
afterEach(() => { cleanup(); financeStore.resetSession(); vi.unstubAllGlobals(); });

it('permite registrar desde Inicio un débito recurrente vencido de otro mes y moneda', async () => {
  const date = today();
  const dueDate = addMonth(date, -1);
  const nextDueDate = addMonth(date, 1);
  const accountId = '12345678-1234-4234-8234-123456789012';
  const creditId = '34567890-1234-4234-8234-123456789012';
  const creditRuleId = '45678901-1234-4234-8234-123456789012';
  const account = { userId: 'owner', emoji: '🏦', archived: false, version: 1, color: null };
  const occurrence: Occurrence = {
    id: `${ruleId}:${dueDate.slice(0, 7)}`, ruleId, userId: 'owner', period: dueDate.slice(0, 7),
    name: 'Débito en dólares', accountId, amount: 12500, emoji: '📺', category: 'Servicios',
    dueDate, status: 'pending', movementId: null,
  };
  const rule: Recurring = {
    id: ruleId, name: occurrence.name, accountId, amount: occurrence.amount, category: occurrence.category,
    emoji: occurrence.emoji, userId: 'owner', iconKey: 'category', kind: 'service',
    dueDay: Number(dueDate.slice(8)), startDate: dueDate, active: true, deleted: false, version: 1, generationFrom: null,
  };
  let data: Snapshot = {
    accounts: [
      { ...account, id: accountId, name: 'Banco', type: 'bank', currency: 'USD' },
      { ...account, id: creditId, name: 'Tarjeta', type: 'credit', currency: 'ARS' },
    ],
    occurrences: [
      occurrence,
      { ...occurrence, id: 'credit', ruleId: creditRuleId, accountId: creditId, name: 'Cargo de tarjeta' },
      { ...occurrence, id: 'credit-current', ruleId: creditRuleId, accountId: creditId, name: 'Cargo de este mes', period: month, dueDate: date },
      { ...occurrence, id: 'today', period: month, dueDate: date, name: 'Servicio de hoy' },
      { ...occurrence, id: 'future', period: nextDueDate.slice(0, 7), dueDate: nextDueDate, name: 'Servicio futuro' },
      { ...occurrence, id: 'skipped', status: 'skipped', name: 'Período omitido' },
      { ...occurrence, id: 'orphan', ruleId: 'removed', name: 'Vencimiento eliminado' },
      { ...occurrence, id: 'orphan-current', ruleId: 'removed', period: month, dueDate: date },
      { ...occurrence, id: 'deleted', ruleId: 'deleted', name: 'Recurrente eliminado' },
    ],
    recurring: [
      rule,
      { ...rule, id: creditRuleId, accountId: creditId, name: 'Cargo de tarjeta', iconKey: 'netflix' },
      { ...rule, id: 'deleted', deleted: true, active: false },
    ],
    categories: [{ id: 'service', name: rule.category, emoji: '💡', iconKey: 'water', budgetArs: 0, budgetUsd: 0, version: 1 }],
    movements: [], plans: [], installments: [],
  };
  const path = `/occurrences/${encodeURIComponent(occurrence.id)}/charge`;
  vi.mocked(send).mockImplementation(async <T>(url: string) => {
    if (url === path) {
      data = { ...data, occurrences: data.occurrences.map((period) =>
        period.id === occurrence.id ? { ...period, status: 'paid' } : period) };
    }
    return { ok: true } as T;
  });
  financeStore.setTransport({
    bootstrap: async () => ({ data, userId: 'owner', user: { name: 'Persona', email: 'persona@cuentas.invalid', username: 'persona' } }),
    history: async () => [],
    mutation: ({ path, body, method }) => send(path, body, method),
  });
  const router = createMemoryRouter([{
    path: '/', element: createElement(Layout), HydrateFallback: () => null,
    loader: () => financeStore.load({ month }),
    children: [
      { index: true, element: createElement(ExpensesPage) },
      { path: 'recurrentes', element: createElement(RecurringPage) },
    ],
  }], { initialEntries: [`/?mes=${month}`] });
  render(createElement(RouterProvider, { router }));

  const due = within(await screen.findByRole('list', { name: 'Vencimientos de recurrentes' }));
  const [debitCard, creditCard, ...todayCards] = due.getAllByRole('listitem');
  expect(todayCards).toHaveLength(2);
  for (const card of todayCards) expect(within(card).getByText('Vence hoy')).toBeTruthy();
  expect(due.getByRole('button', { name: 'Confirmar pago de Servicio de hoy, vence hoy' })).toBeTruthy();
  expect(due.queryByText('Servicio futuro')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Recurrentes vencidos' })).toBeNull();
  expect(due.queryByText(/Si ya pagaste/)).toBeNull();
  expect(within(debitCard).getByText('USD 125')).toBeTruthy();
  expect(within(debitCard).getByText('Vencido')).toBeTruthy();
  expect(within(creditCard).getByText('Vencido')).toBeTruthy();
  expect(within(creditCard).getByRole('button', { name: /Registrar cargo de Cargo de tarjeta/ })).toBeTruthy();
  expect(debitCard.querySelector('[data-icon="water"]')).toBeTruthy();
  expect(creditCard.querySelector('[data-icon="netflix"]')).toBeTruthy();
  expect(due.queryByText(occurrence.emoji)).toBeNull();
  expect(screen.getByText('2 por confirmar')).toBeTruthy();

  fireEvent.click(within(debitCard).getByRole('button', { name: /Confirmar pago de Débito en dólares/ }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Confirmar pago' }));
  const amount = dialog.getByLabelText<HTMLInputElement>('Importe real en USD');
  expect(amount.value).toBe('125,00');
  fireEvent.change(amount, { target: { value: '129,50' } });
  fireEvent.change(dialog.getByLabelText('Fecha efectiva del cargo o débito'), { target: { value: dueDate } });
  fireEvent.click(dialog.getByRole('button', { name: 'Confirmar pago' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(send).toHaveBeenCalledExactlyOnceWith(path, expect.objectContaining({ amount: 12950, date: dueDate }), 'POST');
  expect(due.queryByText('Débito en dólares')).toBeNull();
  expect(due.getByText('Cargo de tarjeta')).toBeTruthy();

  const deletePath = `/recurring/${creditRuleId}`;
  vi.mocked(send).mockImplementationOnce(async <T>() => ({
    result: { ok: true }, changes: { version: 1, collections: {
      recurring: { upserts: [], removes: [creditRuleId] },
    }, historyAccountIds: [] },
  }) as T);
  const navigation = within(screen.getByRole('navigation', { name: 'Secciones principales' }));
  fireEvent.click(navigation.getByRole('link', { name: 'Recurrentes' }));
  await screen.findByRole('heading', { name: 'Recurrentes' });
  const credit = screen.getByText('Cargo de tarjeta').closest('.recurring-item') as HTMLElement;
  fireEvent.click(within(credit).getByRole('button', { name: 'Eliminar recurrente' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByText('Recurrente eliminado.');
  expect(send).toHaveBeenLastCalledWith(deletePath, { version: 1 }, 'DELETE');
  fireEvent.click(navigation.getByRole('link', { name: 'Gastos' }));
  await screen.findByRole('heading', { name: 'Gastos' });
  const remaining = within(screen.getByRole('list', { name: 'Vencimientos de recurrentes' }));
  expect(remaining.getAllByRole('listitem')).toHaveLength(1);
  expect(remaining.getByText('Servicio de hoy')).toBeTruthy();
  expect(screen.getByText('1 por confirmar')).toBeTruthy();
});

async function showRecurring(state: 'active' | 'paused' | 'future' = 'active') {
  const accountId = '12345678-1234-4234-8234-123456789012';
  let data: Snapshot = {
    accounts: [{ id: accountId, userId: 'owner', name: 'Banco', type: 'bank', currency: 'ARS', emoji: '🏦', archived: false, version: 1 }],
    recurring: [{ id: ruleId, userId: 'owner', name: 'Streaming', kind: 'subscription', accountId, amount: 1000, dueDay: 1, startDate: state === 'future' ? addMonth(`${month}-01`, 1) : `${month}-01`, emoji: '📺', category: 'Servicios', active: state !== 'paused', deleted: false, version: 3, generationFrom: null }],
    occurrences: state === 'active' ? [{ id: `${ruleId}:${month}`, userId: 'owner', ruleId, period: month, name: 'Streaming', emoji: '📺', category: 'Servicios', accountId, amount: 1000, dueDate: `${month}-01`, status: 'pending', movementId: null }] : [],
    movements: [], plans: [], installments: [], categories: [],
  };
  vi.mocked(send).mockImplementation(async <T>() => {
    data = { ...data, recurring: [], occurrences: [] };
    return { ok: true } as T;
  });
  financeStore.setTransport({
    bootstrap: async () => ({ data, userId: 'owner', user: { name: 'Persona', email: 'persona@cuentas.invalid', username: 'persona' } }),
    history: async () => [],
    mutation: ({ path, body, method }) => send(path, body, method),
  });
  await financeStore.load({ month });
  const router = createMemoryRouter([{
    path: '/', element: createElement(Layout), HydrateFallback: () => null,
    loader: () => financeStore.load({ month }),
    children: [{ path: 'recurrentes', element: createElement(RecurringPage) }],
  }], { initialEntries: [`/recurrentes?mes=${month}`] });
  render(createElement(RouterProvider, { router }));
  await screen.findByRole('heading', { name: 'Recurrentes' });
  return state === 'active' ? 'Eliminar recurrente' : 'Eliminar';
}

describe('Eliminación desde Recurrentes', () => {
  it.each(['active', 'paused', 'future'] as const)('permite cancelar y confirmar la eliminación de un recurrente %s', async (state) => {
    const label = await showRecurring(state);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('dialog', { name: '¿Eliminar Streaming?' })).toBeTruthy();
    expect(screen.getAllByText(/Los pagos ya registrados se conservan en el historial/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByText(/Streaming$/)).toBeNull());
    expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(send).toHaveBeenCalledWith(`/recurring/${ruleId}`, { version: 3 }, 'DELETE');
    expect(await screen.findByText('Recurrente eliminado.')).toBeTruthy();
    expect(screen.queryByText('Streaming')).toBeNull();
  });
  it('mantiene el recurrente ante un error y permite reintentar la confirmación', async () => {
    const label = await showRecurring();
    vi.mocked(send).mockRejectedValueOnce(new Error('No pudimos completar la operación.'));
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('No pudimos completar la operación.');
    expect(screen.getByText('Streaming')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByText('Streaming')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Recurrente eliminado.')).toBeTruthy();
    expect(screen.queryByText('Streaming')).toBeNull();
  });
});
