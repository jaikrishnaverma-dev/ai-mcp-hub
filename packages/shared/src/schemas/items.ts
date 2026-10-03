/**
 * Zod schemas for Item — the polymorphic core entity.
 *
 * Hierarchy: Goal → Story → Task → Subtask
 * Also: Note, Event (standalone, linkable)
 */
import { z } from 'zod';
import {
  ITEM_TYPES,
  ITEM_STATUSES,
  ITEM_PRIORITIES,
  DEFAULT_TIMEZONE,
} from '../constants/index.js';

// --- Shared field schemas ---

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Create inputs ---

export const createTaskInput = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  parentId: objectIdString.optional(),
  priority: z.enum(ITEM_PRIORITIES).default('medium'),
  dueAt: z.string().datetime({ offset: true }).optional(),
  estimateMin: z.number().int().positive().optional(),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

export const createGoalInput = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(ITEM_PRIORITIES).default('medium'),
  dueAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalInput>;

export const createStoryInput = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  parentId: objectIdString.describe('Goal ID this story belongs to'),
  priority: z.enum(ITEM_PRIORITIES).default('medium'),
  dueAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type CreateStoryInput = z.infer<typeof createStoryInput>;

// --- Update inputs ---

export const updateTaskInput = z.object({
  taskId: objectIdString,
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  priority: z.enum(ITEM_PRIORITIES).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  estimateMin: z.number().int().positive().nullable().optional(),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

// --- Query inputs ---

export const listTasksInput = z.object({
  status: z.enum(ITEM_STATUSES).optional(),
  priority: z.enum(ITEM_PRIORITIES).optional(),
  parentId: objectIdString.optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  includeSubtasks: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTasksInput = z.infer<typeof listTasksInput>;

export const getTaskInput = z.object({
  taskId: objectIdString,
});
export type GetTaskInput = z.infer<typeof getTaskInput>;

export const completeTaskInput = z.object({
  taskId: objectIdString,
  reason: z.string().max(1000).optional(),
});
export type CompleteTaskInput = z.infer<typeof completeTaskInput>;

// --- Daily brief ---

export const getDailyBriefInput = z.object({
  date: z.string().date().optional(),
  timezone: z.string().default(DEFAULT_TIMEZONE),
});
export type GetDailyBriefInput = z.infer<typeof getDailyBriefInput>;

// --- Output schemas ---

/** Compact item for lists — no body, no history */
export const itemSummary = z.object({
  id: z.string(),
  type: z.enum(ITEM_TYPES),
  title: z.string(),
  status: z.enum(ITEM_STATUSES),
  priority: z.enum(ITEM_PRIORITIES),
  dueAt: z.string().nullable(),
  parentId: z.string().nullable(),
  parentTitle: z.string().nullable(),
  createdAt: z.string(),
});
export type ItemSummary = z.infer<typeof itemSummary>;

/** Full item for detail views — includes body, decisions, blockers, links, history */
export const itemFull = itemSummary.extend({
  description: z.string().nullable(),
  estimateMin: z.number().nullable(),
  assigneeId: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  tz: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type ItemFull = z.infer<typeof itemFull>;

/** Daily brief response */
export const dailyBriefOutput = z.object({
  date: z.string(),
  timezone: z.string(),
  events: z.array(itemSummary),
  dueTasks: z.array(itemSummary),
  overdueTasks: z.array(itemSummary),
  blockedTasks: z.array(itemSummary),
  yesterdayUnfinished: z.array(itemSummary),
  suggestedFocus: z.array(itemSummary),
  summary: z.string(),
});
export type DailyBriefOutput = z.infer<typeof dailyBriefOutput>;

/** Paginated list response */
export const paginatedItems = z.object({
  items: z.array(itemSummary),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});
export type PaginatedItems = z.infer<typeof paginatedItems>;
