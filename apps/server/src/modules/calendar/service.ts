/**
 * Calendar service — Phase 2
 *
 * Provides calendar operations using Items of type 'event':
 * - Create calendar events (with RRULE support)
 * - Get calendar view for a date range (expand recurring events)
 * - Detect scheduling conflicts
 * - Find free time slots
 *
 * Uses the `rrule` library for iCal RRULE expansion.
 * All events are stored as Items with type='event' + startAt/endAt.
 */
import mongoose from 'mongoose';
import rrulePkg from 'rrule';
// Handle both CJS default export and ESM named export across Node ESM runtimes
const RRule = (rrulePkg as unknown as { default?: { RRule?: typeof rrulePkg.RRule }; RRule?: typeof rrulePkg.RRule }).default?.RRule ||
  (rrulePkg as unknown as { RRule?: typeof rrulePkg.RRule }).RRule ||
  (rrulePkg as unknown as typeof rrulePkg.RRule);
import { Item, type ItemDocument } from '../items/model.js';
import { Activity } from '../activity/model.js';
import { createModuleLogger } from '../../config/index.js';
import {
  DEFAULT_TIMEZONE,
  type ServiceContext,
  type CalendarEventView,
  type CalendarConflict,
  type FreeSlot,
  type GetCalendarInput,
} from '@assistant/shared';

const log = createModuleLogger('calendar');

// --- Helpers ---

function toCalendarEventView(
  doc: Record<string, unknown>,
  parentTitle?: string | null,
): CalendarEventView {
  return {
    id: String(doc['_id'] ?? doc['id']),
    title: doc['title'] as string,
    startAt: doc['startAt'] ? (doc['startAt'] as Date).toISOString() : '',
    endAt: doc['endAt'] ? (doc['endAt'] as Date).toISOString() : '',
    dueAt: doc['dueAt'] ? (doc['dueAt'] as Date).toISOString() : null,
    rrule: (doc['rrule'] as string) ?? null,
    status: 'confirmed',
    priority: (doc['priority'] as CalendarEventView['priority']) ?? 'medium',
    tz: (doc['tz'] as string) ?? DEFAULT_TIMEZONE,
    parentId: doc['parentId'] ? String(doc['parentId']) : null,
    parentTitle: parentTitle ?? null,
  };
}

/**
 * Expand a recurring event into individual occurrences within a date range.
 */
function expandRecurringEvent(
  event: Record<string, unknown>,
  rangeStart: Date,
  rangeEnd: Date,
  parentTitle?: string | null,
): CalendarEventView[] {
  const rruleStr = event['rrule'] as string;
  if (!rruleStr) return [toCalendarEventView(event, parentTitle)];

  const eventStart = event['startAt'] as Date;
  const eventEnd = event['endAt'] as Date;
  if (!eventStart || !eventEnd) return [toCalendarEventView(event, parentTitle)];

  const durationMs = eventEnd.getTime() - eventStart.getTime();

  try {
    const rule = RRule.fromString(rruleStr);
    // Override DTSTART to match event's startAt
    const ruleWithStart = new RRule({
      ...rule.origOptions,
      dtstart: eventStart,
    });

    const occurrences = ruleWithStart.between(rangeStart, rangeEnd, true);

    return occurrences.map((occStart: Date, idx: number) => {
      const occEnd = new Date(occStart.getTime() + durationMs);
      return {
        id: `${String(event['_id'] ?? event['id'])}__${idx}`,
        title: event['title'] as string,
        startAt: occStart.toISOString(),
        endAt: occEnd.toISOString(),
        dueAt: event['dueAt'] ? (event['dueAt'] as Date).toISOString() : null,
        rrule: rruleStr,
        status: 'confirmed' as const,
        priority: (event['priority'] as CalendarEventView['priority']) ?? 'medium',
        tz: (event['tz'] as string) ?? DEFAULT_TIMEZONE,
        parentId: event['parentId'] ? String(event['parentId']) : null,
        parentTitle: parentTitle ?? null,
      };
    });
  } catch (err) {
    log.error({ err, rrule: rruleStr }, 'Failed to parse RRULE');
    return [toCalendarEventView(event, parentTitle)];
  }
}

// --- Input Types ---

interface CreateEventParams {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  dueAt?: string;
  priority?: string;
  rrule?: string;
  parentId?: string;
  tz?: string;
  reason?: string;
}

interface GetCalendarViewParams {
  startDate: string;
  endDate: string;
  includeRecurring?: boolean;
}

interface CheckConflictsParams {
  startDate?: string;
  endDate?: string;
  eventId?: string;
}

interface FindFreeSlotsParams {
  date: string;
  durationMinutes?: number;
  startHour?: number;
  endHour?: number;
  tz?: string;
}

