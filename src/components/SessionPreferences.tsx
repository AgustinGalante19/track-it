import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from './ui/button';
import { GoogleIcon } from './GoogleIcon';
import { useFinance } from '../context';
import { api, ApiError, send } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, usernameSchema, type AuthConfig } from '../../shared/auth';

export function SessionPreferences() {
  const { user, theme, setTheme, signOut, notify, refresh } = useFinance();
  const [params] = useSearchParams();
  const [signingOut, setSigningOut] = useState(false), [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<{ googleEnabled: boolean; googleLinked: boolean; passwordEnabled: boolean } | null>(null);
  const [error, setError] = useState(() => params.has('error') ? authErrorMessage(params.get('error') || '', 'No pudimos conectar Google. Volvé a intentarlo.') : '');
  useEffect(() => {
    Promise.all([api<AuthConfig>('/config'), authClient.listAccounts()]).then(([config, accounts]) => {
      if (accounts.error) throw new Error('No pudimos consultar tus formas de acceso.');
      setAccess({ googleEnabled: config.googleEnabled, googleLinked: !!accounts.data?.some((account) => account.providerId === 'google'), passwordEnabled: !!accounts.data?.some((account) => account.providerId === 'credential') });
    }).catch(() => setError('No pudimos consultar tus formas de acceso. Recargá la página para volver a intentar.'));
  }, []);

  async function linkGoogle() {
    setBusy(true); setError('');
    try {
      const result = await authClient.linkSocial({ provider: 'google', callbackURL: '/ajustes', errorCallbackURL: '/ajustes' });
      if (result.error) throw new Error(authErrorMessage(result.error.code, 'No pudimos conectar Google. Volvé a intentarlo.'));
    } catch (error) { setError((error as Error).message); setBusy(false); }
  }
  async function enablePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget);
    try {
      const parsed = usernameSchema.safeParse(values.get('username'));
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (!user.username) {
        const result = await authClient.updateUser({ username: parsed.data });
        if (result.error) throw new Error(authErrorMessage(result.error.code, 'No pudimos guardar tu usuario.'));
      }
      await send('/password', { newPassword: String(values.get('password')) });
      setAccess((previous) => previous ? { ...previous, passwordEnabled: true } : previous);
      notify('Listo. También podés ingresar con tu usuario y contraseña.');
    } catch (error) { setError(error instanceof ApiError ? authErrorMessage(error.code, 'No pudimos habilitar la contraseña. Volvé a ingresar con Google e intentá de nuevo.') : (error as Error).message); }
    finally { refresh(); setBusy(false); }
  }
  return <section className="settings-card">
    <div><h2>{user.name}</h2><p className="muted small">{user.username ? `@${user.username} · ` : ''}Espacio personal</p></div>
    <Button variant="outline" disabled={signingOut || busy} onClick={async () => {
      setSigningOut(true);
      try { await signOut(); } catch (error) { notify((error as Error).message); setSigningOut(false); }
    }}>{signingOut ? 'Cerrando…' : 'Cerrar sesión'}</Button>
    <label className="field">Apariencia<select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="system">Según el dispositivo</option><option value="light">Clara</option><option value="dark">Oscura</option></select></label>
    {access && <div className="access-preferences">
      <div><h3>Formas de acceso</h3><p className="muted small">{access.passwordEnabled ? 'Usuario y contraseña habilitados.' : 'Podés agregar un usuario y contraseña como alternativa.'}</p></div>
      {access.googleEnabled && (access.googleLinked ? <span className="connected-provider"><GoogleIcon />Google conectado</span> : <Button variant="outline" disabled={busy || signingOut} onClick={linkGoogle}><GoogleIcon />Conectar Google</Button>)}
      {!access.passwordEnabled && <details className="local-access"><summary>Habilitar usuario y contraseña</summary><form className="form-stack" onSubmit={enablePassword}>
        <label className="field">Usuario<input name="username" defaultValue={user.username || ''} readOnly={!!user.username} required autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={30} placeholder="tu_usuario" disabled={busy} /></label>
        <label className="field">Nueva contraseña<input name="password" type="password" required autoComplete="new-password" minLength={10} maxLength={128} placeholder="Al menos 10 caracteres" disabled={busy} /></label>
        <Button type="submit" disabled={busy || signingOut}>{busy ? 'Guardando…' : 'Habilitar acceso'}</Button>
      </form></details>}
    </div>}
    {error && <p className="form-error access-error" role="alert">{error}</p>}
  </section>;
}
