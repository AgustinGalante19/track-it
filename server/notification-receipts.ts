import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const notificationReceiptInput = z.object({
  token: z.string().length(80),
  status: z.enum(['shown', 'display-failed']),
});

function receiptSignature(id: string, secret: string) {
  return createHmac('sha256', secret).update('track-it:push-receipt:v1:').update(id).digest('base64url');
}

export function createReceiptToken(id: string, secret: string) {
  return `${id}.${receiptSignature(id, secret)}`;
}

export function verifyReceiptToken(token: string, secret: string) {
  const [id, signature] = token.split('.');
  if (!z.uuid().safeParse(id).success || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(receiptSignature(id, secret))) ? id : null;
}
