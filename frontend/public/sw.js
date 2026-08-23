self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = { title: 'Order Baru Masuk!', body: event.data?.text() || '' };
    }

    // Dashboard yang sedang terlihat sudah menangani Socket.IO, bunyi, dan toast.
    // Hindari notifikasi ganda, tetapi tetap tampilkan saat app ditutup/background.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasVisibleDashboard = windows.some((client) => client.visibilityState === 'visible');
    if (hasVisibleDashboard) return;

    await self.registration.showNotification(data.title || 'Order Baru Masuk!', {
      body: data.body || 'Ada pesanan baru yang perlu diproses.',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || `order-${data.orderId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: { url: data.url || '/kasir', orderId: data.orderId },
      vibrate: [250, 100, 250, 100, 400],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/kasir', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
