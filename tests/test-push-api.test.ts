import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import webPush from 'web-push';
import type { app as Application } from '../server/app';
import type { db as Database, client as DatabaseClient } from '../server/db/client';
import { pushReminderDeliveries, pushSubscriptions } from '../server/db/schema';

const origin = 'https://push.example.com';
const path = '/api/notifications/test';
const keyPair = createECDH('prime256v1');
const publicKey = keyPair.generateKeys().toString('base64url');
const privateKey = Buffer.from(keyPair.getPrivateKey().toString('hex').padStart(64, '0'), 'hex').toString('base64url');
const keys = {
  p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
  auth: randomBytes(16).toString('base64url'),
};
const successfulEndpoint = 'https://fcm.googleapis.com/fcm/send/TestAccepted';
const expiredEndpoint = 'https://fcm.googleapis.com/fcm/send/TestExpired';
const failedEndpoint = 'https://updates.push.services.mozilla.com/wpush/v2/TestFailed';
const payload = { kind: 'test', title: 'Prueba de Track-It', body: 'Esta es una notificación de prueba.' };
const accepted = { statusCode: 201, body: '', headers: {} };

let app: typeof Application, db: typeof Database, client: typeof DatabaseClient;
let admin: { cookie: string; id: string }, firstCookie: string, secondCookie: string;

async function request(path: string, cookie: string, method = 'GET', input?: unknown, requestOrigin = origin) {
  return app.request(path, {
    method,
    headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
}

async function signUp(username: string) {
  const response = await request('/api/auth/sign-up/email', '', 'POST', {
    username, email: `${username}@example.com`, name: username, password: 'PushTestPassword!',
  });
  expect(response.status).toBe(200);
  const { user } = await response.json();
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  return { cookie, id: user.id as string };
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
  vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', '');
  ({ db, client } = await import('../server/db/client'));
  await (await import('../server/migrate')).migrateDatabase();
  await client.execute('PRAGMA foreign_keys = ON');
  ({ app } = await import('../server/app'));
  admin = await signUp('push_admin');
  firstCookie = (await signUp('push_first')).cookie;
  secondCookie = (await signUp('push_second')).cookie;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('VAPID_PRIVATE_KEY', privateKey);
  vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', '');
});

afterAll(() => {
  client?.close();
  vi.unstubAllEnvs();
});

describe('envío global de notificaciones de prueba', () => {
  it('reserva el envío a la identidad habilitada con VAPID válido y origen autorizado', async () => {
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue(accepted);
    expect((await request(path, '')).status).toBe(401);
    expect((await request(path, '', 'POST')).status).toBe(401);
    expect(await (await request(path, admin.cookie)).json()).toEqual({ enabled: false });
    expect((await request(path, admin.cookie, 'POST')).status).toBe(403);

    vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', 'push_admin');
    expect(await (await request(path, admin.cookie)).json()).toEqual({ enabled: false });
    expect((await request(path, admin.cookie, 'POST')).status).toBe(403);

    vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', admin.id);
    const config = await request(path, admin.cookie);
    expect(config.headers.get('Cache-Control')).toBe('no-store');
    expect(await config.json()).toEqual({ enabled: true });
    expect(await (await request(path, firstCookie)).json()).toEqual({ enabled: false });
    expect((await request(path, firstCookie, 'POST', { userId: admin.id })).status).toBe(403);
    expect((await request(path, admin.cookie, 'POST', undefined, 'https://otro.example')).status).toBe(403);

    vi.stubEnv('VAPID_PRIVATE_KEY', 'inválida');
    expect(await (await request(path, admin.cookie)).json()).toEqual({ enabled: false });
    expect((await request(path, admin.cookie, 'POST')).status).toBe(403);
    expect(send).toHaveBeenCalledTimes(0);
  });

  it('envía la prueba a todos los suscriptos y conserva el historial de envíos programados', async () => {
    vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', admin.id);
    for (const [endpoint, cookie] of [
      [successfulEndpoint, firstCookie], [expiredEndpoint, firstCookie], [failedEndpoint, secondCookie],
    ]) {
      const response = await request('/api/notifications/subscription', cookie, 'PUT', { endpoint, keys, daysBefore: 1 });
      expect(response.status).toBe(200);
    }
    const before = await db.select().from(pushSubscriptions);
    const successful = before.find(({ endpoint }) => endpoint === successfulEndpoint)!;
    const delivery = { subscriptionId: successful.id, dueDate: '2026-11-18', leaseUntil: 1, sentAt: 1 };
    await db.insert(pushReminderDeliveries).values(delivery);

    const send = vi.spyOn(webPush, 'sendNotification').mockImplementation(async ({ endpoint }) => {
      if (endpoint === expiredEndpoint) throw Object.assign(new Error('Expirada'), { statusCode: 410 });
      if (endpoint === failedEndpoint) throw Object.assign(new Error('Fallo temporal'), { statusCode: 500 });
      return accepted;
    });

    const response = await request(path, admin.cookie, 'POST');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, expired: 1, failed: 1 });
    expect(send.mock.calls.map(([target]) => target.endpoint).sort())
      .toEqual([successfulEndpoint, expiredEndpoint, failedEndpoint].sort());
    for (const [target, message] of send.mock.calls) {
      expect(target.keys).toEqual(keys);
      expect(JSON.parse(String(message))).toEqual(payload);
    }
    expect(await db.select().from(pushReminderDeliveries)).toEqual([delivery]);
    expect((await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)).map(({ endpoint }) => endpoint).sort())
      .toEqual([successfulEndpoint, failedEndpoint].sort());
  });
});
