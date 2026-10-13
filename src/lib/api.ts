export class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } }); }
  catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError('No pudimos confirmar la operación. Revisá tu conexión y reintentá; el mismo envío no se duplicará.', 0);
  }
  const data = await response.json().catch((error) => {
    if (init.signal?.aborted) throw error;
    return { error: 'El servidor no devolvió una respuesta válida.' };
  });
  if (!response.ok) throw new ApiError(data.error || data.message || 'No pudimos completar la operación.', response.status, data.code);
  return data as T;
}
export const send = <T = unknown>(path: string, body: unknown, method = 'POST') => api<T>(path, { method, body: JSON.stringify(body) });
