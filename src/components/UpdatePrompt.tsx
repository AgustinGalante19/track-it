import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/button';
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <aside className="update-notice" role="status"><p>Hay una actualización disponible. Guardá el formulario antes de recargar.</p><div className="inline-actions"><Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>Más tarde</Button><Button size="sm" onClick={() => void updateServiceWorker(true)}>Actualizar app</Button></div></aside>;
}
