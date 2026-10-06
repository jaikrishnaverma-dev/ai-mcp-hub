/**
 * Calendar Zod schemas — Phase 2
 *
 * Validates inputs/outputs for calendar operations:
 * create event, get calendar view, check conflicts, find free slots.
 */
import { z } from 'zod';
import { ITEM_PRIORITIES, CALENDAR_EVENT_STATUSES } from '../constants/index.js';

// --- Create Calendar Event ---
export const createEventInput = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  startAt: z.string().datetime({ message: 'startAt must be ISO 8601' }),
  endAt: z.string().datetime({ message: 'endAt must be ISO 8601' }),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(ITEM_PRIORITIES).default('medium'),
  rrule: z.string().max(500).optional(),
  parentId: z.string().optional(),
  tz: z.string().default('Asia/Kolkata'),
  reason: z.string().optional(),
});
export type CreateEventInput = z.infer<typeof createEventInput>;

// --- Get Calendar View ---
export const getCalendarViewInput = z.object({
  startDate: z.string().datetime({ message: 'startDate must be ISO 8601' }),
  endDate: z.string().datetime({ message: 'endDate must be ISO 8601' }),
  includeRecurring: z.preprocess(
    (v) => v === 'true' || v === true,
    z.boolean().default(true),
  ),
});
export type GetCalendarViewInput = z.infer<typeof getCalendarViewInput>;

// --- Check Conflicts ---
export const checkConflictsInput = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventId: z.string().optional(),
});
export type CheckConflictsInput = z.infer<typeof checkConflictsInput>;

// --- Find Free Slots ---
export const findFreeSlotsInput = z.object({
  date: z.string({ description: 'ISO 8601 date string (YYYY-MM-DD or full datetime)' }),
  durationMinutes: z.coerce.number().min(5).max(480).default(30),
  startHour: z.coerce.number().min(0).max(23).default(9),
  endHour: z.coerce.number().min(1).max(24).default(18),
  tz: z.string().default('Asia/Kolkata'),
});
export type FindFreeSlotsInput = z.infer<typeof findFreeSlotsInput>;

// --- Calendar Event Output (for API responses) ---
export const calendarEventOutput = z.object({
  id: z.string(),
  title: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  dueAt: z.string().nullable(),
  rrule: z.string().nullable(),
  status: z.enum(CALENDAR_EVENT_STATUSES),
  priority: z.enum(ITEM_PRIORITIES),
  tz: z.string(),
  parentId: z.string().nullable(),
  parentTitle: z.string().nullable(),
});

// --- Conflict Output ---
export const conflictOutput = z.object({
  eventA: z.object({ id: z.string(), title: z.string(), startAt: z.string(), endAt: z.string() }),
  eventB: z.object({ id: z.string(), title: z.string(), startAt: z.string(), endAt: z.string() }),
  overlapMinutes: z.number(),
});

// --- Free Slot Output ---
export const freeSlotOutput = z.object({
  startAt: z.string(),
  endAt: z.string(),
  durationMinutes: z.number(),
});

// --- Consolidated Calendar Intelligence Input ---

export const getCalendarInput = z.object({
  startDate: z.string().datetime({ message: 'startDate must be ISO 8601' }),
  endDate: z.string().datetime().optional().describe('End of calendar window (defaults to 7 days after startDate)'),
  includeConflicts: z.preprocess(
    (v) => v === 'true' || v === true,
    z.boolean().default(false),
  ).describe('If true, detects and returns conflicting event overlaps in the window'),
  findFreeSlots: z.object({
    durationMinutes: z.coerce.number().min(5).max(480).default(30),
    date: z.string().optional().describe('Date for free slot search (YYYY-MM-DD), defaults to startDate day'),
    startHour: z.coerce.number().min(0).max(23).default(9),
    endHour: z.coerce.number().min(1).max(24).default(18),
  }).optional().describe('If specified, computes available free gaps of requested duration during working hours'),
  includeRecurring: z.preprocess(
    (v) => v === 'true' || v === true,
    z.boolean().default(true),
  ),
});
export type GetCalendarInput = z.infer<typeof getCalendarInput>;
