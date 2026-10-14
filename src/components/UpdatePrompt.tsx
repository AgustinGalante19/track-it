import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/button';
import { getUpdateBlocked, subscribeUpdateSafety } from '../lib/update-safety';
import { getDialogCount, subscribeDialogs } from '../lib/interaction-state';
import { createUpdateActivation, createUpdateChecker } from '../lib/pwa-update';
export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW: (_url, value) => setRegistration(value),
  });
  const layoutBlocked = useSyncExternalStore(subscribeUpdateSafety, getUpdateBlocked);
  const dialogs = useSyncExternalStore(subscribeDialogs, getDialogCount);
  const blocked = layoutBlocked || dialogs > 0;
  const [deferred, setDeferred] = useState(false), [error, setError] = useState('');
  const update = useRef(updateServiceWorker); update.current = updateServiceWorker;
  const [activation] = useState(() => createUpdateActivation(() => update.current(true)));
  useEffect(() => {
    if (!registration) return;
    const check = createUpdateChecker(() => registration.update());
    const listener = () => { void check(document.visibilityState === 'visible', navigator.onLine); };
    window.addEventListener('focus', listener);
    document.addEventListener('visibilitychange', listener);
    return () => { window.removeEventListener('focus', listener); document.removeEventListener('visibilitychange', listener); };
  }, [registration]);
  useEffect(() => { void activation.flush(blocked).catch((reason: Error) => { setError(reason.message); setDeferred(false); }); }, [activation, blocked]);
  if (!needRefresh) return null;
  return <aside className="update-notice" role="status"><p>{error || (deferred ? 'La app se actualizará cuando termines y cierres el formulario.' : 'Hay una actualización disponible. Guardá el formulario antes de recargar.')}</p><div className="inline-actions"><Button variant="ghost" size="sm" onClick={() => { activation.cancel(); setDeferred(false); setNeedRefresh(false); }}>Más tarde</Button><Button size="sm" disabled={deferred} onClick={() => { setError(''); setDeferred(blocked); void activation.request(blocked).catch((reason: Error) => { setError(reason.message); setDeferred(false); }); }}>Actualizar app</Button></div></aside>;
}
