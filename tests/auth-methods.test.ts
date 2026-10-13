import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { today } from '../shared/domain';
import type { client as Client } from '../server/db/client';

const origin = 'https://auth-test.ngrok-free.dev';
const ownerEmail = 'propietario@example.com', username = 'propietario', password = 'SoloPruebas2026!';
const googleClientId = 'cliente-ficticio.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'google-test', alg: 'RS256', use: 'sig' };
let client: typeof Client;
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
  throw new Error(`Solicitud externa inesperada en las pruebas: ${new URL(url).pathname}`);
});
function token(email = ownerEmail, verified = true) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'google-test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: googleClientId, sub: `google-${email}`, email, email_verified: verified, name: 'Persona de prueba', iat: issuedAt, exp: issuedAt + 300 })).toString('base64url');
  const message = `${header}.${payload}`;
  return `${message}.${sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64url')}`;
}
function cookie(response: Response) { return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; '); }
beforeEach(() => {
  vi.resetModules(); fetchMock.mockClear();
  vi.stubEnv('DATABASE_URL', ':memory:'); vi.stubEnv('DATABASE_AUTH_TOKEN', '');
  vi.stubEnv('OWNER_EMAIL', ownerEmail); vi.stubEnv('OWNER_USERNAME', username);
  vi.stubEnv('BETTER_AUTH_URL', origin); vi.stubEnv('BETTER_AUTH_SECRET', 'SecretoDePruebasDeAutenticacion2026');
  vi.stubEnv('BETTER_AUTH_API_KEY', ''); vi.stubEnv('GOOGLE_CLIENT_ID', googleClientId); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'SecretoFicticioSoloDePruebas');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { client?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup(existing = true, production = false) {
  const database = await import('../server/db/client'); client = database.client;
  const { migrateDatabase } = await import('../server/migrate'); await migrateDatabase();
  // Usa SQLite en memoria; ejercita la configuración productiva de auth y API sin una base remota.
  if (production) vi.stubEnv('NODE_ENV', 'production');
  const { auth, createAuth } = await import('../server/auth');
  const { app } = await import('../server/app');
  let ownerId = '', ownerCookie = '';
  if (existing) {
    const response = await createAuth(true).api.signUpEmail({ body: { email: `${username}@legacy.invalid`, username, password, name: 'Mi cuenta anterior' }, asResponse: true });
    expect(response.status).toBe(200); ownerCookie = cookie(response); ownerId = (await response.json()).user.id;
    const { user } = await import('../server/db/schema');
    await database.db.update(user).set({ username: null }).where(eq(user.id, ownerId));
    await migrateDatabase();
    expect((await app.request(`${origin}/api/accounts`, { method: 'POST', headers: { Cookie: ownerCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), name: 'Mi banco', type: 'bank', currency: 'ARS', emoji: '🏦' }) })).status).toBe(201);
  }
  function request(path: string, input?: unknown, session = '') {
    return app.request(`${origin}/api${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  }
  return { ...database, app, auth, ownerId, ownerCookie, request };
}

describe('Usuario y Google con acceso público y datos privados', () => {
  it('migra una cuenta anterior y permite ingresar por usuario conservando sus datos', async () => {
    const { request, ownerId } = await setup();
    const response = await request('/auth/sign-in/username', { username: 'PROPIETARIO', password });
    expect(response.status).toBe(200); expect((await response.json()).user.id).toBe(ownerId);
    const data = await (await request('/snapshot', undefined, cookie(response))).json();
    expect(data.accounts[0].name).toBe('Mi banco'); expect(data.accounts[0]).toMatchObject({ name: 'Mi banco', currency: 'ARS' });
    expect((await request('/auth/sign-in/username', { username, password: 'Incorrecta2026!' })).status).toBe(401);
  });
  it('permite registro público aunque queden variables del antiguo propietario', async () => {
    const { request } = await setup();
    expect(await (await request('/config')).json()).toEqual({ signupEnabled: true, demoEnabled: false, googleEnabled: true, authOrigin: origin });
    const response = await request('/auth/sign-up/email', { email: ownerEmail, username: 'intruso', password, name: 'Otro' });
    expect(response.status).toBe(200);
  });
  it('inicia OAuth con el callback correcto, selección de cuenta, state y PKCE', async () => {
    const { request } = await setup(false);
    const response = await request('/auth/sign-in/social', { provider: 'google', callbackURL: '/', errorCallbackURL: '/acceso', disableRedirect: true });
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/google`);
    expect(url.searchParams.get('prompt')).toBe('select_account'); expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy(); expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('crea un espacio independiente sin vincular implícitamente una cuenta local', async () => {
    const { request, db } = await setup();
    const response = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token() } });
    expect(response.status).toBe(200);
    expect((await (await request('/snapshot', undefined, cookie(response))).json()).accounts).toHaveLength(0);
    const { user } = await import('../server/db/schema'); expect(await db.select().from(user)).toHaveLength(2);
  });
  it('conecta Google a la cuenta autenticada y conserva IDs y cuentas al volver a entrar', async () => {
    const { request, ownerCookie, ownerId } = await setup();
    const link = await request('/auth/link-social', { provider: 'google', idToken: { token: token() } }, ownerCookie);
    expect(link.status).toBe(200);
    const response = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token() } });
    expect(response.status).toBe(200); expect((await response.json()).user.id).toBe(ownerId);
    expect((await (await request('/snapshot', undefined, cookie(response))).json()).accounts[0].name).toBe('Mi banco');
  });
  it('rechaza emails de Google sin verificar antes de crear usuarios', async () => {
    const { request, db } = await setup(false);
    for (const [email, verified, code] of [['ajeno@example.com', false, 'email_not_verified'], [ownerEmail, false, 'email_not_verified']] as const) {
      const response = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token(email, verified) } });
      expect(response.status).toBe(403); expect((await response.json()).code).toBe(code);
    }
    const { user } = await import('../server/db/schema'); expect(await db.select().from(user)).toHaveLength(0);
  });
  it.each([true, false])('aísla dos cuentas de Google en producción (configuración anterior: %s)', async (legacyOwner) => {
    if (!legacyOwner) { vi.stubEnv('OWNER_EMAIL', ''); vi.stubEnv('OWNER_USERNAME', ''); }
    const { request, app } = await setup(false, true);
    const sessions: string[] = [], users: string[] = [];
    for (const email of [ownerEmail, 'otra-persona@example.com']) {
      const login = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token(email) } });
      expect(login.status).toBe(200); sessions.push(cookie(login)); users.push((await login.json()).user.id);
    }
    expect(users[0]).not.toBe(users[1]);
    const accountId = randomUUID(), movementId = randomUUID();
    expect((await request('/accounts', { id: accountId, name: 'Privada', type: 'bank', currency: 'ARS', emoji: '🏦' }, sessions[0])).status).toBe(201);
    const expense = { id: movementId, accountId, concept: 'Compra privada', amount: 1000, date: today(), category: 'General', emoji: '🛒', notes: '' };
    expect((await request('/expenses', expense, sessions[0])).status).toBe(201);
    const other = await (await request('/snapshot', undefined, sessions[1])).json();
    expect(other.accounts).toHaveLength(0); expect(other.movements).toHaveLength(0);
    expect((await request(`/accounts/${accountId}/history`, undefined, sessions[1])).status).toBe(404);
    expect((await request('/expenses', { ...expense, id: randomUUID() }, sessions[1])).status).toBe(404);
    expect((await request(`/movements/${movementId}/void`, { version: 1 }, sessions[1])).status).toBe(409);
    expect((await app.request(`${origin}/api/expenses/${movementId}`, { method: 'PUT', headers: { Cookie: sessions[1], Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...expense, version: 1 }) })).status).toBe(409);
    const own = await (await request('/snapshot', undefined, sessions[0])).json();
    expect(own.movements).toHaveLength(1); expect(own.movements[0].voided).toBe(false);
    const returning = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token('otra-persona@example.com') } });
    expect(returning.status).toBe(200); expect((await returning.json()).user.id).toBe(users[1]);
    expect((await (await request('/snapshot', undefined, cookie(returning))).json()).accounts).toHaveLength(0);
    expect((await request('/demo', {})).status).toBe(403);
  });
  it('permite que la primera cuenta de Google agregue usuario y contraseña al mismo espacio', async () => {
    const { request, app } = await setup(false);
    const google = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token() } });
    expect(google.status).toBe(200); const googleUser = (await google.json()).user; const googleCookie = cookie(google);
    expect((await request('/auth/update-user', { username }, googleCookie)).status).toBe(200);
    expect((await app.request(`${origin}/api/password`, { method: 'POST', headers: { Cookie: googleCookie, Origin: 'https://ajeno.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: password }) })).status).toBe(403);
    expect((await request('/password', { newPassword: password }, googleCookie)).status).toBe(200);
    const local = await request('/auth/sign-in/username', { username, password });
    expect(local.status).toBe(200); expect((await local.json()).user.id).toBe(googleUser.id);
  });
  it('exige una sesión reciente para agregar una contraseña a una cuenta de Google', async () => {
    const { request } = await setup(false);
    const google = await request('/auth/sign-in/social', { provider: 'google', idToken: { token: token() } });
    expect(google.status).toBe(200); const identity = (await google.json()).user;
    await client.execute({ sql: 'UPDATE session SET created_at = ? WHERE user_id = ?', args: [Date.now() - 48 * 60 * 60 * 1000, identity.id] });
    expect((await request('/password', { newPassword: password }, cookie(google))).status).toBe(403);
  });
  it('no permite reemplazar una contraseña existente ni configurarla sin sesión', async () => {
    const { request, ownerCookie } = await setup();
    expect((await request('/password', { newPassword: 'OtraClave2026!' })).status).toBe(401);
    expect((await request('/password', { newPassword: 'OtraClave2026!' }, ownerCookie)).status).toBe(400);
    expect((await request('/auth/sign-in/username', { username, password })).status).toBe(200);
  });
});
