import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Button } from './ui/button';

const path = '/notifications/test';
type TestResult = { sent: number; expired: number; failed: number };

function describeResult({ sent, expired, failed }: TestResult) {
  if (sent + expired + failed === 0) return 'No hay dispositivos suscriptos.';
  const accepted = `Aviso aceptado para ${sent} ${sent === 1 ? 'dispositivo' : 'dispositivos'}.`;
  const inactive = expired ? ` ${expired} ${expired === 1 ? 'suscripción vencida' : 'suscripciones vencidas'}.` : '';
  const errors = failed ? ` ${failed} ${failed === 1 ? 'envío fallido' : 'envíos fallidos'}.` : '';
  return `${accepted}${inactive}${errors}`;
}

export function TestPushNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function checkAvailability() {
      try {
        const availability = await api<{ enabled: boolean }>(path, { signal: controller.signal });
        if (!controller.signal.aborted) setEnabled(availability.enabled);
      } catch {
        // Only show the control when the server confirms access.
      }
    }
    void checkAvailability();
    return () => controller.abort();
  }, []);

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      setResult(await api<TestResult>(path, { method: 'POST' }));
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status > 0 ? reason.message : 'No pudimos confirmar el resultado del envío.');
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;
  return <section className="settings-card" aria-labelledby="test-notifications-title">
    <div>
      <h2 id="test-notifications-title">Notificación de prueba</h2>
      <p className="muted small">Envía un aviso de prueba a todos los dispositivos suscriptos, incluidos los de otras cuentas.</p>
    </div>
    <div className="grid justify-items-start gap-3">
      <Button type="button" variant="outline" disabled={busy} onClick={sendTest}>
        {busy ? 'Enviando…' : 'Enviar notificación de prueba'}
      </Button>
      {result && <p className="muted small" role="status">{describeResult(result)}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>;
}
