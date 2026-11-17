import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/push-notifications.js', import.meta.url), 'utf8');

function setupWorker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  const fetch = vi.fn().mockResolvedValue(undefined);
  const self = {
    addEventListener: (event: string, listener: (data: unknown) => void) => listeners.set(event, listener),
    registration: { showNotification },
    location: { origin: 'https://track-it.example' },
    clients: { openWindow, matchAll },
  };
  runInNewContext(source, { self, URL, fetch });
  return { push: listeners.get('push')!, click: listeners.get('notificationclick')!, showNotification, openWindow, matchAll, fetch };
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
  expect(worker.fetch).not.toHaveBeenCalled();
});

it('keeps the test tag with a legacy due date and reports display after Android confirms it', async () => {
  const worker = setupWorker();
  const notice = { kind: 'test', title: 'Aviso de prueba', body: 'Mensaje de prueba.', dueDate: '2000-01-01', receiptToken: 'signed-token' };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  let resolveDisplay!: () => void;
  worker.showNotification.mockReturnValueOnce(new Promise<void>((resolve) => { resolveDisplay = resolve; }));
  worker.push({ data: { json: () => notice }, waitUntil });
  expect(worker.showNotification).toHaveBeenCalledExactlyOnceWith(notice.title, expect.objectContaining({ tag: 'track-it-test', data: undefined }));
  expect(worker.fetch).not.toHaveBeenCalled();
  resolveDisplay();
  await waitUntil.mock.calls[0][0];
  expect(worker.fetch).toHaveBeenCalledExactlyOnceWith('/api/notifications/receipt', {
    method: 'POST', mode: 'same-origin', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'signed-token', status: 'shown' }),
  });
});

it('reports a display failure without including the browser error in the receipt', async () => {
  const worker = setupWorker();
  const notice = { kind: 'test', title: 'Aviso de prueba', body: 'Mensaje de prueba.', receiptToken: 'signed-token' };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.showNotification.mockRejectedValueOnce(new Error('display denied'));
  worker.push({ data: { json: () => notice }, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(worker.fetch).toHaveBeenCalledExactlyOnceWith('/api/notifications/receipt', expect.objectContaining({
    body: JSON.stringify({ token: 'signed-token', status: 'display-failed' }),
  }));
});

it('keeps displaying a test notice when the receipt request fails', async () => {
  const worker = setupWorker();
  const notice = { kind: 'test', title: 'Aviso de prueba', body: 'Mensaje de prueba.', receiptToken: 'signed-token' };
  const waitUntil = vi.fn<(completion: Promise<unknown>) => void>();
  worker.fetch.mockRejectedValueOnce(new Error('network unavailable'));
  worker.push({ data: { json: () => notice }, waitUntil });
  await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  expect(worker.showNotification).toHaveBeenCalledTimes(1);
  expect(worker.fetch).toHaveBeenCalledTimes(1);
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
