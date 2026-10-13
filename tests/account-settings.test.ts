// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Layout } from '../src/Layout';
import { AccountPage, ExpensesPage } from '../src/pages';
import { SettingsPage } from '../src/SettingsPage';
import { CategoriesPage } from '../src/CategoriesPage';
import { AccountsPage } from '../src/AccountsPage';
import { send } from '../src/lib/api';
import { today, type FinanceAccount, type Movement, type Posting, type Snapshot } from '../shared/domain';

vi.mock('../src/components/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
vi.mock('../src/components/SessionPreferences', () => ({ SessionPreferences: () => null }));
vi.mock('../src/lib/api', () => ({ send: vi.fn(), api: vi.fn(), authClient: {} }));
const month = today().slice(0, 7);
const bank = { id: '12345678-1234-4234-8234-123456789012', userId: 'owner', name: 'Mi banco', type: 'bank' as const, currency: 'ARS' as const, emoji: '🏦', archived: false, version: 1 };

beforeEach(() => {
  vi.mocked(send).mockReset(); localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function show(path = '/', accounts: FinanceAccount[] = [bank], history: { posting: Posting; movement: Movement }[] = []) {
  let data: Snapshot = { accounts, movements: [], plans: [], installments: [], recurring: [], occurrences: [], categories: [] };
  vi.mocked(send).mockImplementation(async <T>(url: string, input: unknown) => {
    if (url === '/accounts') data = { ...data, accounts: [...data.accounts, { ...bank, ...input as typeof bank }] };
    if (url.startsWith('/accounts/')) data = { ...data, accounts: data.accounts.map((account) => url === `/accounts/${account.id}` ? { ...account, ...input as Partial<FinanceAccount> } : account) };
    return { ok: true } as T;
  });
  const router = createMemoryRouter([{
    path: '/', element: createElement(Layout), HydrateFallback: () => null,
    loader: () => ({ data, user: { name: 'Persona', username: 'persona' } }),
    children: [
      { index: true, element: createElement(ExpensesPage) },
      { path: 'ajustes', element: createElement(SettingsPage) },
      { path: 'categorias', element: createElement(CategoriesPage) },
      { path: 'cuentas', element: createElement(AccountsPage) },
      { path: 'cuentas/:id', element: createElement(AccountPage), loader: () => history },
    ],
  }], { initialEntries: [`${path}?mes=${month}`] });
  render(createElement(RouterProvider, { router }));
  await screen.findByRole('main'); await waitFor(() => expect(screen.queryByText('Ordenando tu mes…')).toBeNull());
  return router;
}

it('mantiene el resumen de gastos y administra las cuentas desde su propia vista', async () => {
  await show();
  expect(screen.getByText('Gasto del mes')).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Mis cuentas' })).toBeNull();
  expect(screen.queryByText(/Saldo|Disponible actual|Preferencias/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar cuenta' })).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Configuración' }));
  await screen.findByRole('heading', { name: 'Configuración' });
  expect(screen.queryByRole('heading', { name: 'Cuentas y tarjetas' })).toBeNull();
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones principales' })).getByRole('link', { name: 'Cuentas' }));
  await screen.findByRole('heading', { name: 'Cuentas' });
  expect(screen.getByRole('link', { name: 'Ver historial de Mi banco' }).getAttribute('href')).toBe(`/cuentas/${bank.id}?mes=${month}`);
});

it('incluye Categorías en la navegación y retira su formulario de Configuración', async () => {
  await show('/ajustes');
  expect(screen.queryByRole('heading', { name: 'Categorías y emojis' })).toBeNull();
  const navigation = screen.getByRole('navigation', { name: 'Secciones principales' });
  fireEvent.click(within(navigation).getByRole('link', { name: 'Categorías' }));
  await screen.findByRole('heading', { name: 'Categorías' });
  expect(screen.getByRole('button', { name: 'Nueva categoría' })).toBeTruthy();
});

it('busca cuentas de todas las monedas, edita y muestra las archivadas', async () => {
  const wallet: FinanceAccount = { ...bank, id: 'wallet', name: 'Mercado Pago', type: 'wallet', currency: 'USD' };
  await show('/cuentas', [bank, wallet, { ...bank, id: 'old', name: 'Anterior', archived: true }]);
  expect(screen.getByRole('heading', { name: 'Mercado Pago' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Anterior' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar cuentas' }), { target: { value: 'mercado' } });
  expect(screen.queryByRole('heading', { name: 'Mi banco' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Editar Mercado Pago' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar cuenta' });
  fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Mercado Pago USD' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('/accounts/wallet', expect.objectContaining({ name: 'Mercado Pago USD', version: 1 }), 'PATCH'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar cuentas' }), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Archivadas/ }));
  expect(screen.getByRole('heading', { name: 'Anterior' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reactivar Anterior' })).toBeTruthy();
});

it('elimina desde la tarjeta con confirmación y muestra errores del servidor', async () => {
  await show('/cuentas');
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Mi banco' }));
  const dialog = await screen.findByRole('dialog', { name: '¿Eliminar Mi banco?' });
  vi.mocked(send).mockRejectedValueOnce(new Error('Esta cuenta tiene movimientos. Archivala.'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith(`/accounts/${bank.id}`, { version: 1 }, 'DELETE'));
  expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Esta cuenta tiene movimientos. Archivala.');
});

it('retira Transferencias de la navegación de escritorio y móvil', async () => {
  await show();
  for (const name of ['Secciones principales', 'Navegación móvil']) {
    const navigation = screen.getByRole('navigation', { name });
    expect(within(navigation).queryByRole('link', { name: 'Transferencias' })).toBeNull();
    expect(within(navigation).getByRole('link', { name: 'Gastos' })).toBeTruthy();
    expect(within(navigation).getByRole('link', { name: 'Recurrentes' })).toBeTruthy();
    expect(within(navigation).getByRole('link', { name: 'Categorías' })).toBeTruthy();
  }
});

it('registra un envío de dinero mediante Gastos con su cuenta y categoría', async () => {
  await show();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }));
  const dialog = await screen.findByRole('dialog', { name: 'Agregar gasto' });
  expect(within(dialog).queryByText(/Destino|Comisión|Tipo de transferencia/)).toBeNull();
  fireEvent.change(within(dialog).getByLabelText('Concepto'), { target: { value: 'Envío a Juan' } });
  fireEvent.change(within(dialog).getByLabelText('Importe en ARS'), { target: { value: '500,50' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('/expenses', expect.objectContaining({
    concept: 'Envío a Juan', amount: 50050, accountId: bank.id, category: 'Sin categoría',
  }), 'POST'));
});

it('permite guardar un gasto con el concepto vacío', async () => {
  await show();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }));
  const dialog = await screen.findByRole('dialog', { name: 'Agregar gasto' });
  expect(within(dialog).getByPlaceholderText('Opcional · Ej. Supermercado')).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('Importe en ARS'), { target: { value: '500' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('/expenses', expect.objectContaining({ concept: '', amount: 50000 }), 'POST'));
});

