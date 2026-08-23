const webpush = require('web-push');
const prisma = require('../prisma');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@carracoffee.my.id';

const isConfigured = Boolean(publicKey && privateKey);

if (isConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn('Push notification disabled: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY belum diatur');
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

async function sendNewOrderPush(order) {
  if (!isConfigured) return { sent: 0, failed: 0 };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { isActive: true } },
  });
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const itemCount = (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
  const tableLabel = order.orderType === 'take-away'
    ? 'Take Away'
    : `Meja ${order.table?.number || order.tableId}`;
  const payload = JSON.stringify({
    title: 'Order Baru Masuk!',
    body: `${tableLabel} · ${itemCount} item · ${formatRupiah(order.totalAmount)}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `order-${order.id}`,
    url: `/kasir?order=${order.id}`,
    orderId: order.id,
  });

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60 * 60, urgency: 'high' });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error.statusCode === 404 || error.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
      } else {
        console.error(`Push gagal untuk subscription ${subscription.id}:`, error.statusCode || error.message);
      }
    }
  }));

  return { sent, failed };
}

module.exports = { isConfigured, publicKey, sendNewOrderPush };
