/**
 * Decision model — recorded choices with rationale.
 *
 * Decisions are first-class objects, not free-text comments.
 * Can be attached to a specific item, a goal, or be project-wide.
 * "Chose Studio X because of price and availability" — structured, searchable.
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// --- Interface ---

export interface DecisionDocument extends Document {
  _id: Types.ObjectId;
  itemId?: Types.ObjectId;
  goalId?: Types.ObjectId;
  category?: string;
  status: 'active' | 'superseded';
  supersededBy?: Types.ObjectId;
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
      required: false,
      index: true,
    },
    goalId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: false,
      index: true,
    },
    category: {
      type: String,
      maxlength: 100,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'superseded'],
      default: 'active',
      index: true,
    },
    supersededBy: {
      type: Schema.Types.ObjectId,
      ref: 'Decision',
      default: null,
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
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        ret['itemId'] = ret['itemId'] ? String(ret['itemId']) : null;
        ret['goalId'] = ret['goalId'] ? String(ret['goalId']) : null;
        ret['decidedBy'] = String(ret['decidedBy']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// --- Indexes ---

// Get all decisions for an item or goal
decisionSchema.index({ itemId: 1, createdAt: -1 });
decisionSchema.index({ goalId: 1, createdAt: -1 });
decisionSchema.index({ decidedBy: 1, status: 1, createdAt: -1 });

// Full-text search on decisions
decisionSchema.index({ summary: 'text', rationale: 'text' });

// --- Model ---

export const Decision: Model<DecisionDocument> = mongoose.model<DecisionDocument>('Decision', decisionSchema);
