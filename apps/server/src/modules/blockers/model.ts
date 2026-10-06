/**
 * Blocker model — reasons work can't proceed.
 *
 * A blocker records WHAT is stuck and WHO/WHAT it's waiting on.
 * Different from a "blocked" status — the blocker is the explanation.
 *
 * Extended for Agent Core (Phase 3):
 * - waitingOnName: free-text name of external person/entity (not necessarily a system user)
 * - followUpAt: when to remind about this blocker
 * - deadline: when we actually need the response (urgency signal)
 *
 * When a blocker is set:
 * 1. Blocker record is created
 * 2. Item status MAY be updated to "blocked" (service decides)
 * 3. Activity is logged
 *
 * When resolved:
 * 1. resolvedAt is set
 * 2. Item status MAY be updated back (service decides)
 * 3. Activity is logged
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// --- Interface ---

export interface BlockerDocument extends Document {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  reason: string;
  waitingOnUserId?: Types.ObjectId;  // Internal system user
  waitingOnName?: string;            // Free-text: external person/entity name
  followUpAt?: Date;                 // When to remind about this blocker
  deadline?: Date;                   // When we actually need the response
  resolvedAt?: Date;
  createdAt: Date;
}

// --- Schema ---

const blockerSchema = new Schema<BlockerDocument>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    waitingOnUserId: {
      type: Schema.Types.ObjectId,
    },
    waitingOnName: {
      type: String,
      maxlength: 200,
    },
    followUpAt: {
      type: Date,
      default: null,
    },
    deadline: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        ret['itemId'] = String(ret['itemId']);
        if (ret['waitingOnUserId']) {
          ret['waitingOnUserId'] = String(ret['waitingOnUserId']);
        }
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// --- Indexes ---

// Active blockers for an item
blockerSchema.index({ itemId: 1, resolvedAt: 1 });

// Items waiting on a specific system user (for "waiting on others" view)
blockerSchema.index({ waitingOnUserId: 1, resolvedAt: 1 });

// Items with a follow-up scheduled (for reminder dispatch)
blockerSchema.index({ followUpAt: 1, resolvedAt: 1 });

// Items with a response deadline (for urgency detection)
blockerSchema.index({ deadline: 1, resolvedAt: 1 });

// --- Model ---

export const Blocker: Model<BlockerDocument> = mongoose.model<BlockerDocument>('Blocker', blockerSchema);
