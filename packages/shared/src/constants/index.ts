/**
 * Shared constants for the Assistant platform.
 * These are the single source of truth for enums used across server + portal.
 */

// --- Item Types ---
export const ITEM_TYPES = ['goal', 'story', 'task', 'subtask', 'note', 'event'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

// Hierarchy rules: which types can be parents of which
export const VALID_PARENT_TYPES: Record<ItemType, ItemType | null> = {
  goal: null,        // top-level, no parent
  story: 'goal',     // parent must be a goal
  task: 'story',     // parent must be a story
  subtask: 'task',   // parent must be a task
  note: null,        // standalone (can link to items)
  event: null,       // standalone (can link to items)
} as const;

// --- Statuses ---
export const ITEM_STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

// --- Priorities ---
export const ITEM_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'] as const;
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];

// Priority weights for sorting (higher = more urgent)
export const PRIORITY_WEIGHTS: Record<ItemPriority, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  none: 1,
} as const;

// --- Link Kinds ---
export const LINK_KINDS = ['depends_on', 'blocks', 'relates_to', 'mentions'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

// Inverse relationships for bidirectional traversal
export const LINK_INVERSES: Partial<Record<LinkKind, LinkKind>> = {
  depends_on: 'blocks',
  blocks: 'depends_on',
} as const;

// --- Actor Types ---
export const ACTOR_TYPES = ['user', 'ai', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// --- Endpoint Scopes ---
export const ENDPOINT_SCOPES = ['read', 'write', 'destructive'] as const;
export type EndpointScope = (typeof ENDPOINT_SCOPES)[number];

// --- Endpoint Statuses ---
export const ENDPOINT_STATUSES = ['active', 'revoked'] as const;
export type EndpointStatus = (typeof ENDPOINT_STATUSES)[number];

// --- Notification Channels (P2) ---
export const NOTIFICATION_CHANNELS = ['telegram', 'email', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// --- Reminder States (P2) ---
export const REMINDER_STATES = ['pending', 'sent', 'failed', 'cancelled'] as const;
export type ReminderState = (typeof REMINDER_STATES)[number];

// --- Pagination ---
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

// --- Confirmation ---
export const CONFIRMATION_TOKEN_TTL_SECONDS = 60;

// --- Default Timezone ---
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
