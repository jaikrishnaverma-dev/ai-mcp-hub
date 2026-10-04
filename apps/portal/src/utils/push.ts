/**
 * Web Push client utility.
 *
 * Handles:
 * - Service worker registration
 * - VAPID key conversion
 * - Push subscription registration with the backend
 */
import { api } from '../api/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isPushNotificationSupported(): Promise<boolean> {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function registerPushNotifications(): Promise<{
  success: boolean;
  message?: string;
  subscription?: PushSubscription;
}> {
  if (!(await isPushNotificationSupported())) {
    return {
      success: false,
      message: 'Push notifications are not supported in this browser.',
    };
  }

  // 1. Request user permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      success: false,
      message: 'Notification permission was denied by the user.',
    };
  }

  // 2. Register Service Worker
  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  }

  // 3. Get VAPID public key from backend
  const { publicKey } = await api.getVapidPublicKey();
  if (!publicKey) {
    return {
      success: false,
      message: 'Server has not configured VAPID keys yet.',
    };
  }

  // 4. Subscribe with PushManager
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as unknown as BufferSource,
  });

  // 5. Send subscription to backend
  await api.subscribePush(subscription.toJSON(), navigator.userAgent);

  return {
    success: true,
    message: 'Push notifications successfully enabled!',
    subscription,
  };
}

export async function unregisterPushNotifications(): Promise<{ success: boolean }> {
  if (!('serviceWorker' in navigator)) return { success: false };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}
