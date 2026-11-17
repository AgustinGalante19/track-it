// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TestPushNotifications } from '../src/components/TestPushNotifications';

const path = '/api/notifications/test';
const historyPath = '/api/notifications/history';
const buttonName = 'Enviar notificación de prueba';
const emptyHistory = { runs: [], nextCursor: null };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('oculta el botón si el servidor no autoriza la prueba', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ enabled: false }));
  vi.stubGlobal('fetch', fetch);
  await act(async () => { render(createElement(TestPushNotifications)); });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(path, expect.objectContaining({ credentials: 'same-origin' }));
  expect(screen.queryByRole('button', { name: buttonName })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Historial de notificaciones' })).toBeNull();
});

it('envía la prueba global desde la PC con un solo clic y muestra el resultado', async () => {
  let complete!: (response: Response) => void;
  const delivery = new Promise<Response>((resolve) => { complete = resolve; });
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url === historyPath) return Response.json(emptyHistory);
    return init.method === 'POST' ? delivery : Response.json({ enabled: true, historyEnabled: true });
  });
  vi.stubGlobal('fetch', fetch);
  render(createElement(TestPushNotifications));
  const button = await screen.findByRole('button', { name: buttonName });
  await screen.findByText('Todavía no hay envíos registrados.');
  expect(screen.getByText(/todos los dispositivos suscriptos, incluidos los de otras cuentas/)).toBeTruthy();
  expect(fetch.mock.calls.filter(([url]) => url === path)).toHaveLength(1);

  fireEvent.click(button);
  expect(button).toHaveProperty('disabled', true);
  fireEvent.click(button);
  expect(fetch.mock.calls.filter(([url]) => url === path)).toHaveLength(2);
  expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' }));

  complete(Response.json({ sent: 2, expired: 1, failed: 3 }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Aviso aceptado para 2 dispositivos. 1 suscripción vencida. 3 envíos fallidos.');
  expect(button).toHaveProperty('disabled', false);
  await waitFor(() => expect(fetch.mock.calls.filter(([url]) => url === historyPath)).toHaveLength(2));
});

it('informa cuando todavía no hay dispositivos suscriptos', async () => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url === historyPath) return Response.json(emptyHistory);
    return Response.json(init.method === 'POST' ? { sent: 0, expired: 0, failed: 0 } : { enabled: true });
  });
  vi.stubGlobal('fetch', fetch);
  render(createElement(TestPushNotifications));
  fireEvent.click(await screen.findByRole('button', { name: buttonName }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'No hay dispositivos suscriptos.');
});

it('muestra la hora argentina y distingue la aceptación push de la confirmación del teléfono', async () => {
  const startedAt = '2026-11-17T12:00:00Z';
  const finishedAt = '2026-11-17T12:00:03Z';
  const runs = [{
    id: 'run-server', source: 'scheduler', status: 'completed', startedAt, finishedAt, reason: null,
    counts: { sent: 2, failed: 0, expired: 0, skipped: 0 }, deliveryCount: 2,
    deliveries: [
      { kind: 'card-closing', at: finishedAt, status: 'sent', device: 'D12345', provider: 'fcm', httpStatus: 201, receipt: 'shown', receiptAt: '2026-11-17T12:00:04Z' },
      { kind: 'recurring', at: finishedAt, status: 'sent', device: 'D67890', provider: 'mozilla', httpStatus: 201, receipt: null, receiptAt: null },
    ],
  }];
  const fetch = vi.fn(async (url: string) => Response.json(url === path ? { enabled: false, historyEnabled: true } : { runs, nextCursor: null }));
  vi.stubGlobal('fetch', fetch);
  render(createElement(TestPushNotifications));

  const summary = (await screen.findByText('Programado desde el servidor')).closest('summary')!;
  expect(summary).toHaveProperty('textContent', expect.stringContaining('17/11/26, 09:00'));
  expect(summary).toHaveProperty('textContent', expect.stringContaining('Aceptadas 2'));
  expect(screen.queryByRole('button', { name: buttonName })).toBeNull();
  fireEvent.click(summary);
  expect(screen.getByText(/Google FCM · Dispositivo D12345 · HTTP 201/)).toBeTruthy();
  expect(screen.getByText(/Mostrada en el teléfono/)).toBeTruthy();
  expect(screen.getByText('Confirmación del dispositivo pendiente.')).toBeTruthy();
});

it('pagina el historial y actualiza desde los envíos más recientes', async () => {
  const run = { id: 'run-cron', source: 'cron', status: 'skipped', startedAt: '2026-11-16T11:59:00Z', finishedAt: null,
    reason: 'before-window', counts: { sent: 0, failed: 0, expired: 0, skipped: 0 }, deliveryCount: 0, deliveries: [] };
  const fetch = vi.fn<(url: string) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ runs: [{ ...run, id: 'run-test', source: 'test' }], nextCursor: 'cursor/+' }))
    .mockResolvedValueOnce(Response.json({ runs: [run], nextCursor: null }))
    .mockResolvedValueOnce(Response.json(emptyHistory));
  vi.stubGlobal('fetch', fetch);
  render(createElement(TestPushNotifications));

  fireEvent.click(await screen.findByRole('button', { name: 'Ver envíos anteriores' }));
  await screen.findByText('Programado desde cron');
  expect(fetch.mock.calls[2]?.[0]).toBe(`${historyPath}?before=cursor%2F%2B`);
  expect(screen.getByText('Prueba manual')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar historial' }));
  await screen.findByText('Todavía no hay envíos registrados.');
  expect(screen.queryByText('Programado desde cron')).toBeNull();
  expect(fetch.mock.calls[3]?.[0]).toBe(historyPath);
});
