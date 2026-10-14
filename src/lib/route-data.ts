import { redirect, type ShouldRevalidateFunctionArgs } from 'react-router-dom';
import { today } from '../../shared/format';
import { ApiError } from './api';
import { financeStore } from './finance-client';

export function selectedMonth(url: URL) {
  return url.searchParams.get('mes') || today().slice(0, 7);
}

export async function loadFinance({ request }: { request: Request }) {
  try {
    const result = await financeStore.load({ month: selectedMonth(new URL(request.url)), signal: request.signal });
    return { ...result, loadedAt: result.lastFullReadAt };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect('/acceso');
    if (financeStore.getState().data && !request.signal.aborted) return { ...financeStore.getState(), loadedAt: financeStore.getState().lastFullReadAt };
    throw error;
  }
}
export async function loadAccountHistory({ params, request }: { params: { id?: string }; request: Request }) {
  await loadFinance({ request });
  try { return await financeStore.loadHistory({ accountId: params.id!, signal: request.signal }); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect('/acceso');
    if (financeStore.getState().data) return [];
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
