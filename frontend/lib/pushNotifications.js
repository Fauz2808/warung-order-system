import api from './api';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('kasir_token') : null;
}

function authConfig() {
  const token = getToken();
  return { headers: { Authorization: `Bearer ${token}` } };
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function supportsBackgroundPush() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function getPushState() {
  if (!supportsBackgroundPush()) return { supported: false, subscribed: false };
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

export async function enableBackgroundPush() {
  if (!supportsBackgroundPush()) throw new Error('Browser ini tidak mendukung background notification');
  if (!getToken()) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan');

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const response = await api.get('/push/public-key', authConfig());
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(response.data.data.publicKey),
    });
  }

  await api.post('/push/subscribe', subscription.toJSON(), authConfig());
  return subscription;
}

export async function disableBackgroundPush() {
  if (!supportsBackgroundPush()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await api.delete('/push/subscribe', {
    ...authConfig(),
    data: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

// Repairs the server registration after token/account changes without prompting.
export async function syncExistingPushSubscription() {
  if (!supportsBackgroundPush() || Notification.permission !== 'granted' || !getToken()) return;
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await api.post('/push/subscribe', subscription.toJSON(), authConfig());
}
