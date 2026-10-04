/**
 * Notifications service — Phase 2
 *
 * Core notification orchestrator:
 * 1. Manage reminders (set, cancel, list)
 * 2. Manage notification preferences per user
 * 3. Register/unregister Web Push subscriptions
 * 4. Process due reminders (called by Hostinger cron)
 * 5. Send ad-hoc notifications (e.g., blocker resolved)
 *
 * Security:
 * - All operations scoped to user via ServiceContext
 * - Cron endpoint secured by X-Cron-Secret header
 * - Activity logged for reminder creation/cancellation
 */
import mongoose from 'mongoose';
import { Item } from '../items/model.js';
import { Activity } from '../activity/model.js';
import { Reminder, type ReminderDocument } from './model.js';
import { NotificationPreference, type NotificationPreferenceDocument } from './preferences-model.js';
import { PushSubscription, type PushSubscriptionDocument } from './push-subscription-model.js';
import { NotificationLog } from './notification-log-model.js';
import {
  sendWebPush,
  type PushPayload,
  type PushSubscriptionData,
} from './channels/web-push.js';
import { sendTelegram, type TelegramPayload } from './channels/telegram.js';
import { sendEmail, type EmailPayload } from './channels/email.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import {
  DEFAULT_TIMEZONE,
  type ServiceContext,
  type NotificationChannel,
  type NotificationType,
} from '@assistant/shared';

const log = createModuleLogger('notifications');

const PORTAL_BASE_URL = process.env['PORTAL_BASE_URL'] || 'https://mcphub.apptiva.in';

// --- Types ---

interface SetReminderParams {
  itemId: string;
  trigger: 'before_due' | 'before_start' | 'at_time' | 'overdue';
  offsetMinutes?: number;
  triggerAt?: string;
  channels?: NotificationChannel[];
  reason?: string;
}

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  itemId?: string;
  reminderId?: string;
  url?: string;
}

// --- Service ---

