/**
 * Web Push channel — sends push notifications via the Web Push protocol.
 *
 * Uses the `web-push` library with VAPID keys to send notifications
 * to subscribed browsers/devices without needing an app store.
 *
 * VAPID keys must be set in environment:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (e.g., mailto:jai@apptiva.in)
 *
 * Generate keys once with: npx web-push generate-vapid-keys
 */
import webpush from 'web-push';
import { createModuleLogger } from '../../../config/index.js';

const log = createModuleLogger('web-push');

// --- Initialize VAPID ---

const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY'] || '';
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY'] || '';
const VAPID_SUBJECT = process.env['VAPID_SUBJECT'] || 'mailto:admin@mcphub.apptiva.in';

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    log.info('Web Push VAPID configured');
  } catch (err) {
    log.error({ err }, 'Failed to configure VAPID keys');
  }
} else {
  log.warn('VAPID keys not set — Web Push notifications will be disabled');
}

// --- Types ---

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// --- Send ---

export async function sendWebPush(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  if (!vapidConfigured) {
    return { success: false, error: 'VAPID keys not configured' };
  }

  try {
    const result = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
      {
        TTL: 3600, // 1 hour
        urgency: 'high',
      },
    );

    log.info({ statusCode: result.statusCode, endpoint: subscription.endpoint.slice(0, 50) }, 'Web Push sent');
    return { success: true, statusCode: result.statusCode };
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    const statusCode = error.statusCode;

    // 410 Gone = subscription expired, should be removed
    if (statusCode === 410 || statusCode === 404) {
      log.info({ statusCode, endpoint: subscription.endpoint.slice(0, 50) }, 'Push subscription expired');
      return { success: false, error: 'subscription_expired', statusCode };
    }

    log.error({ err, statusCode }, 'Web Push send failed');
    return { success: false, error: error.message, statusCode };
  }
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function isWebPushConfigured(): boolean {
  return vapidConfigured;
}
