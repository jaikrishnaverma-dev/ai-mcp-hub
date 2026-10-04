/**
 * Notifications Zod schemas — Phase 2
 *
 * Validates inputs/outputs for:
 * - Reminders (set/cancel)
 * - Notification preferences
 * - Push subscriptions
 * - Cron processing
 */
import { z } from 'zod';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  REMINDER_TRIGGERS,
  REMINDER_STATES,
} from '../constants/index.js';

// --- Set Reminder ---
export const setReminderInput = z.object({
  itemId: z.string().min(1),
  trigger: z.enum(REMINDER_TRIGGERS),
  offsetMinutes: z.number().min(0).max(10080).optional(), // max 7 days
  triggerAt: z.string().datetime().optional(),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).optional(),
  reason: z.string().optional(),
});
export type SetReminderInput = z.infer<typeof setReminderInput>;

// --- Cancel Reminder ---
export const cancelReminderInput = z.object({
  reminderId: z.string().min(1),
  reason: z.string().optional(),
});
export type CancelReminderInput = z.infer<typeof cancelReminderInput>;

// --- Update Notification Preferences ---
export const updateNotificationPrefsInput = z.object({
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).optional(),
  telegramChatId: z.string().optional(),
  emailAddress: z.string().email().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  enabledTypes: z.array(z.enum(NOTIFICATION_TYPES)).optional(),
});
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsInput>;

// --- Register Push Subscription ---
export const registerPushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});
export type RegisterPushSubscriptionInput = z.infer<typeof registerPushSubscriptionInput>;

// --- Cron Process Request (secured by header secret) ---
export const cronProcessInput = z.object({
  batchSize: z.number().min(1).max(100).default(50),
  dryRun: z.boolean().default(false),
});
export type CronProcessInput = z.infer<typeof cronProcessInput>;

// --- Reminder Output ---
export const reminderOutput = z.object({
  id: z.string(),
  itemId: z.string(),
  itemTitle: z.string(),
  trigger: z.enum(REMINDER_TRIGGERS),
  triggerAt: z.string(),
  offsetMinutes: z.number().nullable(),
  state: z.enum(REMINDER_STATES),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});

// --- Notification Preferences Output ---
export const notificationPrefsOutput = z.object({
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)),
  telegramChatId: z.string().nullable(),
  emailAddress: z.string().nullable(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  enabledTypes: z.array(z.enum(NOTIFICATION_TYPES)),
  webPushSubscriptions: z.number(), // count of registered push subscriptions
});
