/**
 * Workflow (Endpoint) model — scoped MCP access points.
 *
 * Each workflow exposes a subset of tools with prompt instructions.
 * The slug is used in the MCP URL: /mcp/{slug}
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { nanoid } from 'nanoid';
import { ENDPOINT_SCOPES, ENDPOINT_STATUSES, type EndpointScope, type EndpointStatus } from '@assistant/shared';

// --- Interface ---

export interface WorkflowDocument extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  toolAllowlist: string[];
  instructions?: string;
  scopes: EndpointScope[];
  status: EndpointStatus;
  isPublic?: boolean;
  likesCount?: number;
  commentsCount?: number;
  authorName?: string;
  expiresAt?: Date;
  createdAt: Date;
}

export type EndpointDocument = WorkflowDocument;

// --- Schema ---

const workflowSchema = new Schema<WorkflowDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      default: () => nanoid(21),
    },
    toolAllowlist: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length >= 1,
        message: 'Workflows must have at least 1 tool',
      },
    },
    instructions: {
      type: String,
      maxlength: 10000,
    },
    scopes: {
      type: [String],
      enum: ENDPOINT_SCOPES,
      default: ['read', 'write'],
    },
    status: {
      type: String,
      enum: ENDPOINT_STATUSES,
      default: 'active',
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
    authorName: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
    },
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

// Indexes
workflowSchema.index({ ownerId: 1, status: 1 });
workflowSchema.index({ isPublic: 1, createdAt: -1 });

export const Workflow: Model<WorkflowDocument> =
  mongoose.models['Endpoint'] ||
  mongoose.models['Workflow'] ||
  mongoose.model<WorkflowDocument>('Endpoint', workflowSchema);

export const Endpoint = Workflow;
