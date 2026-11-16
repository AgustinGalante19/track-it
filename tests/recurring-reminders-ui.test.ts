// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecurringReminders } from '../src/components/RecurringReminders';
import { clearLocalPushOnSignOut } from '../src/lib/push-notifications';

const basePath = '/api/notifications/subscription';
const publicKey = '_w';
const keys = { p256dh: 'public-device-key', auth: 'device-auth-secret' };

function mockAndroid(ua = 'Mozilla/5.0 (Linux; Android 15) Chrome/120.0.0.0') {
  let permission: NotificationPermission = 'default';
  let current: PushSubscription | null = null;
  const subscription = (suffix: string) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
    options: { applicationServerKey: new Uint8Array([255]).buffer },
    toJSON: () => ({ keys }),
    unsubscribe: vi.fn(async () => { current = null; return true; }),
  }) as unknown as PushSubscription;
  const created = subscription('new-subscription');
  const getSubscription = vi.fn(async () => current);
  const subscribe = vi.fn(async () => { permission = 'granted'; current = created; return created; });
  const getNotifications = vi.fn<() => Promise<Pick<Notification, 'tag' | 'close'>[]>>().mockResolvedValue([]);
  const registration = { pushManager: { getSubscription, subscribe }, getNotifications };
  const getRegistration = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal('navigator', { userAgent: ua, serviceWorker: { ready: Promise.resolve(registration), getRegistration } });
  vi.stubGlobal('Notification', { get permission() { return permission; } });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('isSecureContext', true);

  let configured = true;
  let stored: { daysBefore: number } | null = null;
  const fetch = vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/notifications/config') return Response.json({ publicKey: configured ? publicKey : null });
    if (path === `${basePath}/status`) return Response.json(stored);
    if (path === basePath && init.method === 'PUT') {
      stored = { daysBefore: JSON.parse(init.body as string).daysBefore };
      return Response.json(stored);
    }
    if (path === basePath && init.method === 'DELETE') {
      stored = null;
      return Response.json({ ok: true });
    }
    throw new Error(`Unexpected request ${init.method} ${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  return {
    created, subscribe, getSubscription, getNotifications, fetch,
    setConfigured: (available: boolean) => { configured = available; },
    setPermission: (next: NotificationPermission) => { permission = next; },
    previousSubscription: () => { current = subscription('previous-subscription'); return current; },
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('enables Android reminders, edits the lead time on the same subscription, and disables delivery', async () => {
  const device = mockAndroid();
  const view = render(createElement(RecurringReminders));
  expect(device.subscribe).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Activar avisos' }));

  await screen.findByText('Avisos activos en este dispositivo.');
  expect(device.subscribe).toHaveBeenCalledExactlyOnceWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([255]) });
  expect(device.fetch).toHaveBeenCalledWith(basePath, expect.objectContaining({ method: 'PUT', body: JSON.stringify({ endpoint: device.created.endpoint, keys, daysBefore: 1 }) }));

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Días de anticipación' }), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar anticipación' }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Guardar anticipación' }) as HTMLButtonElement).disabled).toBe(true));
  expect(device.fetch).toHaveBeenLastCalledWith(basePath, expect.objectContaining({ method: 'PUT', body: JSON.stringify({ endpoint: device.created.endpoint, keys, daysBefore: 5 }) }));
  expect(device.subscribe).toHaveBeenCalledTimes(1);

  view.unmount();
  render(createElement(RecurringReminders));
  const days = await screen.findByRole('spinbutton', { name: 'Días de anticipación' }) as HTMLInputElement;
  expect(days.value).toBe('5');
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar avisos' }));
  await screen.findByText('Avisos desactivados en este dispositivo.');
  expect(device.fetch).toHaveBeenLastCalledWith(basePath, expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ endpoint: device.created.endpoint }) }));
  expect(device.created.unsubscribe).toHaveBeenCalledTimes(1);
});

it('recovers from an existing push endpoint bound to another account only after explicit enable', async () => {
  const device = mockAndroid();
  device.setPermission('granted');
  const old = device.previousSubscription();
  device.fetch
    .mockResolvedValueOnce(Response.json({ publicKey }))
    .mockResolvedValueOnce(Response.json(null))
    .mockResolvedValueOnce(Response.json({ error: 'Este navegador ya está suscripto a otra cuenta.' }, { status: 409 }));
  render(createElement(RecurringReminders));
  const enable = await screen.findByRole('button', { name: 'Activar avisos' });
  expect(old.unsubscribe).not.toHaveBeenCalled();
  fireEvent.click(enable);
  await screen.findByText('Avisos activos en este dispositivo.');
  expect(old.unsubscribe).toHaveBeenCalledTimes(1);
  expect(device.subscribe).toHaveBeenCalledTimes(1);
  expect(device.fetch).toHaveBeenLastCalledWith(basePath, expect.objectContaining({ method: 'PUT', body: JSON.stringify({ endpoint: device.created.endpoint, keys, daysBefore: 1 }) }));
});

it('shows how to re-enable a denied browser permission without creating a server enrollment', async () => {
  const device = mockAndroid();
  device.subscribe.mockImplementationOnce(async () => {
    device.setPermission('denied');
    throw new DOMException('Blocked', 'NotAllowedError');
  });
  render(createElement(RecurringReminders));
  fireEvent.click(await screen.findByRole('button', { name: 'Activar avisos' }));
  await screen.findByText('Habilitá las notificaciones de Track-It desde los permisos del navegador.');
  expect(screen.queryByRole('button', { name: 'Activar avisos' })).toBeNull();
  expect(device.fetch).toHaveBeenCalledTimes(1);
});

it('handles missing server configuration without asking for notification permission', async () => {
  const device = mockAndroid();
  device.setConfigured(false);
  render(createElement(RecurringReminders));
  await screen.findByText('Los avisos todavía no están disponibles en este servidor.');
  expect(device.getSubscription).not.toHaveBeenCalled();
  expect(device.subscribe).not.toHaveBeenCalled();
});

it('does not show the Android preferences on other devices', () => {
  const device = mockAndroid('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0');
  render(createElement(RecurringReminders));
  expect(screen.queryByRole('heading', { name: 'Avisos de recurrentes' })).toBeNull();
  expect(device.fetch).not.toHaveBeenCalled();
});

it('clears the device subscription and open reminders after sign-out', async () => {
  const device = mockAndroid();
  const old = device.previousSubscription();
  const reminder = { tag: 'recurring-2026-11-18', close: vi.fn() };
  const other = { tag: 'other', close: vi.fn() };
  device.getNotifications.mockResolvedValue([reminder, other]);
  await clearLocalPushOnSignOut();
  expect(old.unsubscribe).toHaveBeenCalledTimes(1);
  expect(reminder.close).toHaveBeenCalledTimes(1);
  expect(other.close).not.toHaveBeenCalled();
});
