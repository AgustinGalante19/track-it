import { api, ApiError, send } from './api';

export type ReminderPreferences = { daysBefore: number; device?: string };

export type PushSettings = {
  publicKey: string;
  registration: ServiceWorkerRegistration;
  preferences: ReminderPreferences | null;
};

const subscriptionPath = '/notifications/subscription';

export function isAndroidDevice() {
  const browser = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /^android$/i.test(browser.userAgentData?.platform ?? '') || /\bAndroid\b/i.test(browser.userAgent);
}

export function supportsWebPush() {
  return window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function getPushWorker() {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error('No pudimos preparar las notificaciones. Volvé a intentar.')), 5000);
      }),
    ]);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function readPushSettings(): Promise<PushSettings | null> {
  const { publicKey } = await api<{ publicKey: string | null }>('/notifications/config');
  if (!publicKey) return null;

  const registration = await getPushWorker();
  const subscription = await registration.pushManager.getSubscription().catch((error: unknown) => {
    if (Notification.permission === 'denied') return null;
    throw error;
  });
  const preferences = subscription && matchesApplicationKey(subscription, decodeApplicationKey(publicKey))
    ? await send<ReminderPreferences | null>(`${subscriptionPath}/status`, { endpoint: subscription.endpoint })
    : null;
  return { publicKey, registration, preferences };
}

function decodeApplicationKey(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
}

function matchesApplicationKey(subscription: PushSubscription, key: Uint8Array) {
  const existingKey = subscription.options.applicationServerKey;
  if (!existingKey) return true;
  const bytes = new Uint8Array(existingKey);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

function base64url(key: string) {
  return key.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function registerSubscription(subscription: PushSubscription, daysBefore: number) {
  const { p256dh, auth } = subscription.toJSON().keys ?? {};
  if (!p256dh || !auth) throw new Error('No pudimos obtener las claves de notificación del dispositivo.');
  return send<ReminderPreferences>(subscriptionPath, {
    endpoint: subscription.endpoint, keys: { p256dh: base64url(p256dh), auth: base64url(auth) }, daysBefore,
  }, 'PUT');
}

export async function savePushSettings({ registration, publicKey, preferences }: PushSettings, daysBefore: number) {
  const applicationServerKey = decodeApplicationKey(publicKey);
  const manager = registration.pushManager;
  const subscribe = async () => {
    try {
      // The browser can request permission within the click that calls subscribe().
      return await manager.subscribe({ userVisibleOnly: true, applicationServerKey });
    } catch (error) {
      if (Notification.permission !== 'granted') throw new Error('Permití las notificaciones para activar los avisos.');
      throw new Error('No pudimos suscribir este dispositivo. Volvé a intentar.', { cause: error });
    }
  };

  let subscription = Notification.permission === 'granted' ? await manager.getSubscription() : null;
  if (subscription && (!preferences || !matchesApplicationKey(subscription, applicationServerKey))) {
    // An endpoint missing from the server may have been rejected by the push provider.
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) return registerSubscription(await subscribe(), daysBefore);
  try {
    return await registerSubscription(subscription, daysBefore);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    await subscription.unsubscribe();
    return registerSubscription(await subscribe(), daysBefore);
  }
}

export async function disablePushSettings({ registration }: PushSettings) {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await send(subscriptionPath, { endpoint: subscription.endpoint }, 'DELETE');
  await subscription.unsubscribe().catch(() => { /* The server already stopped sending. */ });
}

export async function clearLocalPushOnSignOut() {
  if (!supportsWebPush()) return;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (!registration) return;
  await Promise.allSettled([
    registration.pushManager.getSubscription().then((subscription) => subscription?.unsubscribe()),
    registration.getNotifications().then((notifications) => {
      for (const notification of notifications) {
        if (notification.tag.startsWith('recurring-') || notification.tag.startsWith('card-closing-')) notification.close();
      }
    }),
  ]);
}
