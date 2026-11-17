import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import webPush from 'web-push';
import type { app as Application } from '../server/app';
import type { db as Database, client as DatabaseClient } from '../server/db/client';
import { pushReminderDeliveries, pushSubscriptions } from '../server/db/schema';

const origin = 'https://push.example.com';
const path = '/api/notifications/test';
const historyPath = '/api/notifications/history';
const receiptPath = '/api/notifications/receipt';
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
    expect((await request(historyPath, '')).status).toBe(401);
    expect((await request(path, '', 'POST')).status).toBe(401);
    expect(await (await request(path, admin.cookie)).json()).toEqual({ enabled: false });
    expect((await request(path, admin.cookie, 'POST')).status).toBe(403);

    vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', 'push_admin');
    expect(await (await request(path, admin.cookie)).json()).toEqual({ enabled: false });
    expect((await request(path, admin.cookie, 'POST')).status).toBe(403);

    vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', admin.id);
    const config = await request(path, admin.cookie);
    expect(config.headers.get('Cache-Control')).toBe('no-store');
    expect(await config.json()).toEqual({ enabled: true, historyEnabled: true });
    expect(await (await request(path, firstCookie)).json()).toEqual({ enabled: false });
    expect((await request(historyPath, firstCookie)).status).toBe(403);
    expect((await request(`${historyPath}?before=invalid`, admin.cookie)).status).toBe(400);
    expect((await request(path, firstCookie, 'POST', { userId: admin.id })).status).toBe(403);
    expect((await request(path, admin.cookie, 'POST', undefined, 'https://otro.example')).status).toBe(403);

    vi.stubEnv('VAPID_PRIVATE_KEY', 'inválida');
    expect(await (await request(path, admin.cookie)).json()).toEqual({ enabled: false, historyEnabled: true });
    expect((await request(historyPath, admin.cookie)).status).toBe(200);
    expect((await request(path, admin.cookie, 'POST')).status).toBe(403);
    expect(send).toHaveBeenCalledTimes(0);
  });

  it('envía la prueba a todos los suscriptos y conserva el historial de envíos programados', async () => {
    vi.stubEnv('PUSH_TEST_ADMIN_USER_ID', admin.id);
    let device: string | undefined;
    for (const [endpoint, cookie] of [
      [successfulEndpoint, firstCookie], [expiredEndpoint, firstCookie], [failedEndpoint, secondCookie],
    ]) {
      const response = await request('/api/notifications/subscription', cookie, 'PUT', { endpoint, keys, daysBefore: 1 });
      expect(response.status).toBe(200);
      if (endpoint === successfulEndpoint) ({ device } = await response.json());
    }
    const before = await db.select().from(pushSubscriptions);
    const successful = before.find(({ endpoint }) => endpoint === successfulEndpoint)!;
    const delivery = { subscriptionId: successful.id, dueDate: '2026-11-18', leaseUntil: 1, sentAt: 1, kind: 'recurring' as const };
    await db.insert(pushReminderDeliveries).values(delivery);

    const send = vi.spyOn(webPush, 'sendNotification').mockImplementation(async ({ endpoint }, message) => {
      if (endpoint === expiredEndpoint) throw Object.assign(new Error('Expirada'), { statusCode: 410 });
      if (endpoint === failedEndpoint) throw Object.assign(new Error('Fallo temporal'), { statusCode: 500 });
      const { receiptToken } = JSON.parse(String(message));
      expect((await request(receiptPath, '', 'POST', { token: `${receiptToken.slice(0, -1)}!`, status: 'shown' })).status).toBe(403);
      expect((await request(receiptPath, '', 'POST', { token: receiptToken, status: 'shown' })).status).toBe(204);
      return accepted;
    });

    const response = await request(path, admin.cookie, 'POST');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, expired: 1, failed: 1 });
    expect(send.mock.calls.map(([target]) => target.endpoint).sort())
      .toEqual([successfulEndpoint, expiredEndpoint, failedEndpoint].sort());
    for (const [target, message, options] of send.mock.calls) {
      expect(target.keys).toEqual(keys);
      expect(JSON.parse(String(message))).toEqual({ ...payload, dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), receiptToken: expect.any(String) });
      expect(options).toMatchObject({ topic: 'track-it-test', urgency: 'high' });
    }
    expect(await db.select().from(pushReminderDeliveries)).toEqual([{ ...delivery, kind: 'recurring' }]);
    expect((await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions)).map(({ endpoint }) => endpoint).sort())
      .toEqual([successfulEndpoint, failedEndpoint].sort());

    const history = await request(historyPath, admin.cookie);
    expect(history.headers.get('Cache-Control')).toBe('no-store');
    const log = await history.json();
    expect(log.runs[0]).toMatchObject({
      source: 'test', status: 'completed', deliveryCount: 3, counts: { sent: 1, expired: 1, failed: 1, skipped: 0 },
      deliveries: expect.arrayContaining([
        expect.objectContaining({ device, kind: 'test', status: 'sent', provider: 'fcm', httpStatus: 201, receipt: 'shown', receiptAt: expect.any(String) }),
        expect.objectContaining({ kind: 'test', status: 'expired', provider: 'fcm', httpStatus: 410, receipt: null }),
        expect.objectContaining({ kind: 'test', status: 'failed', provider: 'mozilla', httpStatus: 500, receipt: null }),
      ]),
    });
    const serialized = JSON.stringify(log);
    for (const secret of [successfulEndpoint, keys.auth, keys.p256dh]) expect(serialized.includes(secret)).toBe(false);
  });
});
