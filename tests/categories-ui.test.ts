// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CategoriesPage } from '../src/CategoriesPage';
import { FinanceContext } from '../src/context';
import type { Mutate } from '../src/context';
const mutate = vi.fn<Mutate>();
import type { Snapshot } from '../shared/domain';


const category = { id: '12345678-1234-4234-8234-123456789012', name: 'Hogar', emoji: '🏠', budgetArs: 500000, budgetUsd: 10000, version: 3 };
const destination = { ...category, id: '12345678-1234-4234-8234-123456789013', name: 'General' };
const data: Snapshot = { categories: [category, destination], accounts: [], movements: [], recurring: [], occurrences: [], plans: [], installments: [] };
const refresh = vi.fn(), notify = vi.fn();
function show(currency: 'ARS' | 'USD' = 'ARS') {
  return render(createElement(FinanceContext.Provider, { value: { data, month: '2026-01', currency, refresh, notify, mutate, setCurrency: vi.fn(), open: vi.fn(), confirm: vi.fn(), user: { name: 'Persona', email: 'persona@example.com', username: 'persona' }, theme: 'light', setTheme: vi.fn(), signOut: vi.fn() } }, createElement(CategoriesPage)));
}
beforeEach(() => { vi.mocked(mutate).mockReset().mockResolvedValue({ result: {}, reconciled: true }); refresh.mockClear(); notify.mockClear(); });
afterEach(cleanup);

it('cambia entre galería y tabla, filtra y muestra el detalle del mes', async () => {
  show();
  expect(screen.getAllByText('ARS 5.000').length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));
  expect(screen.getByRole('table')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar categorías' }), { target: { value: 'hogar' } });
  expect(screen.queryByRole('button', { name: 'Ver gastos de General' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ver gastos de Hogar' }));
  const dialog = await screen.findByRole('dialog', { name: /Hogar/ });
  expect(within(dialog).getByText(/Todavía no hay gastos/)).toBeTruthy();
});

it('crea categorías con presupuestos en centavos y mantiene abierto el formulario si falla', async () => {
  show();
  vi.mocked(mutate).mockRejectedValueOnce(new Error('Ya tenés una categoría con ese nombre.')).mockResolvedValueOnce({ result: { ok: true }, reconciled: true });
  fireEvent.click(screen.getByRole('button', { name: 'Nueva categoría' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nueva categoría' });
  fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Vacaciones' } });
  fireEvent.change(within(dialog).getByLabelText('Presupuesto mensual ARS'), { target: { value: '1.500,25' } });
  fireEvent.change(within(dialog).getByLabelText('Presupuesto mensual USD'), { target: { value: '20' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar categoría' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar categoría' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mutate).toHaveBeenLastCalledWith('/categories', { name: 'Vacaciones', emoji: '🏷️', budgetArs: 150025, budgetUsd: 2000 }, 'POST');
  expect(refresh).not.toHaveBeenCalled();
});

it('edita por identificador y versión conservando el presupuesto de ambas monedas', async () => {
  show('USD');
  expect(screen.getAllByText('USD 100').length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'Editar Hogar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar categoría' });
  fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Vivienda' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar categoría' }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(`/categories/${category.id}`, { name: 'Vivienda', emoji: category.emoji, budgetArs: 500000, budgetUsd: 10000, version: 3 }, 'PATCH'));
});

it('requiere confirmar la eliminación y permite elegir la categoría de destino', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Hogar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Eliminar categoría' });
  expect(mutate).not.toHaveBeenCalled();
  expect(within(dialog).getAllByRole('option')).toHaveLength(2);
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: destination.id } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar categoría' }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(`/categories/${category.id}`, { version: 3, replacementId: destination.id }, 'DELETE'));
});
