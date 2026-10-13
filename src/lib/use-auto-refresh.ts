import { useEffect, useRef } from 'react';

export const AUTO_REFRESH_INTERVAL = 60_000;

export function useAutoRefresh({ loadedAt, blocked, refresh, setOnline }: {
  loadedAt: number;
  blocked: boolean;
  refresh: () => void;
  setOnline: (online: boolean) => void;
}) {
  const lastAttempt = useRef(0);
  const reconnectPending = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (blocked || !navigator.onLine || document.visibilityState !== 'visible') return;
        if (Date.now() - lastAttempt.current < 1_000) return;
        if (!reconnectPending.current && Date.now() - loadedAt < AUTO_REFRESH_INTERVAL) return;
        reconnectPending.current = false;
        lastAttempt.current = Date.now();
        refresh();
      }, 150);
    };
    const reconnect = () => {
      setOnline(true);
      reconnectPending.current = true;
      schedule();
    };
    const disconnect = () => setOnline(false);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    if (reconnectPending.current) schedule();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [loadedAt, blocked, refresh, setOnline]);
}
