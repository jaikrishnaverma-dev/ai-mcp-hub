/**
 * Decision model — recorded choices with rationale.
 *
 * Decisions are first-class objects, not free-text comments.
 * "Chose Studio X because of price and availability" — structured, searchable.
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// --- Interface ---

export interface DecisionDocument extends Document {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  summary: string;
  rationale: string;
  decidedBy: Types.ObjectId;
  createdAt: Date;
}

// --- Schema ---

const decisionSchema = new Schema<DecisionDocument>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      maxlength: 500,
    },
    rationale: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        ret['itemId'] = String(ret['itemId']);
        ret['decidedBy'] = String(ret['decidedBy']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// --- Indexes ---

// Get all decisions for an item
decisionSchema.index({ itemId: 1, createdAt: -1 });

// --- Model ---

export const Decision: Model<DecisionDocument> = mongoose.model<DecisionDocument>('Decision', decisionSchema);
