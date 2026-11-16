// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TestPushNotifications } from '../src/components/TestPushNotifications';

const path = '/api/notifications/test';
const buttonName = 'Enviar notificación de prueba';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('oculta el botón si el servidor no autoriza la prueba', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ enabled: false }));
  vi.stubGlobal('fetch', fetch);
  await act(async () => { render(createElement(TestPushNotifications)); });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(path, expect.objectContaining({ credentials: 'same-origin' }));
  expect(screen.queryByRole('button', { name: buttonName })).toBeNull();
});

it('envía la prueba global desde la PC con un solo clic y muestra el resultado', async () => {
  let complete!: (response: Response) => void;
  const delivery = new Promise<Response>((resolve) => { complete = resolve; });
  const fetch = vi.fn(async (_url: string, init: RequestInit) =>
    init.method === 'POST' ? delivery : Response.json({ enabled: true }));
  vi.stubGlobal('fetch', fetch);
  render(createElement(TestPushNotifications));
  const button = await screen.findByRole('button', { name: buttonName });
  expect(screen.getByText(/todos los dispositivos suscriptos, incluidos los de otras cuentas/)).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);

  fireEvent.click(button);
  expect(button).toHaveProperty('disabled', true);
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith(path, expect.objectContaining({ method: 'POST' }));

  complete(Response.json({ sent: 2, expired: 1, failed: 3 }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Aviso aceptado para 2 dispositivos. 1 suscripción vencida. 3 envíos fallidos.');
  expect(button).toHaveProperty('disabled', false);
});

it('informa cuando todavía no hay dispositivos suscriptos', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ sent: 0, expired: 0, failed: 0 }));
  vi.stubGlobal('fetch', fetch);
  render(createElement(TestPushNotifications));
  fireEvent.click(await screen.findByRole('button', { name: buttonName }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'No hay dispositivos suscriptos.');
});
