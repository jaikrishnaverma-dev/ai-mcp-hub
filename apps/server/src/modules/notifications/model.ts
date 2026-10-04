/**
 * Reminder model — scheduled notifications for items.
 *
 * Each reminder tracks:
 * - Which item it's for
 * - When to fire (triggerAt, computed from item's dueAt/startAt + offset)
 * - Delivery channels (web_push, telegram, email)
 * - State machine: pending → sent | failed | cancelled
 *
 * The cron endpoint queries for pending reminders where triggerAt <= now.
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import {
  REMINDER_STATES,
  REMINDER_TRIGGERS,
  NOTIFICATION_CHANNELS,
} from '@assistant/shared';

// --- Interface ---

export interface ReminderDocument extends Document {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  ownerId: Types.ObjectId;
  trigger: (typeof REMINDER_TRIGGERS)[number];
  triggerAt: Date;
  offsetMinutes?: number;
  state: (typeof REMINDER_STATES)[number];
  channels: Array<(typeof NOTIFICATION_CHANNELS)[number]>;
  sentAt?: Date;
  failReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// --- Schema ---

const reminderSchema = new Schema<ReminderDocument>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      required: true,
      enum: REMINDER_TRIGGERS,
    },
    triggerAt: {
      type: Date,
      required: true,
      index: true,
    },
    offsetMinutes: {
      type: Number,
      min: 0,
    },
    state: {
      type: String,
      required: true,
      enum: REMINDER_STATES,
      default: 'pending',
    },
    channels: {
      type: [String],
      enum: NOTIFICATION_CHANNELS,
      default: ['web_push'],
    },
    sentAt: { type: Date },
    failReason: { type: String },
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

// Compound index: cron job queries pending reminders due now
reminderSchema.index({ state: 1, triggerAt: 1 });

// Prevent duplicate reminders for same item + trigger combo
reminderSchema.index(
  { itemId: 1, trigger: 1, triggerAt: 1 },
  { unique: true, partialFilterExpression: { state: 'pending' } },
);

export const Reminder: Model<ReminderDocument> = mongoose.model<ReminderDocument>(
  'Reminder',
  reminderSchema,
);
