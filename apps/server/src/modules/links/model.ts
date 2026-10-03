/**
 * Link model — relationships between Items.
 *
 * Link kinds:
 * - depends_on: Item A depends on Item B (A can't start until B is done)
 * - blocks: Item A blocks Item B (inverse of depends_on)
 * - relates_to: loose association
 * - mentions: one item references another
 *
 * Cycle detection is enforced in the service layer using $graphLookup
 * before any depends_on or blocks link is created.
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { LINK_KINDS, type LinkKind } from '@assistant/shared';

// --- Interface ---

export interface LinkDocument extends Document {
  _id: Types.ObjectId;
  fromId: Types.ObjectId;
  toId: Types.ObjectId;
  kind: LinkKind;
  createdAt: Date;
}

// --- Schema ---

const linkSchema = new Schema<LinkDocument>(
  {
    fromId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    toId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    kind: {
      type: String,
      required: true,
      enum: LINK_KINDS,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        ret['fromId'] = String(ret['fromId']);
        ret['toId'] = String(ret['toId']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// --- Compound indexes ---

// Find all links from a specific item (outgoing dependencies)
linkSchema.index({ fromId: 1, kind: 1 });

// Find all links to a specific item (incoming dependencies)
linkSchema.index({ toId: 1, kind: 1 });

// Prevent duplicate links
linkSchema.index({ fromId: 1, toId: 1, kind: 1 }, { unique: true });

// --- Model ---

export const Link: Model<LinkDocument> = mongoose.model<LinkDocument>('Link', linkSchema);
