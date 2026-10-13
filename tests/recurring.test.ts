// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../src/Layout';
import { RecurringPage } from '../src/pages';
import { send } from '../src/lib/api';
import { addMonth, today, type Snapshot } from '../shared/domain';

vi.mock('../src/components/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
vi.mock('../src/lib/api', () => ({ send: vi.fn(), api: vi.fn(), authClient: {} }));

const month = today().slice(0, 7);
const ruleId = '23456789-1234-4234-8234-123456789012';
beforeEach(() => {
  vi.mocked(send).mockReset();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
  const router = createMemoryRouter([{
    path: '/', element: createElement(Layout), HydrateFallback: () => null,
    loader: () => ({ data, user: { name: 'Persona', email: 'persona@cuentas.invalid', username: 'persona' } }),
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
    expect(screen.getByText('Recurrente eliminado.')).toBeTruthy();
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
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Recurrente eliminado.')).toBeTruthy();
    expect(screen.queryByText('Streaming')).toBeNull();
  });
});
