import { redirect, type ShouldRevalidateFunctionArgs } from 'react-router-dom';
import type { AuthUser } from '../../shared/auth';
import type { Snapshot } from '../../shared/domain';
import { today } from '../../shared/format';
import { api, ApiError } from './api';

export function selectedMonth(url: URL) {
  return url.searchParams.get('mes') || today().slice(0, 7);
}

export async function loadFinance({ request }: { request: Request }) {
  try {
    const result = await api<{ data: Snapshot; user: AuthUser }>(
      `/bootstrap?month=${encodeURIComponent(selectedMonth(new URL(request.url)))}`,
      { signal: request.signal },
    );
    return { ...result, loadedAt: Date.now() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect('/acceso');
    throw error;
  }
}

export function shouldReloadFinance({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod.toUpperCase() !== 'GET') return true;
  if (selectedMonth(currentUrl) !== selectedMonth(nextUrl)) return true;
  // Todas las secciones comparten el mismo snapshot. Guardar o pulsar actualizar
  // sigue revalidando; cambiar de sección o filtros no vuelve a descargarlo.
  if (currentUrl.pathname !== nextUrl.pathname || currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
}