it('muestra un título discreto y permite editar y duplicar un gasto sin concepto', async () => {
  const movement: Movement = {
    id: '23456789-1234-4234-8234-123456789012', userId: 'owner', kind: 'expense',
    concept: '', date: today(), amount: 10000, currency: 'ARS', accountId: bank.id,
    destinationId: null, receivedAmount: null, destinationCurrency: null,
    direction: 'outgoing', classification: 'expense', counterpart: '', fee: 0, expenseAmount: 10000,
    category: 'Sin categoría', emoji: '🛍️', notes: '', sourceType: 'single', sourceId: null,
    version: 1, voided: false, createdAt: new Date().toISOString(),
  };
  await show(`/cuentas/${bank.id}`, [bank], [{
    posting: { id: 'posting', movementId: movement.id, accountId: bank.id, delta: -10000 }, movement,
  }]);
  expect((await screen.findByText('Gasto sin concepto')).className).toBe('muted');
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Gasto sin concepto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  let dialog = await screen.findByRole('dialog', { name: 'Editar gasto' });
  expect((within(dialog).getByLabelText('Concepto') as HTMLInputElement).value).toBe('');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith(`/expenses/${movement.id}`, expect.objectContaining({ concept: '', version: 1 }), 'PUT'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Gasto sin concepto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
  dialog = await screen.findByRole('dialog', { name: 'Duplicar gasto' });
  expect((within(dialog).getByLabelText('Concepto') as HTMLInputElement).value).toBe('');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('/expenses', expect.objectContaining({ concept: '', amount: movement.amount }), 'POST'));
});

