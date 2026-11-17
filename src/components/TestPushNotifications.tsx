import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Button } from './ui/button';

const path = '/notifications/test';
type TestResult = { sent: number; expired: number; failed: number };
type NotificationAccess = { enabled: boolean; historyEnabled?: boolean };
type Delivery = {
  at: string;
  kind: 'recurring' | 'card-closing' | 'test';
  status: 'pending' | 'sent' | 'expired' | 'failed' | 'skipped';
  device: string;
  provider: 'fcm' | 'mozilla' | 'other';
  httpStatus: number | null;
  receipt: 'shown' | 'display-failed' | null;
  receiptAt: string | null;
};
type Run = {
  id: string;
  source: 'scheduler' | 'cron' | 'test';
  status: 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string | null;
  reason: string | null;
  counts: TestResult & { skipped: number };
  deliveryCount: number;
  deliveries: Delivery[];
};
type HistoryPage = { runs: Run[]; nextCursor: string | null };

const dateTime = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires',
});
const runStatus = { running: 'En curso', completed: 'Completado', failed: 'Fallido', skipped: 'Omitido' };
const runSource = { scheduler: 'Programado desde el servidor', cron: 'Programado desde cron', test: 'Prueba manual' };
const reasons: Record<string, string> = {
  'before-window': 'Todavía no era el horario de envío.',
  'no-due': 'No había avisos previstos para ese momento.',
  'no-devices': 'No había dispositivos suscriptos.',
  'vapid-unavailable': 'La configuración de Web Push no estaba disponible.',
  'run-error': 'El envío se interrumpió por un error del servidor.',
};
const providerName = { fcm: 'Google FCM', mozilla: 'Mozilla Web Push', other: 'Web Push' };
const deliveryStatus = { pending: 'En curso', sent: 'Aceptada', expired: 'Suscripción vencida', failed: 'Fallida', skipped: 'Omitida' };
const deliveryKind = { recurring: 'Recurrentes', 'card-closing': 'Cierre de tarjeta', test: 'Prueba' };
const receiptStatus = { shown: 'Mostrada en el teléfono', 'display-failed': 'Error al mostrar en el teléfono' };

function describeResult({ sent, expired, failed }: TestResult) {
  if (sent + expired + failed === 0) return 'No hay dispositivos suscriptos.';
  const accepted = `Aviso aceptado para ${sent} ${sent === 1 ? 'dispositivo' : 'dispositivos'}.`;
  const inactive = expired ? ` ${expired} ${expired === 1 ? 'suscripción vencida' : 'suscripciones vencidas'}.` : '';
  const errors = failed ? ` ${failed} ${failed === 1 ? 'envío fallido' : 'envíos fallidos'}.` : '';
  return `${accepted}${inactive}${errors}`;
}

export function TestPushNotifications() {
  const [access, setAccess] = useState<NotificationAccess>({ enabled: false });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [testAttempts, setTestAttempts] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function checkAvailability() {
      try {
        const availability = await api<NotificationAccess>(path, { signal: controller.signal });
        if (!controller.signal.aborted && availability) setAccess(availability);
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
      setTestAttempts((attempts) => attempts + 1);
      setBusy(false);
    }
  }

  return <>
    {access.enabled && <section className="settings-card" aria-labelledby="test-notifications-title">
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
    </section>}
    {(access.historyEnabled ?? access.enabled) && <NotificationHistory testAttempts={testAttempts} />}
  </>;
}

function NotificationHistory({ testAttempts }: { testAttempts: number }) {
  const [history, setHistory] = useState<HistoryPage>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (before?: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const query = before ? `?${new URLSearchParams({ before })}` : '';
      const page = await api<HistoryPage>(`/notifications/history${query}`, { signal: controller.signal, cache: 'no-store' });
      if (controller.signal.aborted) return;
      setHistory((previous) => before && previous ? { ...page, runs: [...previous.runs, ...page.runs] } : page);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) setHistory(undefined);
      setError('No pudimos cargar el historial de notificaciones.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    return () => activeRequest.current?.abort();
  }, [loadHistory, testAttempts]);

  const nextCursor = history?.nextCursor;
  return <section className="settings-card" aria-labelledby="notification-history-title" aria-busy={loading}>
    <div>
      <h2 id="notification-history-title">Historial de notificaciones</h2>
      <p className="muted small">Hora argentina. El proveedor push confirma la aceptación. El navegador informa si mostró el aviso en el teléfono.</p>
    </div>
    <Button type="button" variant="outline" onClick={() => void loadHistory()} disabled={loading}>Actualizar historial</Button>
    {loading && !history && <p className="muted small w-full">Cargando historial…</p>}
    {error && <p className="form-error w-full" role="alert">{error}</p>}
    {history?.runs.length === 0 && <p className="muted small w-full">Todavía no hay envíos registrados.</p>}
    {!!history?.runs.length && <div className="grid w-full gap-2">
      {history.runs.map((run) => <RunDetails key={run.id} run={run} />)}
    </div>}
    {nextCursor && <Button type="button" variant="outline" onClick={() => void loadHistory(nextCursor)} disabled={loading}>Ver envíos anteriores</Button>}
  </section>;
}

function RunDetails({ run }: { run: Run }) {
  const { sent, expired, failed, skipped } = run.counts;
  return <details className="min-w-0 rounded-lg border border-[var(--line)] p-3">
    <summary className="cursor-pointer">
      <strong>{runSource[run.source]}</strong>
      <span className="muted small"> · {runStatus[run.status]} · <time dateTime={run.startedAt}>{dateTime.format(new Date(run.startedAt))}</time></span>
      <span className="muted small mt-1 block">Aceptadas {sent} · Vencidas {expired} · Fallidas {failed} · Omitidas {skipped}</span>
    </summary>
    <div className="mt-3 grid gap-2">
      {run.finishedAt && <p className="muted small">Fin del envío · <time dateTime={run.finishedAt}>{dateTime.format(new Date(run.finishedAt))}</time></p>}
      {run.reason && <p className="muted small">{reasons[run.reason] ?? 'Motivo no disponible.'}</p>}
      {run.deliveryCount > run.deliveries.length && <p className="muted small">{run.deliveries.length} de {run.deliveryCount} intentos recientes.</p>}
      {run.deliveries.length > 0 ? <ul className="grid gap-2">
        {run.deliveries.map((delivery, index) => <li className="small grid gap-1 border-t border-[var(--line)] pt-2" key={`${delivery.device}-${delivery.at}-${index}`}>
          <div className="flex flex-wrap justify-between gap-x-3">
            <span><strong>{deliveryKind[delivery.kind]}</strong> · {deliveryStatus[delivery.status]}</span>
            <time className="muted" dateTime={delivery.at}>{dateTime.format(new Date(delivery.at))}</time>
          </div>
          <span className="muted break-all">{providerName[delivery.provider]} · Dispositivo {delivery.device}{delivery.httpStatus !== null && ` · HTTP ${delivery.httpStatus}`}</span>
          {delivery.receipt ? <span>{receiptStatus[delivery.receipt]}{delivery.receiptAt && <> · <time dateTime={delivery.receiptAt}>{dateTime.format(new Date(delivery.receiptAt))}</time></>}</span>
            : delivery.status === 'sent' && <span className="muted">Confirmación del dispositivo pendiente.</span>}
        </li>)}
      </ul> : <p className="muted small">Sin intentos por dispositivo.</p>}
    </div>
  </details>;
}
