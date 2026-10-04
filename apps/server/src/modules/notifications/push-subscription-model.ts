/**
 * Push Subscription model — Web Push API subscriptions per user.
 *
 * Each subscription represents a browser/device that has opted in
 * to receive push notifications via the Web Push protocol.
 *
 * Multiple subscriptions per user are allowed (different devices/browsers).
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// --- Interface ---

export interface PushSubscriptionDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

// --- Schema ---

const pushSubscriptionSchema = new Schema<PushSubscriptionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

// Unique per user+endpoint (prevent duplicate registrations for same browser)
pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const PushSubscription: Model<PushSubscriptionDocument> =
  mongoose.model<PushSubscriptionDocument>('PushSubscription', pushSubscriptionSchema);
