import { createECDH, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { app as Application } from '../server/app';
import type { db as Database, client as DatabaseClient } from '../server/db/client';
import { pushReminderDeliveries, pushSubscriptions, session } from '../server/db/schema';

const origin = 'https://push.example.com';
const endpoint = 'https://fcm.googleapis.com/fcm/send/ExampleToken:123';
const keyPair = createECDH('prime256v1');
const publicKey = keyPair.generateKeys().toString('base64url');
const privateKey = Buffer.from(keyPair.getPrivateKey().toString('hex').padStart(64, '0'), 'hex').toString('base64url');
const keys = {
  p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
  auth: randomBytes(16).toString('base64url'),
};

let app: typeof Application, db: typeof Database, client: typeof DatabaseClient;
let ownerCookie: string, otherCookie: string;

async function request(path: string, cookie: string, method = 'GET', input?: unknown, requestOrigin = origin) {
  return app.request(`/api${path}`, {
    method,
    headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
}

async function signUp(username: string) {
  const response = await request('/auth/sign-up/email', '', 'POST', {
    username, email: `${username}@example.com`, name: username, password: 'PushRemindersTest!',
  });
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATABASE_AUTH_TOKEN', '');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'SecretoExclusivoDePruebasSinUsoReal2026');
  vi.stubEnv('BETTER_AUTH_API_KEY', '');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:push@example.com');
  vi.stubEnv('VAPID_PUBLIC_KEY', publicKey);
  vi.stubEnv('VAPID_PRIVATE_KEY', privateKey);
  ({ db, client } = await import('../server/db/client'));
  await (await import('../server/migrate')).migrateDatabase();
  await client.execute('PRAGMA foreign_keys = ON');
  ({ app } = await import('../server/app'));
  ownerCookie = await signUp('push_owner');
  otherCookie = await signUp('push_other');
});

afterAll(() => {
  client?.close();
  vi.unstubAllEnvs();
});

describe('suscripciones de notificaciones', () => {
  it('entrega la clave pública únicamente a sesiones autenticadas y avisa si falta la configuración', async () => {
    expect((await request('/notifications/config', '')).status).toBe(401);
    const response = await request('/notifications/config', ownerCookie);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ publicKey });

    vi.stubEnv('VAPID_PRIVATE_KEY', 'invalida');
    try {
      expect(await (await request('/notifications/config', ownerCookie)).json()).toEqual({ publicKey: null });
      expect((await request('/notifications/subscription', ownerCookie, 'PUT', { endpoint, keys, daysBefore: 1 })).status).toBe(503);
    } finally {
      vi.stubEnv('VAPID_PRIVATE_KEY', privateKey);
    }
  });

  it('valida proveedor, claves, origen y anticipación', async () => {
    for (const invalidEndpoint of [
      'http://fcm.googleapis.com/fcm/send/Token',
      'https://fcm.googleapis.com.ejemplo.com/fcm/send/Token',
      'https://fcm.googleapis.com:8080/fcm/send/Token',
      'https://fcm.googleapis.com/fcm/send/Token?redirect=1',
      'https://127.0.0.1/fcm/send/Token',
      `${endpoint}\n`,
    ]) {
      const response = await request('/notifications/subscription', ownerCookie, 'PUT', { endpoint: invalidEndpoint, keys, daysBefore: 1 });
      expect(response.status).toBe(400);
    }
    expect((await request('/notifications/subscription', ownerCookie, 'PUT', { endpoint, keys, daysBefore: 0 })).status).toBe(400);
    const badKeys = { ...keys, p256dh: Buffer.alloc(65, 4).toString('base64url') };
    expect((await request('/notifications/subscription', ownerCookie, 'PUT', { endpoint, keys: badKeys, daysBefore: 1 })).status).toBe(400);
    expect((await request('/notifications/subscription', ownerCookie, 'PUT', { endpoint, keys, daysBefore: 1 }, 'https://otro.example')).status).toBe(403);
    expect(await db.select().from(pushSubscriptions)).toEqual([]);
  });

  it('aísla suscripciones entre usuarios, conserva entregas al editar y elimina al cerrar sesión', async () => {
    const status = (cookie: string) => request('/notifications/subscription/status', cookie, 'POST', { endpoint }).then((r) => r.json());
    const save = (cookie: string, daysBefore: number) => request('/notifications/subscription', cookie, 'PUT', { endpoint, keys, daysBefore });
    const remove = (cookie: string) => request('/notifications/subscription', cookie, 'DELETE', { endpoint });
    expect(await status(ownerCookie)).toBeNull();
    expect(await (await save(ownerCookie, 1)).json()).toEqual({ daysBefore: 1 });
    const [subscription] = await db.select().from(pushSubscriptions);
    await db.insert(pushReminderDeliveries).values({ subscriptionId: subscription.id, dueDate: '2026-11-18', leaseUntil: 1, sentAt: 1 });

    expect(await status(otherCookie)).toBeNull();
    expect((await save(otherCookie, 2)).status).toBe(409);
    expect((await remove(otherCookie)).status).toBe(200);
    expect(await status(ownerCookie)).toEqual({ daysBefore: 1 });
    expect(await (await save(ownerCookie, 3)).json()).toEqual({ daysBefore: 3 });
    expect(await db.select().from(pushReminderDeliveries)).toHaveLength(1);
    expect(await status(ownerCookie)).toEqual({ daysBefore: 3 });

    expect((await request('/auth/sign-out', ownerCookie, 'POST', undefined, 'https://otro.example')).status).toBe(403);
    expect(await status(ownerCookie)).toEqual({ daysBefore: 3 });
    expect((await request('/auth/sign-out', ownerCookie, 'POST')).status).toBe(200);
    expect(await db.select().from(pushSubscriptions)).toEqual([]);
    expect(await db.select().from(pushReminderDeliveries)).toEqual([]);
  });

  it('conserva el permiso cuando vence una sesión y permite desactivarlo en la siguiente', async () => {
    const browser = 'https://updates.push.services.mozilla.com/wpush/v2/ExampleToken';
    expect((await request('/notifications/subscription', otherCookie, 'PUT', { endpoint: browser, keys, daysBefore: 1 })).status).toBe(200);
    const [subscription] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, browser));
    await db.delete(session).where(eq(session.id, subscription.sessionId));
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, browser))).toHaveLength(1);

    const login = await request('/auth/sign-in/username', '', 'POST', { username: 'push_other', password: 'PushRemindersTest!' });
    expect(login.status).toBe(200);
    const nextCookie = login.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
    const status = await request('/notifications/subscription/status', nextCookie, 'POST', { endpoint: browser });
    expect(await status.json()).toEqual({ daysBefore: 1 });
    expect((await request('/notifications/subscription', nextCookie, 'DELETE', { endpoint: browser })).status).toBe(200);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, browser))).toEqual([]);
  });
});
