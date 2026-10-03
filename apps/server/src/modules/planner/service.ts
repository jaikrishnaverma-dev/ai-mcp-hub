/**
 * Planner service — daily brief and focus suggestions.
 *
 * This is the highest-value tool for the AI client.
 * It answers: "What should I focus on today?"
 *
 * Daily brief aggregates:
 * - Today's events (appointments)
 * - Tasks due today
 * - Overdue tasks (past due, not done)
 * - Blocked tasks (with blocker reasons)
 * - Yesterday's unfinished work
 * - Suggested focus (top 3 by priority + deadline proximity)
 */
import mongoose from 'mongoose';
import { Item } from '../items/model.js';
import { Blocker } from '../blockers/model.js';
import { createModuleLogger } from '../../config/index.js';
import {
  DEFAULT_TIMEZONE,
  PRIORITY_WEIGHTS,
  type ServiceContext,
  type ItemSummary,
  type ItemPriority,
} from '@assistant/shared';

const log = createModuleLogger('planner');

function toSummary(doc: Record<string, unknown>, parentTitle?: string | null): ItemSummary {
  return {
    id: String(doc['_id'] ?? doc['id']),
    type: doc['type'] as ItemSummary['type'],
    title: doc['title'] as string,
    status: doc['status'] as ItemSummary['status'],
    priority: doc['priority'] as ItemSummary['priority'],
    dueAt: doc['dueAt'] ? (doc['dueAt'] as Date).toISOString() : null,
    parentId: doc['parentId'] ? String(doc['parentId']) : null,
    parentTitle: parentTitle ?? null,
    createdAt: (doc['createdAt'] as Date).toISOString(),
  };
}

/**
 * Score a task for focus priority.
 * Higher score = should be focused on first.
 */
function computeFocusScore(doc: Record<string, unknown>): number {
  let score = 0;

  // Priority weight (critical=5, high=4, etc.)
  const priority = doc['priority'] as ItemPriority;
  score += (PRIORITY_WEIGHTS[priority] ?? 1) * 10;

  // Deadline proximity (closer = higher score)
  const dueAt = doc['dueAt'] as Date | undefined;
  if (dueAt) {
    const hoursUntilDue = (dueAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue < 0) {
      score += 50; // Overdue — highest urgency
    } else if (hoursUntilDue < 24) {
      score += 30; // Due today
    } else if (hoursUntilDue < 72) {
      score += 15; // Due within 3 days
    }
  }

  // Blocked items get negative score (can't work on them)
  if (doc['status'] === 'blocked') {
    score -= 100;
  }

  return score;
}

