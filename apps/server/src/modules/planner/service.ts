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
import { Link } from '../links/model.js';
import { NotFoundError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import {
  DEFAULT_TIMEZONE,
  PRIORITY_WEIGHTS,
  type ServiceContext,
  type ItemSummary,
  type ItemPriority,
  type ExplainDelayOutput,
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

  /**
   * Explain delay for a task using dependency traversal and blocker lookup.
   * Uses MongoDB $graphLookup on links to find all upstream blockers.
   */
  async explainDelay(
    params: { taskId: string },
    ctx: ServiceContext,
  ): Promise<ExplainDelayOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    let taskObjectId: mongoose.Types.ObjectId;
    try {
      taskObjectId = new mongoose.Types.ObjectId(params.taskId);
    } catch {
      throw new NotFoundError('Task', params.taskId);
    }

    const task = await Item.findOne({
      _id: taskObjectId,
      ownerId: userId,
      deletedAt: null,
    }).lean();

    if (!task) {
      throw new NotFoundError('Task', params.taskId);
    }

    // Direct blockers
    const directBlockers = await Blocker.find({
      itemId: taskObjectId,
      resolvedAt: null,
    }).lean();

    // Upstream dependency traversal via $graphLookup
    // 1. depends_on links where this task is the source (fromId)
    const dependsOnResults = await Link.aggregate([
      { $match: { fromId: taskObjectId, kind: 'depends_on' } },
      {
        $graphLookup: {
          from: 'links',
          startWith: '$toId',
          connectFromField: 'toId',
          connectToField: 'fromId',
          as: 'chain',
          maxDepth: 20,
          restrictSearchWithMatch: { kind: 'depends_on' },
        },
      },
    ]);

    // 2. blocks links targeting this task (toId)
    const blocksResults = await Link.aggregate([
      { $match: { toId: taskObjectId, kind: 'blocks' } },
      {
        $graphLookup: {
          from: 'links',
          startWith: '$fromId',
          connectFromField: 'fromId',
          connectToField: 'toId',
          as: 'chain',
          maxDepth: 20,
          restrictSearchWithMatch: { kind: 'blocks' },
        },
      },
    ]);

    const upstreamIds = new Set<string>();
    for (const r of dependsOnResults) {
      upstreamIds.add(r['toId'].toString());
      if (Array.isArray(r['chain'])) {
        for (const c of r['chain']) {
          upstreamIds.add(c['toId'].toString());
        }
      }
    }
    for (const r of blocksResults) {
      upstreamIds.add(r['fromId'].toString());
      if (Array.isArray(r['chain'])) {
        for (const c of r['chain']) {
          upstreamIds.add(c['fromId'].toString());
        }
      }
    }

    const upstreamObjectIds = Array.from(upstreamIds).map(id => new mongoose.Types.ObjectId(id));
    const upstreamItems =
      upstreamObjectIds.length > 0
        ? await Item.find({ _id: { $in: upstreamObjectIds }, deletedAt: null }).lean()
        : [];

    const now = new Date();
    const isTaskOverdue =
      task.dueAt
        ? new Date(task.dueAt) < now && task.status !== 'done' && task.status !== 'cancelled'
        : false;
    const isTaskBlocked = task.status === 'blocked' || directBlockers.length > 0;

    const rootCauses: string[] = [];
    if (isTaskOverdue) {
      rootCauses.push(
        `Task was due on ${new Date(task.dueAt!).toISOString().split('T')[0]} and is still ${task.status}.`,
      );
    }
    for (const b of directBlockers) {
      rootCauses.push(
        `Direct blocker: ${b.reason}${b.waitingOnUserId ? ` (waiting on ${b.waitingOnUserId.toString()})` : ''}`,
      );
    }

    const dependenciesList = upstreamItems.map(dep => {
      const depDueAt = dep.dueAt ? new Date(dep.dueAt) : null;
      const isDepOverdue = depDueAt ? depDueAt < now && dep.status !== 'done' : false;
      const isDepBlocking = dep.status !== 'done' && dep.status !== 'cancelled';
      if (isDepBlocking) {
        rootCauses.push(
          `Prerequisite task "${dep.title}" is ${dep.status}${isDepOverdue ? ' (OVERDUE)' : ''}.`,
        );
      }
      return {
        id: dep._id.toString(),
        title: dep.title as string,
        status: dep.status as string,
        dueAt: depDueAt ? depDueAt.toISOString() : null,
        isDelayed: isDepOverdue || dep.status === 'blocked',
        relation: 'prerequisite',
      };
    });

    const isDelayed =
      isTaskOverdue ||
      isTaskBlocked ||
      dependenciesList.some(d => d.isDelayed || d.status !== 'done');

    let delayReason = 'On track — no delays or blocking dependencies detected.';
    if (isDelayed) {
      if (isTaskBlocked) {
        delayReason = `Task is directly blocked by ${directBlockers.length} blocker(s).`;
      } else if (isTaskOverdue) {
        delayReason = 'Task is overdue.';
      } else {
        delayReason = 'Task is waiting on unfinished prerequisite tasks.';
      }
    }

    let recommendation = 'No action required; task is on track.';
    if (directBlockers.length > 0) {
      recommendation = `Resolve active blockers: ${directBlockers.map(b => `"${b.reason}"`).join('; ')}`;
    } else if (dependenciesList.some(d => d.status !== 'done')) {
      const unfinished = dependenciesList.filter(d => d.status !== 'done');
      recommendation = `Complete prerequisite task(s) first: ${unfinished.map(u => `"${u.title}" (${u.status})`).join(', ')}`;
    } else if (isTaskOverdue) {
      recommendation = 'Task is overdue; re-estimate priority or reschedule due date.';
    }

    const summary = [
      `📊 Delay Analysis for: "${task.title}" [${task.status}]`,
      `Status: ${isDelayed ? '⚠️ DELAYED' : '✅ ON TRACK'}`,
      `Reason: ${delayReason}`,
      rootCauses.length > 0 ? `\nRoot causes:\n${rootCauses.map(r => `• ${r}`).join('\n')}` : '',
      `\nRecommendation: ${recommendation}`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      taskId: task._id.toString(),
      title: task.title as string,
      status: task.status as string,
      dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
      isDelayed,
      delayReason,
      directBlockers: directBlockers.map(b => ({
        id: b._id.toString(),
        reason: b.reason,
        waitingOn: b.waitingOnUserId ? b.waitingOnUserId.toString() : null,
        createdAt: b.createdAt.toISOString(),
      })),
      dependencies: dependenciesList,
      rootCauses,
      recommendation,
      summary,
    };
  },
};
