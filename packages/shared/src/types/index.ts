/**
 * Shared types — TypeScript interfaces used across server and portal.
 *
 * These complement Zod schemas: schemas validate at boundaries,
 * types enforce at compile time.
 */
import type {
  ItemType,
  ItemStatus,
  ItemPriority,
  LinkKind,
  ActorType,
  EndpointScope,
  EndpointStatus,
} from '../constants/index.js';

// --- Service context passed to every service method ---
export interface ServiceContext {
  userId: string;
  actorType: ActorType;
  endpointScopes?: EndpointScope[];
  requestId?: string;
}

// --- Item ---
export interface IItem {
  type: ItemType;
  title: string;
  body?: string;
  status: ItemStatus;
  priority: ItemPriority;
  parentId?: string;
  ownerId: string;
  assigneeId?: string;
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

// --- Link ---
export interface ILink {
  fromId: string;
  toId: string;
  kind: LinkKind;
  createdAt: Date;
}

// --- Activity ---
export interface IActivity {
  itemId: string;
  actorId: string;
  actorType: ActorType;
  action: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
  reason?: string;
  createdAt: Date;
}

// --- Decision ---
export interface IDecision {
  itemId: string;
  summary: string;
  rationale: string;
  decidedBy: string;
  createdAt: Date;
}

// --- Blocker ---
export interface IBlocker {
  itemId: string;
  reason: string;
  waitingOnUserId?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

// --- Endpoint ---
export interface IEndpoint {
  ownerId: string;
  name: string;
  slug: string;
  toolAllowlist: string[];
  instructions?: string;
  scopes: EndpointScope[];
  status: EndpointStatus;
  expiresAt?: Date;
  createdAt: Date;
}

// --- User ---
export interface IUser {
  email: string;
  name: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

// --- Tool result (MCP response shape) ---
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
