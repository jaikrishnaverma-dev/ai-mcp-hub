import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ExternalMcpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ExternalMcpDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  name: string;
  url: string;
  authToken?: string;
  tools: ExternalMcpTool[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const externalMcpSchema = new Schema<ExternalMcpDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    authToken: {
      type: String,
      trim: true,
    },
    tools: [
      {
        name: { type: String, required: true },
        description: { type: String, default: '' },
        inputSchema: { type: Schema.Types.Mixed },
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
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

// Prevent duplicate external MCP registrations for the same user and URL
externalMcpSchema.index({ userId: 1, url: 1 }, { unique: true });

export const ExternalMcp = mongoose.model<ExternalMcpDocument>(
  'ExternalMcp',
  externalMcpSchema,
);
