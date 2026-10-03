/**
 * Activity model — append-only audit log.
 *
 * Every write operation in the system creates an Activity record.
 * Records: who (actorId + actorType), what (action + changes), when, and why (reason).
 *
 * CRITICAL RULES:
 * - NEVER update an Activity document
 * - NEVER delete an Activity document (not even soft delete)
 * - This is the immutable audit trail
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { ACTOR_TYPES, type ActorType } from '@assistant/shared';

// --- Interface ---

export interface ActivityDocument extends Document {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  actorId: Types.ObjectId;
  actorType: ActorType;
  action: string;
  changes: Array<{
    field: string;
    from: unknown;
    to: unknown;
  }>;
  reason?: string;
  createdAt: Date;
}

// --- Schema ---

const changeSchema = new Schema(
  {
    field: { type: String, required: true },
    from: { type: Schema.Types.Mixed },
    to: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const activitySchema = new Schema<ActivityDocument>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    actorType: {
      type: String,
      required: true,
      enum: ACTOR_TYPES,
    },
    action: {
      type: String,
      required: true,
      // created, updated, completed, deleted, restored,
      // linked, unlinked, blocked, unblocked, decision_logged
    },
    changes: {
      type: [changeSchema],
      default: [],
    },
    reason: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        ret['itemId'] = String(ret['itemId']);
        ret['actorId'] = String(ret['actorId']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// --- Indexes ---

// Primary query: get history for an item, sorted by time
activitySchema.index({ itemId: 1, createdAt: -1 });

// Query by actor (who did what)
activitySchema.index({ actorId: 1, createdAt: -1 });

// --- Model ---

export const Activity: Model<ActivityDocument> = mongoose.model<ActivityDocument>('Activity', activitySchema);
