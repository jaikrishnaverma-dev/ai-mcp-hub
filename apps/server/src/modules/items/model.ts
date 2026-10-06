/**
 * Item model — the polymorphic core entity.
 *
 * Hierarchy: Goal → Story → Task → Subtask
 * Also: Note, Event (standalone, linkable via Links)
 *
 * Uses Mongoose discriminators so all item types share one collection
 * but can have type-specific validation.
 *
 * Key design decisions:
 * - Single collection for all item types (one model, many views)
 * - `deletedAt` for soft delete — global query middleware filters by default
 * - `dueAt` = deadline, `startAt/endAt` = scheduled appointment (never conflate)
 * - `tz` defaults to Asia/Kolkata per user preference
 * - All ObjectId fields stored as ObjectId, converted to string in service layer output
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import {
  ITEM_TYPES,
  ITEM_STATUSES,
  ITEM_PRIORITIES,
  DEFAULT_TIMEZONE,
  type ItemType,
  type ItemStatus,
  type ItemPriority,
} from '@assistant/shared';

// --- Interface ---

export interface ItemDocument extends Document {
  _id: Types.ObjectId;
  type: ItemType;
  title: string;
  body?: string;
  status: ItemStatus;
  priority: ItemPriority;
  parentId?: Types.ObjectId;
  ownerId: Types.ObjectId;
  assigneeId?: Types.ObjectId;
  startAt?: Date;
  endAt?: Date;
  dueAt?: Date;
  estimateMin?: number;
  rrule?: string;
  tz: string;
  meta?: Record<string, unknown>;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// --- Schema ---

const itemSchema = new Schema<ItemDocument>(
  {
    type: {
      type: String,
      required: true,
      enum: ITEM_TYPES,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
    body: {
      type: String,
      maxlength: 50000,
    },
    status: {
      type: String,
      required: true,
      enum: ITEM_STATUSES,
      default: 'todo',
    },
    priority: {
      type: String,
      required: true,
      enum: ITEM_PRIORITIES,
      default: 'medium',
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
    },
    startAt: { type: Date },
    endAt: { type: Date },
    dueAt: {
      type: Date,
      index: true,
    },
    estimateMin: {
      type: Number,
      min: 1,
    },
    rrule: { type: String },
    tz: {
      type: String,
      default: DEFAULT_TIMEZONE,
    },
    meta: {
      type: Schema.Types.Mixed,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// --- Compound indexes ---

// Primary query pattern: user's items by type and status, excluding deleted
itemSchema.index({ ownerId: 1, type: 1, status: 1, deletedAt: 1 });

// Daily brief: items due within a date range for a user
itemSchema.index({ ownerId: 1, dueAt: 1, status: 1, deletedAt: 1 });

// Children lookup: find all items under a parent
itemSchema.index({ parentId: 1, type: 1, deletedAt: 1 });

// Full-text search index for agent search tool
itemSchema.index({ title: 'text', body: 'text' });

// --- Query middleware: auto-exclude soft-deleted items ---

function addSoftDeleteFilter(this: mongoose.Query<unknown, unknown>) {
  const conditions = this.getFilter();
  // Only add filter if not explicitly querying for deleted items
  if (conditions['deletedAt'] === undefined) {
    this.where({ deletedAt: null });
  }
}

itemSchema.pre('find', addSoftDeleteFilter);
itemSchema.pre('findOne', addSoftDeleteFilter);
itemSchema.pre('countDocuments', addSoftDeleteFilter);

// --- Model ---

export const Item: Model<ItemDocument> = mongoose.model<ItemDocument>('Item', itemSchema);
