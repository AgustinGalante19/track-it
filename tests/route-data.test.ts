import { createMemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { loadFinance, shouldReloadFinance } from '../src/lib/route-data';

vi.mock('../src/lib/api', async (original) => ({ ...await original<typeof import('../src/lib/api')>(), api: vi.fn() }));
afterEach(() => { vi.mocked(api).mockReset(); vi.unstubAllGlobals(); });

it('carga sesión y datos con una sola solicitud cancelable', async () => {
  const value = { data: { accounts: [] }, user: { name: 'Persona' } };
  vi.mocked(api).mockResolvedValue(value);
  const request = new Request('https://track.test/?mes=2026-10');
  const result = await loadFinance({ request });
  expect(api).toHaveBeenCalledExactlyOnceWith('/bootstrap?month=2026-10', { signal: request.signal });
  expect(result).toMatchObject(value);
  expect(result.loadedAt).toBeGreaterThan(0);
});

it('redirige al acceso si la sesión venció y conserva otros errores', async () => {
  const args = { request: new Request('https://track.test/') };
  vi.mocked(api).mockRejectedValueOnce(new ApiError('Sesión vencida', 401));
  await expect(loadFinance(args)).rejects.toMatchObject({ status: 302, headers: expect.any(Headers) });
  const error = new ApiError('Sin conexión', 0);
  vi.mocked(api).mockRejectedValueOnce(error);
  await expect(loadFinance(args)).rejects.toBe(error);
});

it('cancela solicitudes al abandonar una navegación sin convertirlas en errores de conexión', async () => {
  const { api: actualApi } = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api');
  const controller = new AbortController();
  const error = new DOMException('Navegación cancelada', 'AbortError');
  controller.abort();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
  await expect(actualApi('/bootstrap', { signal: controller.signal })).rejects.toBe(error);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(error) }));
  await expect(actualApi('/bootstrap', { signal: controller.signal })).rejects.toBe(error);
});

it('reutiliza datos entre secciones, pero actualiza al cambiar de mes o guardar', async () => {
  const loader = vi.fn(() => ({}));
  const router = createMemoryRouter([{
    path: '/', loader, shouldRevalidate: shouldReloadFinance,
    children: [{ index: true }, { path: 'cuentas' }, { path: 'recurrentes' }],
  }], { initialEntries: ['/?mes=2026-10'] });
  try {
    await vi.waitFor(() => expect(router.state.initialized).toBe(true));
    expect(loader).toHaveBeenCalledTimes(1);
    await router.navigate('/cuentas?mes=2026-10');
    await router.navigate('/recurrentes?mes=2026-10&filtro=pendientes');
    expect(loader).toHaveBeenCalledTimes(1);
    await router.navigate('/recurrentes?mes=2026-11');
    expect(loader).toHaveBeenCalledTimes(2);
    await router.revalidate();
    expect(loader).toHaveBeenCalledTimes(3);
    await router.navigate('/?mes=2026-11');
    expect(loader).toHaveBeenCalledTimes(3);
  } finally { router.dispose(); }
});