it('conserva el historial de una tarjeta sin ofrecer registrar su pago ni editar transferencias antiguas', async () => {
  const movement: Movement = {
    id: '23456789-1234-4234-8234-123456789012', userId: 'owner', kind: 'transfer',
    concept: 'Pago anterior', date: today(), amount: 10000, currency: 'ARS', accountId: bank.id,
    destinationId: '34567890-1234-4234-8234-123456789012', receivedAmount: 10000, destinationCurrency: 'ARS',
    direction: 'outgoing', classification: 'neutral', counterpart: '', fee: 0, expenseAmount: 0,
    category: 'Transferencia', emoji: '💳', notes: '', sourceType: 'single', sourceId: null,
    version: 1, voided: false, createdAt: new Date().toISOString(),
  };
  const card: FinanceAccount = { ...bank, id: movement.destinationId!, type: 'credit', name: 'Visa' };
  await show(`/cuentas/${card.id}`, [bank, card], [{
    posting: { id: 'posting', movementId: movement.id, accountId: card.id, delta: -10000 }, movement,
  }]);
  expect(await screen.findByText('Pago anterior')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Registrar pago de tarjeta' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Registrar ingreso' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Pago anterior' }));
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Anular' })).toBeTruthy();
});

it('guía a Cuentas y permite crear una cuenta sin ingresar saldos', async () => {
  await show('/', []);
  fireEvent.click(screen.getByRole('link', { name: 'Configurar cuentas' }));
  await screen.findByRole('heading', { name: 'Cuentas' });
  fireEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }));
  const dialog = await screen.findByRole('dialog', { name: 'Agregar cuenta' });
  expect(within(dialog).queryByText(/Saldo|Fecha del saldo/)).toBeNull();
  fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Banco USD' } });
  fireEvent.change(within(dialog).getByLabelText('Moneda'), { target: { value: 'USD' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await screen.findByRole('link', { name: 'Ver historial de Banco USD' });
  const [url, payload] = vi.mocked(send).mock.calls[0];
  expect(url).toBe('/accounts'); expect(payload).toMatchObject({ name: 'Banco USD', type: 'bank', currency: 'USD' });
  expect(Object.keys(payload as object).sort()).toEqual(['color', 'currency', 'emoji', 'id', 'name', 'type']);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('abre el historial sin saldos y vuelve a Cuentas conservando el mes', async () => {
  const router = await show(`/cuentas/${bank.id}`);
  await screen.findByRole('heading', { name: 'Historial de la cuenta' });
  expect(screen.queryByText(/Saldo actual|Saldo inicial|Revisar saldo/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Editar cuenta' })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Volver a Cuentas' }));
  await screen.findByRole('heading', { name: 'Cuentas' });
  expect(router.state.location.search).toBe(`?mes=${month}`);
});

it('guarda un color elegido, lo recupera al editar y permite volver al automático', async () => {
  await show('/cuentas', []);
  fireEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }));
  let dialog = await screen.findByRole('dialog', { name: 'Agregar cuenta' });
  fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Galicia' } });
  const picker = within(dialog).getByLabelText('Elegir color personalizado') as HTMLInputElement;
  expect(picker.value).toBe('#ed6b25');
  fireEvent.change(picker, { target: { value: '#ffeebb' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  const card = await screen.findByRole('article', { name: 'Galicia' });
  expect(card.style.getPropertyValue('--account-color')).toBe('#ffeebb');
  expect(send).toHaveBeenCalledWith('/accounts', expect.objectContaining({ color: '#ffeebb' }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar Galicia' }));
  dialog = await screen.findByRole('dialog', { name: 'Editar cuenta' });
  expect((within(dialog).getByLabelText('Elegir color personalizado') as HTMLInputElement).value).toBe('#ffeebb');
  fireEvent.change(within(dialog).getByLabelText('Nombre de la cuenta'), { target: { value: 'Mercado Pago' } });
  expect((within(dialog).getByLabelText('Elegir color personalizado') as HTMLInputElement).value).toBe('#ffeebb');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Automático' }));
  expect((within(dialog).getByLabelText('Elegir color personalizado') as HTMLInputElement).value).toBe('#009ee3');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  const renamed = await screen.findByRole('article', { name: 'Mercado Pago' });
  expect(renamed.style.getPropertyValue('--account-color')).toBe('#009ee3');
  expect(send).toHaveBeenLastCalledWith(expect.stringMatching(/^\/accounts\//), expect.objectContaining({ color: null }), 'PATCH');
});
