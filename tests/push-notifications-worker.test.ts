import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/push-notifications.js', import.meta.url), 'utf8');

function setupWorker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const self = {
    addEventListener: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener),
    registration: { showNotification },
    location: { origin: 'https://track-it.example' },
    clients: { openWindow, matchAll },
  };
  runInNewContext(source, { self, URL });
  return { push: listeners.get('push')!, click: listeners.get('notificationclick')!, showNotification, openWindow, matchAll };
}

it('displays a recurring reminder with a stable tag for the debit date', async () => {
  const worker = setupWorker();
  const reminder = { title: 'Próximo débito', body: 'El 01/12 se debitan $40.000 ARS y 1 más.', dueDate: '2026-12-01' };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.push({ data: { json: () => reminder }, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith(reminder.title, expect.objectContaining({ body: reminder.body, tag: 'recurring-2026-12-01', data: { dueDate: reminder.dueDate } }));
});

it('opens the recurring page for the debit month and ignores payload redirect fields', async () => {
  const worker = setupWorker();
  const notification = { data: { dueDate: '2026-12-01', url: 'https://elsewhere.example' }, tag: 'recurring-2026-12-01', close: vi.fn() };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.click({ notification, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(notification.close).toHaveBeenCalledTimes(1);
  expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith('https://track-it.example/recurrentes?mes=2026-12');
});

it('focuses an existing matching recurring page', async () => {
  const worker = setupWorker();
  const focus = vi.fn();
  worker.matchAll.mockResolvedValue([{ url: 'https://track-it.example/recurrentes?mes=2026-11', focus }]);
  const notification = { data: { dueDate: '2026-11-18' }, tag: 'recurring-2026-11-18', close: vi.fn() };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.click({ notification, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(focus).toHaveBeenCalledTimes(1);
  expect(worker.openWindow).not.toHaveBeenCalled();
});

it('displays a card closing reminder separately from debit reminders for the same date', async () => {
  const worker = setupWorker();
  const notice = { kind: 'card-closing', title: 'Cierre de tarjeta', body: 'Recordá que el 27/11 cierra la tarjeta Visa.', dueDate: '2026-11-27' };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.push({ data: { json: () => notice }, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith(notice.title, expect.objectContaining({
    body: notice.body, tag: 'card-closing-2026-11-27', data: { dueDate: notice.dueDate },
  }));
});

it('opens accounts for the closing month from a card reminder', async () => {
  const worker = setupWorker();
  const notification = { data: { dueDate: '2026-11-27' }, tag: 'card-closing-2026-11-27', close: vi.fn() };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.click({ notification, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(notification.close).toHaveBeenCalledTimes(1);
  expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith('https://track-it.example/cuentas?mes=2026-11');
});

it('shows test pushes without a due date and gives them a separate tag', async () => {
  const worker = setupWorker();
  const notice = { kind: 'test', title: 'Aviso de prueba', body: 'Ya podés recibir avisos de Track-It.' };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.push({ data: { json: () => notice }, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith(notice.title, expect.objectContaining({ body: notice.body, tag: 'track-it-test', renotify: true }));
});

it.each([false, true])('opens the app root from a test notice or focuses it when open (%s)', async (alreadyOpen) => {
  const worker = setupWorker();
  const root = 'https://track-it.example/';
  const focus = vi.fn();
  if (alreadyOpen) worker.matchAll.mockResolvedValue([{ url: root, focus }]);
  const notification = { tag: 'track-it-test', close: vi.fn() };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.click({ notification, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(notification.close).toHaveBeenCalledTimes(1);
  if (alreadyOpen) {
    expect(focus).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).not.toHaveBeenCalled();
  } else {
    expect(worker.openWindow).toHaveBeenCalledExactlyOnceWith(root);
  }
});
