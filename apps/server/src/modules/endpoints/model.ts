/**
 * Endpoint model — scoped MCP access points.
 *
 * Each endpoint exposes a subset of tools with workflow instructions.
 * The slug is used in the MCP URL: /mcp/{slug}
 *
 * Security model:
 * - Slug is routing, NOT authentication
 * - Access requires valid OAuth token with audience bound to this endpoint
 * - Effective permission = token scopes ∩ endpoint allowlist ∩ user's data permissions
 * - tools/list returns ONLY allowlisted tools
 * - tools/call RE-CHECKS allowlist (filtering the list alone is NOT security)
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { nanoid } from 'nanoid';
import { ENDPOINT_SCOPES, ENDPOINT_STATUSES, type EndpointScope, type EndpointStatus } from '@assistant/shared';

// --- Interface ---

export interface EndpointDocument extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  toolAllowlist: string[];
  instructions?: string;
  scopes: EndpointScope[];
  status: EndpointStatus;
  expiresAt?: Date;
  createdAt: Date;
}

// --- Schema ---

const endpointSchema = new Schema<EndpointDocument>(
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
        validator: (v: string[]) => v.length >= 1 && v.length <= 15,
        message: 'Endpoints must have 1-15 tools',
      },
    },
    instructions: {
      type: String,
      maxlength: 10000,
    },
    scopes: {
      type: [String],
      required: true,
      enum: ENDPOINT_SCOPES,
      validate: {
        validator: (v: string[]) => v.length >= 1,
        message: 'At least one scope is required',
      },
    },
    status: {
      type: String,
      required: true,
      enum: ENDPOINT_STATUSES,
      default: 'active',
    },
    expiresAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc: unknown, ret: Record<string, unknown>) => {
        ret['id'] = String(ret['_id']);
        ret['ownerId'] = String(ret['ownerId']);
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// Indexes: slug unique index handled via field definition (unique: true)
// Compound index for owner lookup

// User's endpoints
endpointSchema.index({ ownerId: 1, status: 1 });

// --- Model ---

export const Endpoint: Model<EndpointDocument> = mongoose.model<EndpointDocument>('Endpoint', endpointSchema);