export const notificationsService = {
  // ============================================================
  // Reminders
  // ============================================================

  /**
   * Set a reminder on an item.
   * Computes triggerAt from item's dueAt/startAt + offset, or uses explicit triggerAt.
   */
  async setReminder(
    params: SetReminderParams,
    ctx: ServiceContext,
  ): Promise<{
    reminder: {
      id: string;
      itemId: string;
      itemTitle: string;
      trigger: string;
      triggerAt: string;
      offsetMinutes: number | null;
      state: string;
      channels: string[];
      sentAt: string | null;
      createdAt: string;
    };
    activity: { id: string };
  }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const item = await Item.findById(params.itemId).session(session);
        if (!item) throw new NotFoundError('Item', params.itemId);
        if (item.ownerId.toString() !== ctx.userId) {
          throw new ValidationError('Cannot set reminder on another user\'s item');
        }

        // Compute triggerAt
        let triggerAt: Date;

        if (params.triggerAt) {
          triggerAt = new Date(params.triggerAt);
        } else {
          const offset = (params.offsetMinutes ?? 15) * 60 * 1000; // default 15 min

          switch (params.trigger) {
            case 'before_due':
              if (!item.dueAt) throw new ValidationError('Item has no dueAt for before_due trigger');
              triggerAt = new Date(item.dueAt.getTime() - offset);
              break;
            case 'before_start':
              if (!item.startAt) throw new ValidationError('Item has no startAt for before_start trigger');
              triggerAt = new Date(item.startAt.getTime() - offset);
              break;
            case 'overdue':
              if (!item.dueAt) throw new ValidationError('Item has no dueAt for overdue trigger');
              triggerAt = new Date(item.dueAt.getTime() + offset);
              break;
            case 'at_time':
              throw new ValidationError('at_time trigger requires explicit triggerAt');
            default:
              throw new ValidationError(`Unknown trigger: ${params.trigger}`);
          }
        }

        if (triggerAt.getTime() <= Date.now()) {
          throw new ValidationError('Reminder triggerAt must be in the future');
        }

        // Get user preferences for default channels
        const prefs = await NotificationPreference.findOne({
          userId: new mongoose.Types.ObjectId(ctx.userId),
        }).session(session);

        const channels = params.channels ?? prefs?.channels ?? ['web_push'];

        const [reminder] = await Reminder.create(
          [
            {
              itemId: new mongoose.Types.ObjectId(params.itemId),
              ownerId: new mongoose.Types.ObjectId(ctx.userId),
              trigger: params.trigger,
              triggerAt,
              offsetMinutes: params.offsetMinutes,
              state: 'pending',
              channels,
            },
          ],
          { session },
        );

        if (!reminder) throw new Error('Failed to create reminder');

        // Log activity
        const [activity] = await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'reminder_set',
              changes: [
                { field: 'reminder', from: null, to: `${params.trigger} at ${triggerAt.toISOString()}` },
                { field: 'channels', from: null, to: channels.join(', ') },
              ],
              reason: params.reason,
            },
          ],
          { session },
        );

        log.info({ reminderId: reminder._id, itemId: params.itemId, triggerAt }, 'Reminder set');

        return {
          reminder: {
            id: reminder._id.toString(),
            itemId: params.itemId,
            itemTitle: item.title,
            trigger: params.trigger,
            triggerAt: triggerAt.toISOString(),
            offsetMinutes: params.offsetMinutes ?? null,
            state: 'pending',
            channels,
            sentAt: null,
            createdAt: reminder.createdAt.toISOString(),
          },
          activity: { id: activity!._id.toString() },
        };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Cancel a pending reminder.
   */
  async cancelReminder(
    reminderId: string,
    reason: string | undefined,
    ctx: ServiceContext,
  ): Promise<{ cancelled: boolean }> {
    const reminder = await Reminder.findById(reminderId);
    if (!reminder) throw new NotFoundError('Reminder', reminderId);
    if (reminder.ownerId.toString() !== ctx.userId) {
      throw new ValidationError('Cannot cancel another user\'s reminder');
    }
    if (reminder.state !== 'pending') {
      throw new ValidationError(`Cannot cancel reminder in state: ${reminder.state}`);
    }

    reminder.state = 'cancelled';
    await reminder.save();

    await Activity.create({
      itemId: reminder.itemId,
      actorId: new mongoose.Types.ObjectId(ctx.userId),
      actorType: ctx.actorType,
      action: 'reminder_cancelled',
      changes: [{ field: 'state', from: 'pending', to: 'cancelled' }],
      reason,
    });

    log.info({ reminderId }, 'Reminder cancelled');
    return { cancelled: true };
  },

  /**
   * List reminders for a user (optionally filtered by item or state).
   */
  async listReminders(
    params: { itemId?: string; state?: string; limit?: number },
    ctx: ServiceContext,
  ): Promise<{
    reminders: Array<{
      id: string;
      itemId: string;
      itemTitle: string;
      trigger: string;
      triggerAt: string;
      state: string;
      channels: string[];
    }>;
  }> {
    const filter: Record<string, unknown> = {
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
    };
    if (params.itemId) filter['itemId'] = new mongoose.Types.ObjectId(params.itemId);
    if (params.state) filter['state'] = params.state;

    const reminders = await Reminder.find(filter)
      .sort({ triggerAt: 1 })
      .limit(params.limit ?? 20)
      .lean();

    // Batch fetch item titles
    const itemIds = [...new Set(reminders.map(r => r.itemId.toString()))];
    const items = await Item.find({ _id: { $in: itemIds } }).lean();
    const titleMap = new Map(items.map(i => [i._id.toString(), i.title]));

    return {
      reminders: reminders.map(r => ({
        id: r._id.toString(),
        itemId: r.itemId.toString(),
        itemTitle: titleMap.get(r.itemId.toString()) ?? 'Unknown',
        trigger: r.trigger,
        triggerAt: r.triggerAt.toISOString(),
        state: r.state,
        channels: r.channels,
      })),
    };
  },

  // ============================================================
  // Notification Preferences
  // ============================================================

  async getPreferences(
    ctx: ServiceContext,
  ): Promise<{
    channels: NotificationChannel[];
    telegramChatId: string | null;
    emailAddress: string | null;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    enabledTypes: NotificationType[];
    webPushSubscriptions: number;
  }> {
    const prefs = await NotificationPreference.findOne({
      userId: new mongoose.Types.ObjectId(ctx.userId),
    });

    const pushCount = await PushSubscription.countDocuments({
      userId: new mongoose.Types.ObjectId(ctx.userId),
    });

    if (!prefs) {
      return {
        channels: ['web_push'],
        telegramChatId: null,
        emailAddress: null,
        quietHoursStart: null,
        quietHoursEnd: null,
        enabledTypes: ['reminder', 'overdue', 'blocker_resolved', 'task_completed'],
        webPushSubscriptions: pushCount,
      };
    }

    return {
      channels: prefs.channels,
      telegramChatId: prefs.telegramChatId ?? null,
      emailAddress: prefs.emailAddress ?? null,
      quietHoursStart: prefs.quietHoursStart ?? null,
      quietHoursEnd: prefs.quietHoursEnd ?? null,
      enabledTypes: prefs.enabledTypes,
      webPushSubscriptions: pushCount,
    };
  },

  async updatePreferences(
    params: {
      channels?: NotificationChannel[];
      telegramChatId?: string;
      emailAddress?: string;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      enabledTypes?: NotificationType[];
    },
    ctx: ServiceContext,
  ): Promise<{ updated: boolean }> {
    const update: Record<string, unknown> = {};
    if (params.channels) update['channels'] = params.channels;
    if (params.telegramChatId !== undefined) update['telegramChatId'] = params.telegramChatId;
    if (params.emailAddress !== undefined) update['emailAddress'] = params.emailAddress;
    if (params.quietHoursStart !== undefined) update['quietHoursStart'] = params.quietHoursStart;
    if (params.quietHoursEnd !== undefined) update['quietHoursEnd'] = params.quietHoursEnd;
    if (params.enabledTypes) update['enabledTypes'] = params.enabledTypes;

    await NotificationPreference.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(ctx.userId) },
      { $set: update },
      { upsert: true, new: true },
    );

    log.info({ userId: ctx.userId }, 'Notification preferences updated');
    return { updated: true };
  },

  // ============================================================
  // Push Subscriptions
  // ============================================================

  async registerPushSubscription(
    params: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string },
    ctx: ServiceContext,
  ): Promise<{ registered: boolean; subscriptionId: string }> {
    const doc = await PushSubscription.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(ctx.userId),
        endpoint: params.endpoint,
      },
      {
        $set: {
          keys: params.keys,
          userAgent: params.userAgent,
        },
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(ctx.userId),
          endpoint: params.endpoint,
        },
      },
      { upsert: true, new: true },
    );

    // Also ensure web_push is in the user's preferred channels
    await NotificationPreference.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(ctx.userId) },
      { $addToSet: { channels: 'web_push' } },
      { upsert: true },
    );

    log.info({ userId: ctx.userId, endpoint: params.endpoint.slice(0, 50) }, 'Push subscription registered');
    return { registered: true, subscriptionId: doc._id.toString() };
  },

  async unregisterPushSubscription(
    endpoint: string,
    ctx: ServiceContext,
  ): Promise<{ removed: boolean }> {
    const result = await PushSubscription.deleteOne({
      userId: new mongoose.Types.ObjectId(ctx.userId),
      endpoint,
    });
    return { removed: result.deletedCount > 0 };
  },

  // ============================================================
  // Send Notification (multi-channel dispatch)
  // ============================================================

  /**
   * Send a notification to a user via their preferred channels.
   * Logs every delivery attempt to NotificationLog.
   */
  async sendToUser(
    userId: string,
    payload: NotificationPayload,
    overrideChannels?: NotificationChannel[],
  ): Promise<{ sent: number; failed: number; channels: string[] }> {
    const prefs = await NotificationPreference.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    });

    const channels = overrideChannels ?? prefs?.channels ?? ['web_push'];
    let sent = 0;
    let failed = 0;
    const sentChannels: string[] = [];

    for (const channel of channels) {
      try {
        let success = false;
        let error: string | undefined;

        switch (channel) {
          case 'web_push': {
            const subs = await PushSubscription.find({
              userId: new mongoose.Types.ObjectId(userId),
            }).lean();

            for (const sub of subs) {
              const pushPayload: PushPayload = {
                title: payload.title,
                body: payload.body,
                url: payload.url ?? `${PORTAL_BASE_URL}`,
                tag: payload.itemId ?? payload.reminderId,
                data: { type: payload.type, itemId: payload.itemId },
              };

              const result = await sendWebPush(
                { endpoint: sub.endpoint, keys: sub.keys } as PushSubscriptionData,
                pushPayload,
              );

              if (result.success) {
                success = true;
              } else {
                error = result.error;
                // Remove expired subscriptions
                if (result.error === 'subscription_expired') {
                  await PushSubscription.deleteOne({ _id: sub._id });
                  log.info({ subId: sub._id }, 'Removed expired push subscription');
                }
              }
            }

            if (subs.length === 0) {
              error = 'No push subscriptions registered';
            }
            break;
          }

          case 'telegram': {
            const chatId = prefs?.telegramChatId;
            if (!chatId) {
              error = 'No Telegram chat ID configured';
              break;
            }

            const telegramPayload: TelegramPayload = {
              title: payload.title,
              body: payload.body,
              url: payload.url,
              itemId: payload.itemId,
            };

            const result = await sendTelegram(chatId, telegramPayload);
            success = result.success;
            error = result.error;
            break;
          }

          case 'email': {
            const emailAddr = prefs?.emailAddress;
            if (!emailAddr) {
              error = 'No email address configured';
              break;
            }

            const emailPayload: EmailPayload = {
              title: payload.title,
              body: payload.body,
              url: payload.url,
              itemId: payload.itemId,
            };

            const result = await sendEmail(emailAddr, emailPayload);
            success = result.success;
            error = result.error;
            break;
          }
        }

        // Log the delivery attempt
        await NotificationLog.create({
          recipientId: new mongoose.Types.ObjectId(userId),
          type: payload.type,
          channel,
          title: payload.title,
          body: payload.body,
          itemId: payload.itemId ? new mongoose.Types.ObjectId(payload.itemId) : undefined,
          reminderId: payload.reminderId ? new mongoose.Types.ObjectId(payload.reminderId) : undefined,
          success,
          error,
          sentAt: new Date(),
        });

        if (success) {
          sent++;
          sentChannels.push(channel);
        } else {
          failed++;
        }
      } catch (err) {
        log.error({ err, channel, userId }, 'Channel delivery error');
        failed++;
      }
    }

    return { sent, failed, channels: sentChannels };
  },

  // ============================================================
  // Cron Processor — called by Hostinger cron endpoint
  // ============================================================

  /**
   * Process all due reminders.
   * Called every 5 minutes by the cron endpoint.
   *
   * Steps:
   * 1. Find pending reminders where triggerAt <= now
   * 2. For each, send notification via user's preferred channels
   * 3. Update reminder state to 'sent' or 'failed'
   * 4. Also check for overdue items and send alerts
   */
  async processReminders(
    batchSize: number = 50,
    dryRun: boolean = false,
  ): Promise<{
    processed: number;
    sent: number;
    failed: number;
    overdueAlerts: number;
  }> {
    const now = new Date();

    // 1. Find due reminders
    const dueReminders = await Reminder.find({
      state: 'pending',
      triggerAt: { $lte: now },
    })
      .sort({ triggerAt: 1 })
      .limit(batchSize)
      .lean();

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      processed++;

      if (dryRun) continue;

      try {
        // Fetch the item
        const item = await Item.findById(reminder.itemId).lean();
        if (!item) {
          // Item was deleted, cancel reminder
          await Reminder.findByIdAndUpdate(reminder._id, {
            state: 'cancelled',
            failReason: 'Item no longer exists',
          });
          continue;
        }

        // Send notification
        const payload: NotificationPayload = {
          type: 'reminder',
          title: `⏰ Reminder: ${item.title}`,
          body: this.formatReminderBody(reminder, item as Record<string, unknown>),
          itemId: item._id.toString(),
          reminderId: reminder._id.toString(),
          url: `${PORTAL_BASE_URL}`,
        };

        const result = await this.sendToUser(
          reminder.ownerId.toString(),
          payload,
          reminder.channels as NotificationChannel[],
        );

        if (result.sent > 0) {
          await Reminder.findByIdAndUpdate(reminder._id, {
            state: 'sent',
            sentAt: now,
          });
          sent++;
        } else {
          await Reminder.findByIdAndUpdate(reminder._id, {
            state: 'failed',
            failReason: 'No channels delivered successfully',
          });
          failed++;
        }
      } catch (err) {
        log.error({ err, reminderId: reminder._id }, 'Reminder processing error');
        await Reminder.findByIdAndUpdate(reminder._id, {
          state: 'failed',
          failReason: (err as Error).message,
        });
        failed++;
      }
    }

    // 2. Check for overdue items (items with dueAt past due, not done, not already notified)
    let overdueAlerts = 0;
    if (!dryRun) {
      overdueAlerts = await this.processOverdueItems(now);
    }

    log.info(
      { processed, sent, failed, overdueAlerts, dryRun },
      'Cron reminder processing complete',
    );

    return { processed, sent, failed, overdueAlerts };
  },

  /**
   * Find overdue items and send alerts (max once per item per day).
   */
  async processOverdueItems(now: Date): Promise<number> {
    // Find items that are overdue and not done/cancelled
    const overdueItems = await Item.find({
      dueAt: { $lt: now },
      status: { $nin: ['done', 'cancelled'] },
      type: { $in: ['task', 'subtask', 'story'] },
    })
      .sort({ dueAt: 1 })
      .limit(20)
      .lean();

    let alerts = 0;
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const item of overdueItems) {
      // Check if we already sent an overdue alert for this item today
      const recentAlert = await NotificationLog.findOne({
        itemId: item._id,
        type: 'overdue',
        sentAt: { $gte: oneDayAgo },
        success: true,
      });

      if (recentAlert) continue;

      const overdueDays = Math.ceil(
        (now.getTime() - (item.dueAt as Date).getTime()) / (24 * 60 * 60 * 1000),
      );

      const payload: NotificationPayload = {
        type: 'overdue',
        title: `🚨 Overdue: ${item.title}`,
        body: `This ${item.type} is ${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue. Due: ${(item.dueAt as Date).toISOString().split('T')[0]}`,
        itemId: item._id.toString(),
        url: `${PORTAL_BASE_URL}`,
      };

      try {
        await this.sendToUser(item.ownerId.toString(), payload);
        alerts++;
      } catch (err) {
        log.error({ err, itemId: item._id }, 'Overdue alert failed');
      }
    }

    return alerts;
  },

  /**
   * Format a human-readable reminder body.
   */
  formatReminderBody(
    reminder: Record<string, unknown>,
    item: Record<string, unknown>,
  ): string {
    const trigger = reminder['trigger'] as string;
    const itemTitle = item['title'] as string;
    const dueAt = item['dueAt'] as Date | undefined;
    const startAt = item['startAt'] as Date | undefined;

    switch (trigger) {
      case 'before_due':
        return `"${itemTitle}" is due ${dueAt ? `at ${dueAt.toISOString()}` : 'soon'}`;
      case 'before_start':
        return `"${itemTitle}" starts ${startAt ? `at ${startAt.toISOString()}` : 'soon'}`;
      case 'overdue':
        return `"${itemTitle}" is overdue${dueAt ? ` (was due ${dueAt.toISOString()})` : ''}`;
      case 'at_time':
        return `Reminder for "${itemTitle}"`;
      default:
        return `Reminder for "${itemTitle}"`;
    }
  },
};
