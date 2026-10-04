/**
 * Notification Log model — append-only audit trail for sent notifications.
 *
 * Every delivery attempt (success or failure) is logged here.
 * Never deleted, used for:
 * - Debugging delivery failures
 * - Preventing duplicate sends
 * - Analytics on notification effectiveness
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@assistant/shared';

// --- Interface ---

export interface NotificationLogDocument extends Document {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: (typeof NOTIFICATION_TYPES)[number];
  channel: (typeof NOTIFICATION_CHANNELS)[number];
  title: string;
  body: string;
  itemId?: Types.ObjectId;
  reminderId?: Types.ObjectId;
  success: boolean;
  error?: string;
  sentAt: Date;
}

// --- Schema ---

const notificationLogSchema = new Schema<NotificationLogDocument>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: NOTIFICATION_TYPES,
    },
    channel: {
      type: String,
      required: true,
      enum: NOTIFICATION_CHANNELS,
    },
    title: { type: String, required: true, maxlength: 500 },
    body: { type: String, required: true, maxlength: 5000 },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', index: true },
    reminderId: { type: Schema.Types.ObjectId, ref: 'Reminder' },
    success: { type: Boolean, required: true },
    error: { type: String },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false, // sentAt is our timestamp
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

// Query: recent notifications for a user
notificationLogSchema.index({ recipientId: 1, sentAt: -1 });

// Query: was this reminder already sent? (deduplication)
notificationLogSchema.index({ reminderId: 1, channel: 1, success: 1 });

export const NotificationLog: Model<NotificationLogDocument> =
  mongoose.model<NotificationLogDocument>('NotificationLog', notificationLogSchema);