export const plannerService = {
  async getDailyBrief(
    params: { date?: string; timezone?: string },
    ctx: ServiceContext,
  ) {
    const tz = params.timezone ?? DEFAULT_TIMEZONE;
    const now = new Date();

    // Calculate date boundaries in the user's timezone
    // We use the provided date or today
    let dayStart: Date;
    let dayEnd: Date;
    let yesterdayStart: Date;
    let yesterdayEnd: Date;

    if (params.date) {
      dayStart = new Date(params.date + 'T00:00:00');
      dayEnd = new Date(params.date + 'T23:59:59.999');
      const prevDay = new Date(dayStart);
      prevDay.setDate(prevDay.getDate() - 1);
      yesterdayStart = new Date(prevDay.toISOString().split('T')[0]! + 'T00:00:00');
      yesterdayEnd = new Date(prevDay.toISOString().split('T')[0]! + 'T23:59:59.999');
    } else {
      // Use current date
      const todayStr = now.toISOString().split('T')[0]!;
      dayStart = new Date(todayStr + 'T00:00:00');
      dayEnd = new Date(todayStr + 'T23:59:59.999');
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0]!;
      yesterdayStart = new Date(yStr + 'T00:00:00');
      yesterdayEnd = new Date(yStr + 'T23:59:59.999');
    }

    const userId = new mongoose.Types.ObjectId(ctx.userId);

    // Run all queries in parallel
    const [events, dueTasks, overdueTasks, blockedTasks, yesterdayUnfinished, allActiveTasks] =
      await Promise.all([
        // Today's events (scheduled appointments)
        Item.find({
          ownerId: userId,
          type: 'event',
          startAt: { $gte: dayStart, $lte: dayEnd },
        })
          .sort({ startAt: 1 })
          .lean(),

        // Tasks due today
        Item.find({
          ownerId: userId,
          type: { $in: ['task', 'subtask'] },
          status: { $nin: ['done', 'cancelled'] },
          dueAt: { $gte: dayStart, $lte: dayEnd },
        })
          .sort({ priority: 1, dueAt: 1 })
          .lean(),

        // Overdue tasks
        Item.find({
          ownerId: userId,
          type: { $in: ['task', 'subtask'] },
          status: { $nin: ['done', 'cancelled'] },
          dueAt: { $lt: dayStart },
        })
          .sort({ dueAt: 1 })
          .lean(),

        // Blocked tasks
        Item.find({
          ownerId: userId,
          type: { $in: ['task', 'subtask'] },
          status: 'blocked',
        })
          .sort({ priority: 1 })
          .lean(),

        // Yesterday's unfinished (due yesterday, not done)
        Item.find({
          ownerId: userId,
          type: { $in: ['task', 'subtask'] },
          status: { $nin: ['done', 'cancelled'] },
          dueAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
        })
          .sort({ priority: 1 })
          .lean(),

        // All active tasks for focus scoring
        Item.find({
          ownerId: userId,
          type: { $in: ['task', 'subtask'] },
          status: { $in: ['todo', 'in_progress'] },
        })
          .sort({ priority: 1, dueAt: 1 })
          .limit(50)
          .lean(),
      ]);

    // Batch-fetch parent titles for all items
    const allItems = [
      ...events,
      ...dueTasks,
      ...overdueTasks,
      ...blockedTasks,
      ...yesterdayUnfinished,
      ...allActiveTasks,
    ];
    const parentIds = [...new Set(allItems.filter(i => i.parentId).map(i => i.parentId!.toString()))];
    const parents =
      parentIds.length > 0
        ? await Item.find({ _id: { $in: parentIds.map(id => new mongoose.Types.ObjectId(id)) } }).lean()
        : [];
    const parentMap = new Map(parents.map(p => [p._id.toString(), p['title'] as string]));

    const getParentTitle = (doc: Record<string, unknown>) =>
      doc['parentId'] ? parentMap.get(String(doc['parentId'])) ?? null : null;

    // Compute focus suggestions (top 3 by score, excluding blocked)
    const scored = allActiveTasks
      .map(t => ({ doc: t, score: computeFocusScore(t as Record<string, unknown>) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // Fetch blocker reasons for blocked tasks
    const blockedItemIds = blockedTasks.map(t => t._id);
    const activeBlockers =
      blockedItemIds.length > 0
        ? await Blocker.find({
            itemId: { $in: blockedItemIds },
            resolvedAt: null,
          }).lean()
        : [];
    const blockerMap = new Map(activeBlockers.map(b => [b.itemId.toString(), b.reason]));

    // Build human-readable summary
    const parts: string[] = [];
    const dateStr = params.date ?? now.toISOString().split('T')[0]!;

    if (events.length > 0) {
      parts.push(`📅 ${events.length} event${events.length > 1 ? 's' : ''} today`);
    }
    if (dueTasks.length > 0) {
      parts.push(`📋 ${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due today`);
    }
    if (overdueTasks.length > 0) {
      parts.push(`⚠️ ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`);
    }
    if (blockedTasks.length > 0) {
      parts.push(`🚫 ${blockedTasks.length} blocked task${blockedTasks.length > 1 ? 's' : ''}`);
    }
    if (yesterdayUnfinished.length > 0) {
      parts.push(
        `📌 ${yesterdayUnfinished.length} unfinished from yesterday`,
      );
    }
    if (scored.length > 0) {
      parts.push(
        `🎯 Top focus: ${scored.map(s => `"${(s.doc as Record<string, unknown>)['title']}"`).join(', ')}`,
      );
    }

    const summary =
      parts.length > 0
        ? `Daily brief for ${dateStr} (${tz}):\n${parts.join('\n')}`
        : `Daily brief for ${dateStr} (${tz}): No items scheduled. A clean slate!`;

    log.info(
      {
        userId: ctx.userId,
        date: dateStr,
        events: events.length,
        due: dueTasks.length,
        overdue: overdueTasks.length,
        blocked: blockedTasks.length,
      },
      'Daily brief generated',
    );

    return {
      date: dateStr,
      timezone: tz,
      events: events.map(e => toSummary(e as Record<string, unknown>, getParentTitle(e as Record<string, unknown>))),
      dueTasks: dueTasks.map(t => toSummary(t as Record<string, unknown>, getParentTitle(t as Record<string, unknown>))),
      overdueTasks: overdueTasks.map(t => toSummary(t as Record<string, unknown>, getParentTitle(t as Record<string, unknown>))),
      blockedTasks: blockedTasks.map(t => {
        const s = toSummary(t as Record<string, unknown>, getParentTitle(t as Record<string, unknown>));
        return { ...s, blockerReason: blockerMap.get(t._id.toString()) ?? null };
      }),
      yesterdayUnfinished: yesterdayUnfinished.map(t =>
        toSummary(t as Record<string, unknown>, getParentTitle(t as Record<string, unknown>)),
      ),
      suggestedFocus: scored.map(s =>
        toSummary(s.doc as Record<string, unknown>, getParentTitle(s.doc as Record<string, unknown>)),
      ),
      summary,
    };
  },
};
