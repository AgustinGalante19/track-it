const testNotificationTag = 'track-it-test';

function isReminderDate(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value);
}

self.addEventListener('push', (event) => {
  let notification;
  try {
    notification = event.data?.json();
  } catch {
    return;
  }
  if (typeof notification?.title !== 'string' || typeof notification.body !== 'string') return;
  const { kind, title, body, dueDate } = notification;
  const test = kind === 'test';
  if (!test && !isReminderDate(dueDate)) return;
  const prefix = kind === 'card-closing' ? 'card-closing' : 'recurring';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    tag: test ? testNotificationTag : `${prefix}-${dueDate}`,
    renotify: test,
    data: test ? undefined : { dueDate },
    lang: 'es-AR',
  }));
});

self.addEventListener('notificationclick', (event) => {
  const { notification } = event;
  const target = new URL('/', self.location.origin);
  if (notification.tag !== testNotificationTag) {
    const dueDate = notification.data?.dueDate;
    if (!isReminderDate(dueDate)) return;
    if (notification.tag === `card-closing-${dueDate}`) target.pathname = '/cuentas';
    else if (notification.tag === `recurring-${dueDate}`) target.pathname = '/recurrentes';
    else return;
    target.searchParams.set('mes', dueDate.slice(0, 7));
  }

  notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url === target.href);
    return existing ? existing.focus() : self.clients.openWindow(target.href);
  })());
});
