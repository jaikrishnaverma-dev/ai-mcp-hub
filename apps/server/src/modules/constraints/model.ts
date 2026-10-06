/**
 * Constraint + Unknown models — first-class agent reasoning entities.
 *
 * Constraints: hard limits the AI must never violate (budgets, deadlines, resource caps).
 * Unknowns: explicitly tracked gaps in information that may block or risk a goal.
 *
 * Design decisions:
 * - goalId is optional: constraints/unknowns can be global or scoped to a goal
 * - No soft-delete: constraints are immutable facts; delete if truly wrong
 * - Unknowns track resolvedAt + resolvedValue for audit
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { CONSTRAINT_TYPES, type ConstraintType } from '@assistant/shared';

// ─── Constraint ─────────────────────────────────────────────────────────────

export interface ConstraintDocument extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  goalId?: Types.ObjectId;
  type: ConstraintType;
  value: string;
  description: string;
  createdAt: Date;
}

const constraintSchema = new Schema<ConstraintDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    goalId: { type: Schema.Types.ObjectId, ref: 'Item', index: true },
    type: { type: String, required: true, enum: CONSTRAINT_TYPES },
    value: { type: String, required: true, maxlength: 500 },
    description: { type: String, required: true, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        if (ret['goalId']) ret['goalId'] = String(ret['goalId']);
        ret['ownerId'] = String(ret['ownerId']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

constraintSchema.index({ ownerId: 1, goalId: 1 });
constraintSchema.index({ ownerId: 1, type: 1 });

export const Constraint: Model<ConstraintDocument> = mongoose.model<ConstraintDocument>(
  'Constraint',
  constraintSchema,
);

// ─── Unknown ─────────────────────────────────────────────────────────────────

export interface UnknownDocument extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  goalId?: Types.ObjectId;
  title: string;
  description?: string;
  resolvedAt?: Date;
  resolvedValue?: string;
  createdAt: Date;
}

const unknownSchema = new Schema<UnknownDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    goalId: { type: Schema.Types.ObjectId, ref: 'Item', index: true },
    title: { type: String, required: true, maxlength: 500 },
    description: { type: String, maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
    resolvedValue: { type: String, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        if (ret['goalId']) ret['goalId'] = String(ret['goalId']);
        ret['ownerId'] = String(ret['ownerId']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

unknownSchema.index({ ownerId: 1, goalId: 1, resolvedAt: 1 });

export const Unknown: Model<UnknownDocument> = mongoose.model<UnknownDocument>(
  'Unknown',
  unknownSchema,
);
