import { api } from './api';
import { financeStore, type FinanceTransport } from './finance-store';

export function createFinanceTransport(): FinanceTransport {
  return {
    bootstrap: ({ month, signal }) => api(`/bootstrap?month=${encodeURIComponent(month)}`, { signal, cache: 'no-store' }),
    history: ({ accountId, signal }) => api(`/accounts/${encodeURIComponent(accountId)}/history`, { signal, cache: 'no-store' }),
    mutation: ({ path, method = 'POST', body, month, responseMode, signal }) => {
      const url = new URL(path, 'http://finance.internal');
      if (responseMode !== 'full-refresh') { url.searchParams.set('sync', '1'); url.searchParams.set('month', month); }
      return api(`${url.pathname}${url.search}`, { method, body: JSON.stringify(body), signal, cache: 'no-store' });
    },
  };
}
financeStore.setTransport(createFinanceTransport());
export { financeStore };