// --- Service ---

export const calendarService = {
  /**
   * Create a calendar event (Item with type='event').
   */
  async createEvent(
    params: CreateEventParams,
    ctx: ServiceContext,
  ): Promise<{ event: CalendarEventView; activity: { id: string } }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const startAt = new Date(params.startAt);
        const endAt = new Date(params.endAt);

        if (endAt <= startAt) {
          throw new Error('endAt must be after startAt');
        }

        // Validate RRULE if provided
        if (params.rrule) {
          try {
            RRule.fromString(params.rrule);
          } catch {
            throw new Error(`Invalid RRULE: ${params.rrule}`);
          }
        }

        const [item] = await Item.create(
          [
            {
              type: 'event',
              title: params.title,
              body: params.description,
              status: 'todo',
              priority: params.priority ?? 'medium',
              parentId: params.parentId
                ? new mongoose.Types.ObjectId(params.parentId)
                : undefined,
              ownerId: new mongoose.Types.ObjectId(ctx.userId),
              startAt,
              endAt,
              dueAt: params.dueAt ? new Date(params.dueAt) : undefined,
              rrule: params.rrule,
              tz: params.tz ?? DEFAULT_TIMEZONE,
            },
          ],
          { session },
        );

        if (!item) throw new Error('Failed to create event');

        const [activity] = await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'created',
              changes: [
                { field: 'title', from: null, to: item.title },
                { field: 'type', from: null, to: 'event' },
                { field: 'startAt', from: null, to: startAt.toISOString() },
                { field: 'endAt', from: null, to: endAt.toISOString() },
              ],
              reason: params.reason,
            },
          ],
          { session },
        );

        log.info({ eventId: item._id, title: params.title }, 'Calendar event created');

        return {
          event: toCalendarEventView(item.toObject() as unknown as Record<string, unknown>),
          activity: { id: activity!._id.toString() },
        };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Get calendar view for a date range.
   * Expands recurring events into individual occurrences.
   */
  async getCalendarView(
    params: GetCalendarViewParams,
    ctx: ServiceContext,
  ): Promise<{ events: CalendarEventView[]; total: number }> {
    const rangeStart = new Date(params.startDate);
    const rangeEnd = new Date(params.endDate);

    // Fetch events that overlap with the range
    // An event overlaps if: event.startAt < rangeEnd AND event.endAt > rangeStart
    const events = await Item.find({
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
      type: 'event',
      $or: [
        // Non-recurring events in range
        {
          rrule: { $exists: false },
          startAt: { $lt: rangeEnd },
          endAt: { $gt: rangeStart },
        },
        // Non-recurring events without RRULE that are in range
        {
          rrule: null,
          startAt: { $lt: rangeEnd },
          endAt: { $gt: rangeStart },
        },
        // Recurring events (need to expand to check)
        ...(params.includeRecurring !== false
          ? [{ rrule: { $exists: true, $ne: null } }]
          : []),
      ],
    })
      .sort({ startAt: 1 })
      .lean();

    // Batch-fetch parent titles
    const parentIds = events.filter(e => e.parentId).map(e => e.parentId!);
    const parents = parentIds.length > 0
      ? await Item.find({ _id: { $in: parentIds } }).lean()
      : [];
    const parentMap = new Map(parents.map(p => [p._id.toString(), p['title'] as string]));

    // Expand recurring events
    const expandedEvents: CalendarEventView[] = [];
    for (const event of events) {
      const parentTitle = event.parentId
        ? parentMap.get(event.parentId.toString()) ?? null
        : null;

      if (event.rrule && params.includeRecurring !== false) {
        expandedEvents.push(
          ...expandRecurringEvent(
            event as unknown as Record<string, unknown>,
            rangeStart,
            rangeEnd,
            parentTitle,
          ),
        );
      } else if (!event.rrule) {
        expandedEvents.push(
          toCalendarEventView(event as unknown as Record<string, unknown>, parentTitle),
        );
      }
    }

    // Sort by startAt
    expandedEvents.sort((a, b) => a.startAt.localeCompare(b.startAt));

    return { events: expandedEvents, total: expandedEvents.length };
  },

  /**
   * Detect scheduling conflicts (overlapping events) within a date range.
   */
  async checkConflicts(
    params: CheckConflictsParams,
    ctx: ServiceContext,
  ): Promise<{ conflicts: CalendarConflict[]; hasConflicts: boolean }> {
    // Default to next 7 days if no range specified
    const now = new Date();
    const rangeStart = params.startDate ? new Date(params.startDate) : now;
    const rangeEnd = params.endDate
      ? new Date(params.endDate)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { events } = await this.getCalendarView(
      { startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() },
      ctx,
    );

    // If checking a specific event, only find conflicts involving it
    const targetEvents = params.eventId
      ? events.filter(e => e.id.startsWith(params.eventId!))
      : events;

    const conflicts: CalendarConflict[] = [];

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i]!;
        const b = events[j]!;

        // Skip if not checking all and neither is the target
        if (
          params.eventId &&
          !a.id.startsWith(params.eventId) &&
          !b.id.startsWith(params.eventId)
        ) {
          continue;
        }

        const aStart = new Date(a.startAt).getTime();
        const aEnd = new Date(a.endAt).getTime();
        const bStart = new Date(b.startAt).getTime();
        const bEnd = new Date(b.endAt).getTime();

        // Check overlap: A starts before B ends AND A ends after B starts
        if (aStart < bEnd && aEnd > bStart) {
          const overlapStart = Math.max(aStart, bStart);
          const overlapEnd = Math.min(aEnd, bEnd);
          const overlapMinutes = Math.round((overlapEnd - overlapStart) / (60 * 1000));

          conflicts.push({
            eventA: { id: a.id, title: a.title, startAt: a.startAt, endAt: a.endAt },
            eventB: { id: b.id, title: b.title, startAt: b.startAt, endAt: b.endAt },
            overlapMinutes,
          });
        }
      }
    }

    return { conflicts, hasConflicts: conflicts.length > 0 };
  },

  /**
   * Find free time slots on a given day.
   * Returns available windows between existing events.
   */
  async findFreeSlots(
    params: FindFreeSlotsParams,
    ctx: ServiceContext,
  ): Promise<{ slots: FreeSlot[]; total: number }> {
    const tz = params.tz ?? DEFAULT_TIMEZONE;
    const durationMin = params.durationMinutes ?? 30;
    const startHour = params.startHour ?? 9;
    const endHour = params.endHour ?? 18;

    // Parse the date and create day boundaries in the specified timezone
    const dateStr = params.date.split('T')[0]; // YYYY-MM-DD
    const dayStart = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00`);
    const dayEnd = new Date(`${dateStr}T${String(endHour).padStart(2, '0')}:00:00`);

    // Get events for this day
    const { events } = await this.getCalendarView(
      { startDate: dayStart.toISOString(), endDate: dayEnd.toISOString() },
      ctx,
    );

    // Sort events by start time
    const sortedEvents = events
      .map(e => ({
        start: new Date(e.startAt).getTime(),
        end: new Date(e.endAt).getTime(),
      }))
      .sort((a, b) => a.start - b.start);

    // Find gaps between events
    const slots: FreeSlot[] = [];
    let cursor = dayStart.getTime();

    for (const event of sortedEvents) {
      if (event.start > cursor) {
        const gapMinutes = Math.round((event.start - cursor) / (60 * 1000));
        if (gapMinutes >= durationMin) {
          slots.push({
            startAt: new Date(cursor).toISOString(),
            endAt: new Date(event.start).toISOString(),
            durationMinutes: gapMinutes,
          });
        }
      }
      cursor = Math.max(cursor, event.end);
    }

    // Check gap after last event until end of work day
    if (cursor < dayEnd.getTime()) {
      const gapMinutes = Math.round((dayEnd.getTime() - cursor) / (60 * 1000));
      if (gapMinutes >= durationMin) {
        slots.push({
          startAt: new Date(cursor).toISOString(),
          endAt: dayEnd.toISOString(),
          durationMinutes: gapMinutes,
        });
      }
    }

    return { slots, total: slots.length };
  },

  async getCalendar(
    params: GetCalendarInput,
    ctx: ServiceContext,
  ) {
    const startDate = params.startDate;
    const endDate = params.endDate ?? new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const view = await this.getCalendarView({
      startDate,
      endDate,
      includeRecurring: params.includeRecurring ?? true,
    }, ctx);

    let conflicts: CalendarConflict[] | undefined = undefined;
    if (params.includeConflicts) {
      const conflictRes = await this.checkConflicts({ startDate, endDate }, ctx);
      conflicts = conflictRes.conflicts;
    }

    let freeSlots: FreeSlot[] | undefined = undefined;
    if (params.findFreeSlots) {
      const slotRes = await this.findFreeSlots({
        date: params.findFreeSlots.date ?? startDate.split('T')[0]!,
        durationMinutes: params.findFreeSlots.durationMinutes,
        startHour: params.findFreeSlots.startHour,
        endHour: params.findFreeSlots.endHour,
      }, ctx);
      freeSlots = slotRes.slots;
    }

    return {
      events: view.events,
      totalCount: view.total,
      conflicts,
      freeSlots,
    };
  },
};
