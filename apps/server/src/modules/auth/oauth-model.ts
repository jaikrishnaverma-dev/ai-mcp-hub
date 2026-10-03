import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ─── 1. OAuth Client ─────────────────────────────────────────────────────────

export interface OAuthClientDocument extends Document {
  _id: Types.ObjectId;
  clientId: string;
  clientSecret: string;
  clientName: string;
  userId: Types.ObjectId;
  endpointId?: Types.ObjectId;
  redirectUris: string[];
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const oauthClientSchema = new Schema<OAuthClientDocument>(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clientSecret: {
      type: String,
      required: true,
    },
    clientName: {
      type: String,
      required: true,
      maxlength: 200,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    endpointId: {
      type: Schema.Types.ObjectId,
      ref: 'Endpoint',
    },
    redirectUris: {
      type: [String],
      default: [],
    },
    scopes: {
      type: [String],
      default: ['read', 'write'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const OAuthClient: Model<OAuthClientDocument> = mongoose.model<OAuthClientDocument>(
  'OAuthClient',
  oauthClientSchema,
);

// ─── 2. OAuth Authorization Code (Short-lived, TTL = 5 mins) ─────────────────

export interface OAuthCodeDocument extends Document {
  _id: Types.ObjectId;
  code: string;
  clientId: string;
  userId: Types.ObjectId;
  endpointId?: Types.ObjectId;
  redirectUri: string;
  scopes: string[];
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: Date;
  createdAt: Date;
}

const oauthCodeSchema = new Schema<OAuthCodeDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    endpointId: {
      type: Schema.Types.ObjectId,
      ref: 'Endpoint',
    },
    redirectUri: {
      type: String,
      required: true,
    },
    scopes: {
      type: [String],
      default: ['read', 'write'],
    },
    codeChallenge: {
      type: String,
    },
    codeChallengeMethod: {
      type: String,
      default: 'S256',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index: MongoDB deletes expired documents automatically
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export const OAuthCode: Model<OAuthCodeDocument> = mongoose.model<OAuthCodeDocument>(
  'OAuthCode',
  oauthCodeSchema,
);

// ─── 3. OAuth Access Token (TTL = 30 days) ───────────────────────────────────

export interface OAuthTokenDocument extends Document {
  _id: Types.ObjectId;
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  userId: Types.ObjectId;
  endpointId?: Types.ObjectId;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;
}

const oauthTokenSchema = new Schema<OAuthTokenDocument>(
  {
    accessToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    refreshToken: {
      type: String,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    endpointId: {
      type: Schema.Types.ObjectId,
      ref: 'Endpoint',
    },
    scopes: {
      type: [String],
      default: ['read', 'write'],
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export const OAuthToken: Model<OAuthTokenDocument> = mongoose.model<OAuthTokenDocument>(
  'OAuthToken',
  oauthTokenSchema,
);
