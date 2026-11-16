self.addEventListener('push', (event) => {
  let reminder;
  try {
    reminder = event.data?.json();
  } catch {
    return;
  }
  if (typeof reminder?.title !== 'string' || typeof reminder.body !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(reminder.dueDate)) return;

  event.waitUntil(self.registration.showNotification(reminder.title, {
    body: reminder.body,
    icon: '/icon-192.png',
    tag: `recurring-${reminder.dueDate}`,
    data: { dueDate: reminder.dueDate },
    lang: 'es-AR',
  }));
});

self.addEventListener('notificationclick', (event) => {
  const dueDate = event.notification.data?.dueDate;
  if (!event.notification.tag.startsWith('recurring-') || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(dueDate)) return;

  event.notification.close();
  const target = new URL('/recurrentes', self.location.origin);
  target.searchParams.set('mes', dueDate.slice(0, 7));
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url === target.href);
    return existing ? existing.focus() : self.clients.openWindow(target.href);
  })());
});
