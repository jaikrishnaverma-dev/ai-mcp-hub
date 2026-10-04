/**
 * Notification Preference model — per-user notification settings.
 *
 * One document per user, upserted on first preference update.
 * Stores:
 * - Preferred channels (web_push, telegram, email)
 * - Telegram chat ID (linked via bot /start command)
 * - Email address for notifications
 * - Quiet hours window
 * - Which notification types are enabled
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@assistant/shared';

// --- Interface ---

export interface NotificationPreferenceDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  channels: Array<(typeof NOTIFICATION_CHANNELS)[number]>;
  telegramChatId?: string;
  emailAddress?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  enabledTypes: Array<(typeof NOTIFICATION_TYPES)[number]>;
  createdAt: Date;
  updatedAt: Date;
}

// --- Schema ---

const notificationPreferenceSchema = new Schema<NotificationPreferenceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    channels: {
      type: [String],
      enum: NOTIFICATION_CHANNELS,
      default: ['web_push'],
    },
    telegramChatId: { type: String },
    emailAddress: { type: String },
    quietHoursStart: { type: String }, // HH:mm
    quietHoursEnd: { type: String },   // HH:mm
    enabledTypes: {
      type: [String],
      enum: NOTIFICATION_TYPES,
      default: ['reminder', 'overdue', 'blocker_resolved', 'task_completed'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

export const NotificationPreference: Model<NotificationPreferenceDocument> =
  mongoose.model<NotificationPreferenceDocument>(
    'NotificationPreference',
    notificationPreferenceSchema,
  );
