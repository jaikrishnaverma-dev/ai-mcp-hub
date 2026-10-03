/**
 * User model — basic user record.
 *
 * Auth is handled externally (Clerk/better-auth).
 * This stores the user profile and preferences that the app needs.
 */
import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { DEFAULT_TIMEZONE } from '@assistant/shared';

// --- Interface ---

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  externalId: string; // Auth provider ID (Clerk user ID)
  email: string;
  name: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

// --- Schema ---

const userSchema = new Schema<UserDocument>(
  {
    externalId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
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

// --- Indexes handled via field definitions (unique: true) ---

// --- Model ---

export const User: Model<UserDocument> = mongoose.model<UserDocument>('User', userSchema);
