// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUTO_REFRESH_INTERVAL, useAutoRefresh } from '../src/lib/use-auto-refresh';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function resume() {
  act(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(200);
  });
}

it('no descarga datos otra vez al recuperar el foco inmediatamente', () => {
  const refresh = vi.fn();
  const loadedAt = Date.now(), setOnline = vi.fn();
  renderHook(() => useAutoRefresh({ loadedAt, blocked: false, refresh, setOnline }));
  resume();
  expect(refresh).not.toHaveBeenCalled();
});

it('agrupa foco y visibilidad en una sola actualización al regresar después de un minuto', () => {
  const refresh = vi.fn(), loadedAt = Date.now(), setOnline = vi.fn();
  renderHook(() => useAutoRefresh({ loadedAt, blocked: false, refresh, setOnline }));
  act(() => vi.advanceTimersByTime(AUTO_REFRESH_INTERVAL));
  resume();
  expect(refresh).toHaveBeenCalledOnce();
  resume();
  expect(refresh).toHaveBeenCalledOnce();
});

it('pospone la reconexión mientras hay un formulario o navegación pendiente', () => {
  const refresh = vi.fn(), setOnline = vi.fn(), loadedAt = Date.now();
  const view = renderHook(({ blocked }) => useAutoRefresh({ loadedAt, blocked, refresh, setOnline }), { initialProps: { blocked: true } });
  act(() => {
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(200);
  });
  expect(setOnline).toHaveBeenCalledWith(true);
  expect(refresh).not.toHaveBeenCalled();
  view.rerender({ blocked: false });
  act(() => vi.advanceTimersByTime(200));
  expect(refresh).toHaveBeenCalledOnce();
});

it('no actualiza sin conexión ni en segundo plano y elimina los listeners al desmontar', () => {
  const refresh = vi.fn(), loadedAt = Date.now() - AUTO_REFRESH_INTERVAL, setOnline = vi.fn();
  const view = renderHook(() => useAutoRefresh({ loadedAt, blocked: false, refresh, setOnline }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  resume();
  expect(refresh).not.toHaveBeenCalled();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  resume();
  expect(refresh).not.toHaveBeenCalled();
  view.unmount();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  resume();
  expect(refresh).not.toHaveBeenCalled();
});
