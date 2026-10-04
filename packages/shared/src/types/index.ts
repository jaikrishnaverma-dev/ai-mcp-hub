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
  NotificationChannel,
  NotificationType,
  ReminderState,
  ReminderTrigger,
  CalendarEventStatus,
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

// ==========================================
// Phase 2 Types — Calendar & Notifications
// ==========================================

// --- Reminder ---
export interface IReminder {
  itemId: string;
  ownerId: string;
  trigger: ReminderTrigger;
  triggerAt: Date;
  offsetMinutes?: number;
  state: ReminderState;
  channels: NotificationChannel[];
  sentAt?: Date;
  failReason?: string;
  createdAt: Date;
}

// --- Notification Preference ---
export interface INotificationPreference {
  userId: string;
  channels: NotificationChannel[];
  telegramChatId?: string;
  emailAddress?: string;
  quietHoursStart?: string; // HH:mm in user tz
  quietHoursEnd?: string;
  enabledTypes: NotificationType[];
  createdAt: Date;
  updatedAt: Date;
}

// --- Web Push Subscription ---
export interface IPushSubscription {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

// --- Notification Log (audit trail for sent notifications) ---
export interface INotificationLog {
  recipientId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  itemId?: string;
  reminderId?: string;
  success: boolean;
  error?: string;
  sentAt: Date;
}

// --- Calendar Event View (flattened from Item of type 'event') ---
export interface CalendarEventView {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  dueAt: string | null;
  rrule: string | null;
  status: CalendarEventStatus;
  priority: ItemPriority;
  tz: string;
  parentId: string | null;
  parentTitle: string | null;
}

// --- Conflict (returned by conflict detection) ---
export interface CalendarConflict {
  eventA: { id: string; title: string; startAt: string; endAt: string };
  eventB: { id: string; title: string; startAt: string; endAt: string };
  overlapMinutes: number;
}

// --- Free Slot ---
export interface FreeSlot {
  startAt: string;
  endAt: string;
  durationMinutes: number;
}
