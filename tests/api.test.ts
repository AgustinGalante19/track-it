import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { app as Application } from '../server/app';
import type { client as Client } from '../server/db/client';
import { today, type Snapshot } from '../shared/domain';

let app: typeof Application, client: typeof Client;
let ownerCookie = '', otherCookie = '', accountId = '';
const origin = 'https://gastos-test.ngrok-free.dev';
function request(path: string, cookie = ownerCookie, method = 'GET', input?: unknown, requestOrigin = origin) {
  return app.request(`/api${path}`, { method, headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
}
async function signUp(email: string) {
  const response = await request('/auth/sign-up/email', '', 'POST', { email, username: email.split('@')[0], name: 'Persona de prueba', password: 'PruebaLocal2026!' });
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const cookies = response.headers.getSetCookie();
  expect(cookies.some((cookie) => /HttpOnly/i.test(cookie))).toBe(true);
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:'); vi.stubEnv('DATABASE_AUTH_TOKEN', '');
  vi.stubEnv('OWNER_EMAIL', ''); vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('OWNER_USERNAME', ''); vi.stubEnv('GOOGLE_CLIENT_ID', ''); vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
  vi.stubEnv('BETTER_AUTH_API_KEY', '');
  vi.stubEnv('BETTER_AUTH_SECRET', 'SecretoExclusivoDePruebasSinUsoReal2026');
  ({ client } = await import('../server/db/client'));
  await (await import('../server/migrate')).migrateDatabase();
  await client.execute('PRAGMA foreign_keys = ON');
  ({ app } = await import('../server/app'));
  ownerCookie = await signUp('uno@example.com'); otherCookie = await signUp('dos@example.com');
});
afterAll(() => { client?.close(); vi.unstubAllEnvs(); });

describe('API autenticada con SQLite real', () => {
  it('arranca con una sola validación de sesión y datos privados sin caché', async () => {
    const { auth } = await import('../server/auth');
    const session = vi.spyOn(auth.api, 'getSession');
    try {
      const response = await request('/bootstrap');
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(session).toHaveBeenCalledOnce();
      const result = await response.json();
      expect(result.user).toMatchObject({ name: 'Persona de prueba', username: 'uno' });
      expect(result).not.toHaveProperty('session');
      expect(result.data.accounts).toEqual([]);
      expect(result.userId).toBeTruthy();
      const other = await (await request('/bootstrap', otherCookie)).json();
      expect(other.userId).toBeTruthy();
      expect(other.userId).not.toBe(result.userId);
      expect(other.data.accounts).toEqual([]);
      expect(response.headers.get('Server-Timing')).toMatch(/total;dur=\d+\.\d+/);
      expect(response.headers.get('Server-Timing')).toContain('snapshot;dur=');
      expect((await request('/bootstrap', '')).status).toBe(401);
      expect((await request('/bootstrap?month=1999-12')).status).toBe(400);
      expect((await request('/bootstrap?month=inválido')).status).toBe(400);
    } finally { session.mockRestore(); }
  });
  it('gestiona categorías privadas por identificador y valida presupuestos y conflictos', async () => {
    const input = { name: 'Vacaciones', emoji: '🏖️', budgetArs: 100000, budgetUsd: 25000 };
    const created = await request('/categories', ownerCookie, 'POST', input);
    expect(created.status).toBe(201);
    expect(created.headers.get('Cache-Control')).toBe('no-store');
    expect(created.headers.get('Server-Timing')).toMatch(/db;dur=\d+\.\d+/);
    const category = await created.json();
    const conflict = await request('/categories', ownerCookie, 'POST', input);
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get('Cache-Control')).toBe('no-store');
    expect(conflict.headers.get('Server-Timing')).toMatch(/total;dur=\d+\.\d+/);
    expect((await request('/categories', ownerCookie, 'POST', { ...input, name: 'Inválida', budgetArs: -1 })).status).toBe(400);
    expect((await request(`/categories/${category.id}`, otherCookie, 'PATCH', { ...input, version: 1 })).status).toBe(404);
    expect((await request(`/categories/${category.id}`, otherCookie, 'DELETE', { version: 1 })).status).toBe(404);
    const edited = await request(`/categories/${category.id}`, ownerCookie, 'PATCH', { ...input, name: 'Viajes', version: 1 });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ id: category.id, name: 'Viajes', version: 2 });
    expect((await request(`/categories/${category.id}`, ownerCookie, 'DELETE', { version: 1 })).status).toBe(409);
    expect((await request(`/categories/${category.id}`, ownerCookie, 'DELETE', { version: 2 })).status).toBe(200);
    const snapshot = await (await request(`/snapshot?month=${today().slice(0, 7)}`)).json() as Snapshot;
    expect(snapshot.categories.some((c) => c.id === category.id)).toBe(false);
  });

  it('exige una sesión y excluye respuestas privadas de la caché', async () => {
    const response = await request('/snapshot', '');
    expect(response.status).toBe(401); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Server-Timing')).toMatch(/total;dur=\d+\.\d+/);
  });
  it('persiste una cuenta y un gasto; reintentar no duplica el movimiento', async () => {
    accountId = randomUUID();
    const account = { id: accountId, name: 'Banco', type: 'bank', currency: 'ARS', emoji: '🏦' };
    expect((await request('/accounts', ownerCookie, 'POST', account)).status).toBe(201);
    const expense = { id: randomUUID(), accountId, concept: 'Compra', amount: 250050, date: today(), category: 'General', emoji: '🛒', notes: '' };
    expect((await request('/expenses', ownerCookie, 'POST', expense)).status).toBe(201);
    expect((await request('/expenses', ownerCookie, 'POST', expense)).status).toBe(201);
    const response = await request('/snapshot'); const data = await response.json() as Snapshot;
    expect(data.movements).toHaveLength(1); expect(data.accounts[0]).not.toHaveProperty('balance');
    const own = await (await request('/bootstrap')).json();
    const other = await (await request('/bootstrap', otherCookie)).json();
    expect(own.data.movements).toHaveLength(1);
    expect(other.user.username).toBe('dos');
    expect(other.data.movements).toEqual([]);
    expect(other.data.accounts).toEqual([]);
  });
  it('rechaza importes fraccionarios y escritura desde otro origen', async () => {
    const input = { id: randomUUID(), accountId, concept: 'Inválida', amount: 1.1, date: today(), category: 'General', emoji: '🛒', notes: '' };
    expect((await request('/expenses', ownerCookie, 'POST', input)).status).toBe(400);
    expect((await request('/expenses', ownerCookie, 'POST', { ...input, amount: 100 }, 'https://ajeno.example')).status).toBe(403);
    expect(((await (await request('/snapshot')).json()) as Snapshot).movements).toHaveLength(1);
  });
  it('valida y persiste el color personalizado de las cuentas', async () => {
    const input = { id: randomUUID(), name: 'Color de prueba', type: 'bank', currency: 'ARS', emoji: '🏦', color: '#abc123' };
    expect((await request('/accounts', ownerCookie, 'POST', { ...input, color: 'red' })).status).toBe(400);
    const created = await request('/accounts', ownerCookie, 'POST', input);
    expect(created.status).toBe(201);
    const account = await created.json();
    expect(account.color).toBe('#abc123');
    const patch = { name: input.name, emoji: input.emoji, archived: false, version: account.version, color: '#ffffff' };
    expect((await request(`/accounts/${input.id}`, otherCookie, 'PATCH', patch)).status).toBe(404);
    expect((await request(`/accounts/${input.id}`, ownerCookie, 'PATCH', { ...patch, color: '#fff' })).status).toBe(400);
    const edited = await (await request(`/accounts/${input.id}`, ownerCookie, 'PATCH', patch)).json();
    expect(edited.color).toBe('#ffffff');
    const automatic = await (await request(`/accounts/${input.id}`, ownerCookie, 'PATCH', { ...patch, version: edited.version, color: null })).json();
    expect(automatic.color).toBeNull();
    expect((await request(`/accounts/${input.id}`, ownerCookie, 'DELETE', { version: automatic.version })).status).toBe(200);
  });
  it('aísla datos e historial entre dos sesiones', async () => {
    const data = await (await request('/snapshot', otherCookie)).json() as Snapshot;
    expect(data.accounts).toHaveLength(0); expect(data.movements).toHaveLength(0);
    expect((await request(`/accounts/${accountId}/history`, otherCookie)).status).toBe(404);
  });
  it('retira la creación y edición de transferencias de la API', async () => {
    const before = await (await request('/snapshot')).json();
    expect((await request('/transfers', ownerCookie, 'POST', {})).status).toBe(404);
    expect((await request(`/transfers/${randomUUID()}`, ownerCookie, 'PUT', {})).status).toBe(404);
    const after = await (await request('/snapshot')).json();
    expect(after).toEqual(before);
  });
  it('elimina recurrentes por API con sesión, origen, propietario y versión válidos', async () => {
    const input = { id: randomUUID(), name: 'Streaming', kind: 'subscription', accountId, amount: 1000, dueDay: 1, startDate: `${today().slice(0, 7)}-01`, emoji: '📺', category: 'Servicios' };
    expect((await request('/recurring', ownerCookie, 'POST', input)).status).toBe(201);
    await request('/snapshot');
    const path = `/recurring/${input.id}`;
    expect((await request(path, '', 'DELETE', { version: 1 })).status).toBe(401);
    expect((await request(path, ownerCookie, 'DELETE', { version: 1 }, 'https://ajeno.example')).status).toBe(403);
    expect((await request(path, otherCookie, 'DELETE', { version: 1 })).status).toBe(404);
    expect((await request(path, ownerCookie, 'DELETE', { version: 0 })).status).toBe(400);
    expect((await request(path, ownerCookie, 'DELETE', { version: 2 })).status).toBe(409);
    expect((await request(path, ownerCookie, 'DELETE', { version: 1 })).status).toBe(200);
    expect((await request(path, ownerCookie, 'DELETE', { version: 1 })).status).toBe(200);
    expect((await request(path, ownerCookie, 'PUT', { ...input, active: true, version: 2 })).status).toBe(404);
    const data = await (await request('/snapshot')).json() as Snapshot;
    expect(data.recurring).toHaveLength(0); expect(data.occurrences).toHaveLength(0);
    expect(data.accounts[0]).not.toHaveProperty('balance'); expect(data.movements).toHaveLength(1);
  });
  it('restaura un respaldo por API conservando sesión y movimientos', async () => {
    const backup = await (await request('/backup')).json();
    expect((await request('/backup/restore', ownerCookie, 'POST', backup)).status).toBe(200);
    const data = await (await request('/snapshot')).json() as Snapshot;
    expect(data.accounts[0]).not.toHaveProperty('balance'); expect(data.movements).toHaveLength(1);
    expect(data.accounts[0].id).not.toBe(accountId);
  });
  it('invalida la sesión en el servidor al salir', async () => {
    expect((await request('/auth/sign-out', ownerCookie, 'POST', {})).status).toBe(200);
    expect((await request('/snapshot')).status).toBe(401);
  });
  it('crea usuarios locales sin usar el email enviado y normaliza el login', async () => {
    await client.execute('DELETE FROM rate_limit'); // Aísla este flujo del límite de registro de las otras pruebas.
    const input = { username: 'Nueva.Persona', email: 'correo-ajeno@example.com', name: 'Persona', password: 'NuevaClave2026!' };
    const registration = await request('/auth/sign-up/email', '', 'POST', input);
    expect(registration.status).toBe(200);
    const registered = (await registration.json()).user;
    expect(registered.email).toMatch(/@cuentas\.invalid$/); expect(registered.email).not.toBe(input.email); expect(registered.username).toBe('nueva.persona');
    const login = await request('/auth/sign-in/username', '', 'POST', { username: 'NUEVA.PERSONA', password: input.password });
    expect(login.status).toBe(200); expect((await login.json()).user.id).toBe(registered.id);
    expect((await request('/auth/sign-up/email', '', 'POST', { ...input, username: 'NUEVA.PERSONA' })).status).toBe(400);
  });
});
