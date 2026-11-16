import { createECDH, ECDH, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client';
import { pushSubscriptions, session } from './db/schema';
import { DomainError } from './service';

const endpoint = z.string().max(2048).refine((value) => value === value.trim() && (
  /^https:\/\/fcm\.googleapis\.com\/fcm\/send\/[A-Za-z0-9_:-]+$/.test(value) ||
  /^https:\/\/updates\.push\.services\.mozilla\.com\/wpush\/v[12]\/[A-Za-z0-9_=-]+$/.test(value)),
  'El servicio de notificaciones de este navegador no es compatible.',
);
export const pushEndpointInput = z.object({ endpoint });

function isBase64Url(value: string, bytes: number) {
  if (value.length !== Math.ceil(bytes * 4 / 3)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === bytes && decoded.toString('base64url') === value;
}

function isPublicKey(value: string) {
  if (!isBase64Url(value, 65)) return false;
  const key = Buffer.from(value, 'base64url');
  if (key[0] !== 4) return false;
  try {
    ECDH.convertKey(key, 'prime256v1');
    return true;
  } catch {
    return false;
  }
}

export const pushSubscriptionInput = pushEndpointInput.extend({
  keys: z.object({
    p256dh: z.string().refine(isPublicKey, 'La clave pública del dispositivo no es válida.'),
    auth: z.string().refine((value) => isBase64Url(value, 16), 'La clave de autenticación del dispositivo no es válida.'),
  }),
  daysBefore: z.number().int().min(1).max(30),
});

function isVapidSubject(value: string) {
  if (value.startsWith('mailto:')) return z.email().safeParse(value.slice(7)).success;
  const url = URL.parse(value);
  return url?.protocol === 'https:' && !url.username && !url.password;
}

export function getPushConfig() {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey || !isVapidSubject(subject) || !isPublicKey(publicKey) || !isBase64Url(privateKey, 32)) return null;
  try {
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (key.getPublicKey().toString('base64url') !== publicKey) return null;
    return { subject, publicKey, privateKey };
  } catch {
    return null;
  }
}

export async function pushSubscriptionStatus(db: Database, userId: string, endpoint: string) {
  const [subscription] = await db.select({ daysBefore: pushSubscriptions.daysBefore }).from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  return subscription ?? null;
}

export async function savePushSubscription(db: Database, userId: string, sessionId: string, input: z.infer<typeof pushSubscriptionInput>) {
  const { endpoint, daysBefore, keys } = input;
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ id: session.id }).from(session)
      .where(and(eq(session.id, sessionId), eq(session.userId, userId), gt(session.expiresAt, new Date())));
    if (!current) throw new DomainError('Tu sesión venció. Volvé a ingresar.', 401);

    const [subscription] = await tx.insert(pushSubscriptions)
      .values({ id: randomUUID(), userId, sessionId, endpoint, ...keys, daysBefore })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { sessionId, ...keys, daysBefore },
        setWhere: eq(pushSubscriptions.userId, userId),
      })
      .returning({ daysBefore: pushSubscriptions.daysBefore });
    if (!subscription) throw new DomainError('Este navegador ya está suscripto a otra cuenta.', 409);
    return subscription;
  });
}

export async function removePushSubscription(db: Database, userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function removeSessionPushSubscriptions(db: Database, userId: string, sessionId: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.sessionId, sessionId)));
}
