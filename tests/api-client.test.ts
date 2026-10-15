import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());
it('rejects an unreadable successful response as unconfirmed instead of reporting a saved legacy response', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('<html>proxy error</html>', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(api('/expenses?sync=1', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('preserves conflict status and never retries a failed financial write', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'Changed elsewhere', code: 'conflict' }, { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  await expect(api('/expenses/id', { method: 'PUT', body: '{}' })).rejects.toMatchObject({ status: 409, code: 'conflict' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('propagates aborted requests without converting them to a retry notice', async () => {
  const controller = new AbortController(); controller.abort();
  const reason = new DOMException('Aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(reason));
  await expect(api('/bootstrap', { signal: controller.signal })).rejects.toBe(reason);
});
