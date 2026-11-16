import { useEffect, useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { disablePushSettings, isAndroidDevice, readPushSettings, savePushSettings, supportsWebPush, type PushSettings } from '../lib/push-notifications';

export function RecurringReminders() {
  return isAndroidDevice() ? <AndroidReminders /> : null;
}

function AndroidReminders() {
  const supported = supportsWebPush();
  const [settings, setSettings] = useState<PushSettings | null>();
  const [daysBefore, setDaysBefore] = useState('1');
  const [permission, setPermission] = useState(() => supported ? Notification.permission : 'default');
  const [busy, setBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supported) return;
    let active = true;
    readPushSettings().then((next) => {
      if (!active) return;
      setSettings(next);
      if (next?.preferences) setDaysBefore(String(next.preferences.daysBefore));
    }).catch((reason: Error) => { if (active) setLoadError(reason.message); });
    return () => { active = false; };
  }, [supported, loadAttempt]);

  useEffect(() => {
    if (!supported) return;
    const readPermission = () => {
      const next = Notification.permission;
      if (!busy && permission === 'denied' && next !== 'denied') setLoadAttempt((attempt) => attempt + 1);
      setPermission(next);
    };
    window.addEventListener('focus', readPermission);
    document.addEventListener('visibilitychange', readPermission);
    return () => {
      window.removeEventListener('focus', readPermission);
      document.removeEventListener('visibilitychange', readPermission);
    };
  }, [supported, busy, permission]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = Number(daysBefore);
    if (!settings || busy || !Number.isInteger(days) || days < 1 || days > 30) return;
    setBusy(true);
    setError('');
    try {
      const preferences = await savePushSettings(settings, days);
      setSettings({ ...settings, preferences });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setPermission(Notification.permission);
      setBusy(false);
    }
  }

  async function disable() {
    if (!settings || busy) return;
    setBusy(true);
    setError('');
    try {
      await disablePushSettings(settings);
      setSettings({ ...settings, preferences: null });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blocked = permission === 'denied';
  const preferences = settings?.preferences;
  return <section className="settings-card" aria-labelledby="android-reminders-title">
    <div>
      <h2 id="android-reminders-title">Avisos en Android</h2>
      <p className="muted small">Recibí avisos de débitos recurrentes y cierres de tarjetas en este dispositivo, a partir de las 09:00 (hora argentina).</p>
    </div>
    {!supported && <p className="muted small">Abrí Track-It desde una conexión HTTPS en un navegador Android compatible.</p>}
    {supported && !loadError && settings === undefined && <p className="muted small" role="status">Consultando notificaciones…</p>}
    {settings === null && <p className="muted small">Los avisos todavía no están disponibles en este servidor.</p>}
    {loadError && <div className="grid w-full justify-items-start gap-3">
      <p className="form-error" role="alert">{loadError}</p>
      <Button type="button" variant="outline" onClick={() => { setLoadError(''); setLoadAttempt((attempt) => attempt + 1); }}>Reintentar</Button>
    </div>}
    {settings && <form className="grid w-full gap-3" onSubmit={save}>
      {blocked ? <p className="muted small" role="status">Habilitá las notificaciones de Track-It desde los permisos del navegador.</p> : <>
        <p className="muted small" role="status">{preferences ? 'Avisos activos en este dispositivo.' : 'Avisos desactivados en este dispositivo.'}</p>
        <label className="field max-w-40">Días de anticipación
          <input type="number" inputMode="numeric" min="1" max="30" step="1" required value={daysBefore} disabled={busy} onChange={(event) => setDaysBefore(event.target.value)} />
        </label>
      </>}
      <div className="inline-actions">
        {!blocked && <Button type="submit" disabled={busy || Number(daysBefore) === preferences?.daysBefore}>{preferences ? 'Guardar anticipación' : 'Activar avisos'}</Button>}
        {preferences && <Button type="button" variant="outline" disabled={busy} onClick={disable}>Desactivar avisos</Button>}
      </div>
      {error && (!blocked || preferences) && <p className="form-error" role="alert">{error}</p>}
    </form>}
  </section>;
}
