/**
 * Planner Agent Core Service — high-level intelligence tools.
 *
 * get_context  : Unified project snapshot (replaces 5-8 round-trips)
 * get_critical_path: Bottleneck identification via dependency graph
 * next_action  : Single highest-leverage recommended action
 * verify       : State assertion before claiming something is done
 * search       : Structured + text search across all entities
 *
 * These are read-only analytics — no mutations here.
 */
import mongoose from 'mongoose';
import { Item } from '../items/model.js';
import { Blocker } from '../blockers/model.js';
import { Decision } from '../decisions/model.js';
import { Link } from '../links/model.js';
import { Constraint, Unknown } from '../constraints/model.js';
import { createModuleLogger } from '../../config/index.js';
import {
  DEFAULT_TIMEZONE,
  PRIORITY_WEIGHTS,
  type ServiceContext,
  type ItemSummary,
  type ItemPriority,
  type GetContextInput,
  type GetContextOutput,
  type GetCriticalPathInput,
  type GetCriticalPathOutput,
  type NextActionInput,
  type NextActionOutput,
  type VerifyInput,
  type VerifyOutput,
  type SearchInput,
  type SearchOutput,
} from '@assistant/shared';

const log = createModuleLogger('planner-agent');

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

function daysUntil(date: Date | undefined | null): number | null {
  if (!date) return null;
  const diff = date.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function computeUrgencyScore(doc: Record<string, unknown>): number {
  let score = 0;
  const priority = doc['priority'] as ItemPriority;
  score += (PRIORITY_WEIGHTS[priority] ?? 1) * 10;
  const dueAt = doc['dueAt'] as Date | undefined;
  if (dueAt) {
    const hoursUntilDue = (dueAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue < 0) score += 50;
    else if (hoursUntilDue < 24) score += 30;
    else if (hoursUntilDue < 72) score += 15;
    else if (hoursUntilDue < 168) score += 5;
  }
  if (doc['status'] === 'blocked') score -= 100;
  return score;
}

export const plannerAgentService = {

  /**
   * get_context: Unified project snapshot.
   * Single aggregation that replaces: list_tasks + get_task * N + get_daily_brief +
   * list_decisions + explain_delay.
   */
  async getContext(params: GetContextInput, ctx: ServiceContext): Promise<GetContextOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    const now = new Date();

    // 1. Resolve goal (if goalId provided)
    let goalDoc: Record<string, unknown> | null = null;
    let goalObjectId: mongoose.Types.ObjectId | null = null;
    let storyIds: mongoose.Types.ObjectId[] = [];
    let itemScopeFilter: Record<string, unknown> = { ownerId: userId, deletedAt: null };

    if (params.goalId) {
      goalObjectId = new mongoose.Types.ObjectId(params.goalId);
      const rawGoal = await Item.findOne({ _id: goalObjectId, ownerId: userId, deletedAt: null }).lean();
      if (!rawGoal) {
        throw new Error(`Goal ${params.goalId} not found`);
      }
      goalDoc = rawGoal as Record<string, unknown>;

      // Get all stories under this goal
      const stories = await Item.find({
        parentId: goalObjectId,
        type: 'story',
        ownerId: userId,
        deletedAt: null,
      }).lean();

      storyIds = stories.map(s => (s['_id'] as mongoose.Types.ObjectId));
      const storyIdStrings = storyIds.map(id => id);

      // Scope: tasks under those stories + the stories themselves
      itemScopeFilter = {
        ownerId: userId,
        deletedAt: null,
        $or: [
          { _id: goalObjectId },
          { parentId: goalObjectId },
          { parentId: { $in: storyIdStrings } },
        ],
      };
    }

    // 2. Fetch all relevant items
    const allItems = await Item.find(itemScopeFilter)
      .sort({ priority: -1, dueAt: 1 })
      .lean();

    const workItems = allItems.filter(it => it['type'] !== 'goal' && it['type'] !== 'event');

    // Progress metrics
    const total = workItems.length;
    const done = workItems.filter(it => it['status'] === 'done').length;
    const inProgress = workItems.filter(it => it['status'] === 'in_progress').length;
    const blocked = workItems.filter(it => it['status'] === 'blocked').length;
    const overdue = workItems.filter(it => {
      const dueAt = it['dueAt'] as Date | undefined;
      return dueAt && dueAt < now && it['status'] !== 'done' && it['status'] !== 'cancelled';
    }).length;

    // 3. Fetch active blockers for all items in scope
    const workItemIds = workItems.map(it => it['_id'] as mongoose.Types.ObjectId);
    const activeBlockers = workItemIds.length > 0
      ? await Blocker.find({ itemId: { $in: workItemIds }, resolvedAt: null }).lean()
      : [];

    const blockersByItemId = new Map<string, typeof activeBlockers>();
    for (const b of activeBlockers) {
      const key = b.itemId.toString();
      if (!blockersByItemId.has(key)) blockersByItemId.set(key, []);
      blockersByItemId.get(key)!.push(b);
    }

    // 4. Build item summaries with context
    function buildTaskWithContext(it: Record<string, unknown>) {
      const itemIdStr = (it['_id'] as mongoose.Types.ObjectId).toString();
      const itemBlockers = blockersByItemId.get(itemIdStr) ?? [];
      const dueAt = it['dueAt'] as Date | undefined;
      const overdueDays = dueAt && dueAt < now && it['status'] !== 'done'
        ? Math.floor((now.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        ...toSummary(it),
        overdueDays,
        blockers: itemBlockers.map(b => ({
          id: b._id.toString(),
          reason: b.reason,
          waitingOnName: b.waitingOnName ?? null,
          followUpAt: b.followUpAt ? b.followUpAt.toISOString() : null,
          deadline: b.deadline ? b.deadline.toISOString() : null,
          daysPending: Math.floor((now.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        })),
        decisions: [] as Array<{ id: string; summary: string; createdAt: string }>,
      };
    }

    const activeTasks = workItems
      .filter(it => it['status'] === 'in_progress' || it['status'] === 'todo')
      .filter(it => it['status'] !== 'blocked')
      .slice(0, params.depth === 'full' ? 100 : 10)
      .map(it => buildTaskWithContext(it as Record<string, unknown>));

    const blockedTasks = workItems
      .filter(it => it['status'] === 'blocked')
      .map(it => buildTaskWithContext(it as Record<string, unknown>));

    const overdueTasks = workItems
      .filter(it => {
        const dueAt = it['dueAt'] as Date | undefined;
        return dueAt && dueAt < now && it['status'] !== 'done' && it['status'] !== 'cancelled';
      })
      .map(it => buildTaskWithContext(it as Record<string, unknown>));

    // 5. Recent decisions (for goal or global)
    let recentDecisions: GetContextOutput['recentDecisions'] = [];
    if (params.includeDecisions) {
      const decisionFilter: Record<string, unknown> = { decidedBy: userId };
      if (goalObjectId && storyIds.length > 0) {
        decisionFilter['itemId'] = { $in: [...storyIds, goalObjectId, ...workItemIds] };
      }
      const decisions = await Decision.find(decisionFilter)
        .sort({ createdAt: -1 })
        .limit(params.depth === 'full' ? 20 : 5)
        .lean();

      // Get item titles for decisions
      const decisionItemIds = decisions.filter(d => d.itemId).map(d => d.itemId);
      const decisionItems = decisionItemIds.length > 0
        ? await Item.find({ _id: { $in: decisionItemIds } }).lean()
        : [];
      const decisionItemMap = new Map(decisionItems.map(it => [(it['_id'] as mongoose.Types.ObjectId).toString(), it['title'] as string]));

      recentDecisions = decisions.map(d => ({
        id: d._id.toString(),
        summary: d.summary,
        rationale: d.rationale,
        createdAt: d.createdAt.toISOString(),
        itemTitle: decisionItemMap.get(d.itemId?.toString() ?? '') ?? null,
      }));
    }

    // 6. Constraints + Unknowns
    let constraints: GetContextOutput['constraints'] = [];
    let unknowns: GetContextOutput['unknowns'] = [];

    if (params.includeConstraints) {
      const cFilter: Record<string, unknown> = { ownerId: userId };
      if (goalObjectId) {
        cFilter['$or'] = [{ goalId: goalObjectId }, { goalId: { $exists: false } }];
      }
      const cs = await Constraint.find(cFilter).lean();
      constraints = cs.map(c => ({
        id: c._id.toString(),
        type: c.type,
        value: c.value,
        description: c.description,
      }));
    }

    if (params.includeUnknowns) {
      const uFilter: Record<string, unknown> = { ownerId: userId, resolvedAt: null };
      if (goalObjectId) {
        uFilter['$or'] = [{ goalId: goalObjectId }, { goalId: { $exists: false } }];
      }
      const us = await Unknown.find(uFilter).lean();
      unknowns = us.map(u => ({
        id: u._id.toString(),
        title: u.title,
        description: u.description ?? null,
      }));
    }

    // 7. WaitingFor (blockers with external person)
    let waitingFor: GetContextOutput['waitingFor'] = [];
    if (params.includeWaitingFor && activeBlockers.length > 0) {
      const waitingBlockers = activeBlockers.filter(
        b => b.waitingOnName || b.waitingOnUserId,
      );
      for (const b of waitingBlockers) {
        const item = workItems.find(
          it => (it['_id'] as mongoose.Types.ObjectId).toString() === b.itemId.toString()
        );
        if (!item) continue;
        waitingFor.push({
          blockerId: b._id.toString(),
          itemId: b.itemId.toString(),
          itemTitle: item['title'] as string,
          waitingOnName: b.waitingOnName ?? `User:${b.waitingOnUserId}`,
          reason: b.reason,
          daysPending: Math.floor((now.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
          followUpAt: b.followUpAt ? b.followUpAt.toISOString() : null,
          deadline: b.deadline ? b.deadline.toISOString() : null,
        });
      }
    }

    // 8. Compute nextRecommendedAction
    const actionableTasks = workItems.filter(
      it => it['status'] !== 'blocked' && it['status'] !== 'done' && it['status'] !== 'cancelled',
    );
    let nextRecommendedAction: GetContextOutput['nextRecommendedAction'] = null;

    if (actionableTasks.length > 0) {
      const scored = actionableTasks
        .map(it => ({ it: it as Record<string, unknown>, score: computeUrgencyScore(it as Record<string, unknown>) }))
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      if (top) {
        const topItem = top.it;
        const dueAt = topItem['dueAt'] as Date | undefined;
        const daysLeft = daysUntil(dueAt);
        const priority = topItem['priority'] as ItemPriority;
        const prioMap: Record<ItemPriority, 'critical' | 'high' | 'medium' | 'low'> = {
          critical: 'critical', high: 'high', medium: 'medium', low: 'low', none: 'low',
        };

        let reason = `Highest priority actionable task`;
        if (daysLeft !== null && daysLeft < 0) reason = `OVERDUE by ${Math.abs(daysLeft)} day(s)`;
        else if (daysLeft !== null && daysLeft <= 2) reason = `Due in ${daysLeft} day(s) — act now`;
        else if (daysLeft !== null && daysLeft <= 7) reason = `Due in ${daysLeft} days`;

        nextRecommendedAction = {
          action: `Work on: "${topItem['title']}"`,
          targetId: (topItem['_id'] as mongoose.Types.ObjectId).toString(),
          priority: prioMap[priority] ?? 'medium',
          reason,
          estimatedMinutes: (topItem['estimateMin'] as number | undefined) ?? null,
        };
      }
    } else if (blockedTasks.length > 0 && activeBlockers.length > 0) {
      // No actionable tasks — try to unblock something
      const urgentBlocker = activeBlockers[0];
      nextRecommendedAction = {
        action: `Resolve blocker: "${urgentBlocker!.reason}"`,
        targetId: urgentBlocker!.itemId.toString(),
        priority: 'high',
        reason: 'All active tasks are blocked. Resolving this will unlock progress.',
        estimatedMinutes: null,
      };
    }

    // 9. Risk signals
    const risks: string[] = [];
    if (overdue > 0) risks.push(`⚠️ ${overdue} task(s) are overdue`);
    if (unknowns.length > 0) risks.push(`❓ ${unknowns.length} unresolved unknown(s) may block progress`);
    if (waitingFor.length > 0) {
      const overdueDeadlines = waitingFor.filter(w => w.deadline && new Date(w.deadline) < now);
      if (overdueDeadlines.length > 0) {
        risks.push(`🚨 ${overdueDeadlines.length} waiting-for item(s) have passed their deadline`);
      } else {
        risks.push(`⏳ Waiting on ${waitingFor.length} external response(s)`);
      }
    }
    constraints.forEach(c => {
      if (c.type === 'budget' || c.type === 'deadline') {
        risks.push(`📌 Constraint: ${c.description} (${c.value})`);
      }
    });

    // 10. Summary text
    const goalTitle = goalDoc ? (goalDoc['title'] as string) : 'All Projects';
    const percentComplete = total > 0 ? Math.round((done / total) * 100) : 0;
    const summaryParts = [
      `📊 Context for "${goalTitle}": ${percentComplete}% complete (${done}/${total} tasks done).`,
    ];
    if (overdue > 0) summaryParts.push(`⚠️ ${overdue} overdue.`);
    if (blocked > 0) summaryParts.push(`🚫 ${blocked} blocked.`);
    if (unknowns.length > 0) summaryParts.push(`❓ ${unknowns.length} open unknowns.`);
    if (waitingFor.length > 0) summaryParts.push(`⏳ Waiting on ${waitingFor.length} response(s).`);
    if (nextRecommendedAction) summaryParts.push(`🎯 Next: ${nextRecommendedAction.action}`);

    const goalDaysUntilDue = goalDoc
      ? daysUntil((goalDoc['dueAt'] as Date | undefined) ?? null)
      : null;

    log.info({ userId: ctx.userId, goalId: params.goalId, total, done }, 'Context generated');

    return {
      generatedAt: now.toISOString(),
      goal: goalDoc
        ? {
            id: (goalDoc['_id'] as mongoose.Types.ObjectId).toString(),
            title: goalDoc['title'] as string,
            status: goalDoc['status'] as string,
            priority: goalDoc['priority'] as string,
            dueAt: goalDoc['dueAt'] ? (goalDoc['dueAt'] as Date).toISOString() : null,
            daysUntilDue: goalDaysUntilDue,
          }
        : null,
      progress: { total, done, inProgress, blocked, overdue, percentComplete },
      activeTasks,
      blockedTasks,
      overdueTasks,
      recentDecisions,
      constraints,
      unknowns,
      waitingFor,
      nextRecommendedAction,
      risks,
      summary: summaryParts.join(' '),
    };
  },

  /**
   * get_critical_path: Find the longest blocking dependency chain.
   * The bottleneck is the task that, if unblocked, would unlock the most downstream work.
   */
  async getCriticalPath(params: GetCriticalPathInput, ctx: ServiceContext): Promise<GetCriticalPathOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    const goalObjectId = new mongoose.Types.ObjectId(params.goalId);

    const goal = await Item.findOne({ _id: goalObjectId, ownerId: userId, deletedAt: null }).lean();
    if (!goal) throw new Error(`Goal ${params.goalId} not found`);

    // Get all items under goal (stories + tasks)
    const stories = await Item.find({
      parentId: goalObjectId,
      ownerId: userId,
      deletedAt: null,
    }).lean();

    const storyIds = stories.map(s => s['_id'] as mongoose.Types.ObjectId);
    const tasks = await Item.find({
      parentId: { $in: storyIds },
      ownerId: userId,
      deletedAt: null,
      status: { $nin: ['done', 'cancelled'] },
    }).lean();

    const allWorkIds = [...storyIds, ...tasks.map(t => t['_id'] as mongoose.Types.ObjectId)];

    if (allWorkIds.length === 0) {
      return {
        goalId: params.goalId,
        goalTitle: goal['title'] as string,
        criticalPath: [],
        bottleneck: null,
        summary: 'No active tasks found under this goal.',
      };
    }

    // Get all dependency links between these items
    const links = await Link.find({
      $or: [
        { fromId: { $in: allWorkIds }, kind: 'depends_on' },
        { fromId: { $in: allWorkIds }, kind: 'blocks' },
      ],
    }).lean();

    // Build adjacency: item → items it unlocks (downstream)
    const unlocksMap = new Map<string, Set<string>>();
    const blockedByMap = new Map<string, Set<string>>();

    for (const link of links) {
      const from = link.fromId.toString();
      const to = link.toId.toString();

      if (link.kind === 'depends_on') {
        // from depends_on to → "to" blocks "from"
        if (!unlocksMap.has(to)) unlocksMap.set(to, new Set());
        unlocksMap.get(to)!.add(from);
        if (!blockedByMap.has(from)) blockedByMap.set(from, new Set());
        blockedByMap.get(from)!.add(to);
      } else if (link.kind === 'blocks') {
        // from blocks to
        if (!unlocksMap.has(from)) unlocksMap.set(from, new Set());
        unlocksMap.get(from)!.add(to);
        if (!blockedByMap.has(to)) blockedByMap.set(to, new Set());
        blockedByMap.get(to)!.add(from);
      }
    }

    // Find active blockers
    const activeBlockerItemIds = await Blocker.distinct('itemId', {
      itemId: { $in: allWorkIds },
      resolvedAt: null,
    });
    const hardBlockedIds = new Set(activeBlockerItemIds.map((id: mongoose.Types.ObjectId) => id.toString()));

    // Build critical path nodes
    const allItems = [...stories, ...tasks];
    const itemMap = new Map(
      allItems.map(it => [(it['_id'] as mongoose.Types.ObjectId).toString(), it as Record<string, unknown>]),
    );

    // Count total downstream tasks each item unlocks (transitive)
    function countDownstream(itemId: string, visited = new Set<string>()): number {
      if (visited.has(itemId)) return 0;
      visited.add(itemId);
      const downstream = unlocksMap.get(itemId) ?? new Set<string>();
      let count = downstream.size;
      for (const d of downstream) {
        count += countDownstream(d, visited);
      }
      return count;
    }

    const pathNodes = allItems
      .filter(it => {
        // Include items that either block others or are blocked by others
        const id = (it['_id'] as mongoose.Types.ObjectId).toString();
        return unlocksMap.has(id) || blockedByMap.has(id) || hardBlockedIds.has(id);
      })
      .map(it => {
        const id = (it['_id'] as mongoose.Types.ObjectId).toString();
        const unlocksCount = countDownstream(id);
        const blockedBy = Array.from(blockedByMap.get(id) ?? []);
        const isBottleneck = unlocksCount > 0 && (hardBlockedIds.has(id) || blockedByMap.has(id));

        return {
          id,
          title: it['title'] as string,
          status: it['status'] as string,
          priority: it['priority'] as string,
          dueAt: it['dueAt'] ? (it['dueAt'] as Date).toISOString() : null,
          isBottleneck,
          blockedBy,
          unlocksCount,
        };
      })
      .sort((a, b) => b.unlocksCount - a.unlocksCount);

    // The bottleneck = item with most downstream tasks that is currently stuck
    const bottleneckNode = pathNodes.find(n => n.isBottleneck && n.status !== 'done');
    const bottleneck = bottleneckNode
      ? {
          id: bottleneckNode.id,
          title: bottleneckNode.title,
          reason: hardBlockedIds.has(bottleneckNode.id)
            ? `Has active blockers. Resolving this unblocks ${bottleneckNode.unlocksCount} downstream task(s).`
            : `Incomplete prerequisite. Completing this unblocks ${bottleneckNode.unlocksCount} downstream task(s).`,
        }
      : null;

    const summary = bottleneck
      ? `🎯 Critical bottleneck: "${bottleneck.title}". ${bottleneck.reason}`
      : pathNodes.length > 0
        ? `Critical path has ${pathNodes.length} interdependent tasks. No single bottleneck identified.`
        : 'No dependency chains found — tasks are independent.';

    log.info({ goalId: params.goalId, pathLength: pathNodes.length }, 'Critical path computed');

    return {
      goalId: params.goalId,
      goalTitle: goal['title'] as string,
      criticalPath: pathNodes.slice(0, 20),
      bottleneck,
      summary,
    };
  },

  /**
   * next_action: Compute the single highest-leverage next action.
   */
  async getNextAction(params: NextActionInput, ctx: ServiceContext): Promise<NextActionOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    const now = new Date();

    const itemFilter: Record<string, unknown> = {
      ownerId: userId,
      deletedAt: null,
      status: { $in: ['todo', 'in_progress'] },
      type: { $nin: ['goal', 'event'] },
    };

    if (params.goalId) {
      const goalObjectId = new mongoose.Types.ObjectId(params.goalId);
      const stories = await Item.find({ parentId: goalObjectId, type: 'story', ownerId: userId, deletedAt: null }).lean();
      const storyIds = stories.map(s => s['_id'] as mongoose.Types.ObjectId);
      itemFilter['$or'] = [
        { parentId: goalObjectId },
        { parentId: { $in: storyIds } },
      ];
    }

    const candidates = await Item.find(itemFilter).lean();

    if (candidates.length === 0) {
      return {
        recommendation: null,
        considered: 0,
        summary: 'No actionable tasks found. Everything is either done, blocked, or cancelled.',
      };
    }

    // Score each candidate
    const scored = candidates
      .map(it => ({ it: it as Record<string, unknown>, score: computeUrgencyScore(it as Record<string, unknown>) }))
      .sort((a, b) => b.score - a.score);

    const top = scored[0]!;
    const topItem = top.it;
    const dueAt = topItem['dueAt'] as Date | undefined;
    const days = daysUntil(dueAt);
    const priority = topItem['priority'] as ItemPriority;
    const prioMap: Record<ItemPriority, 'critical' | 'high' | 'medium' | 'low'> = {
      critical: 'critical', high: 'high', medium: 'medium', low: 'low', none: 'low',
    };

    const reasons: string[] = [];
    if (days !== null && days < 0) reasons.push(`Overdue by ${Math.abs(days)} day(s)`);
    else if (days !== null && days <= 1) reasons.push(`Due ${days === 0 ? 'today' : 'tomorrow'}`);
    else if (days !== null && days <= 7) reasons.push(`Due in ${days} days`);
    reasons.push(`Priority: ${priority}`);
    if (topItem['status'] === 'in_progress') reasons.push('Already in progress — continue momentum');

    log.info({ userId: ctx.userId, topTaskId: topItem['_id'] }, 'Next action computed');

    return {
      recommendation: {
        action: `Work on: "${topItem['title']}"`,
        targetId: (topItem['_id'] as mongoose.Types.ObjectId).toString(),
        targetTitle: topItem['title'] as string,
        priority: prioMap[priority] ?? 'medium',
        reason: reasons,
        estimatedMinutes: (topItem['estimateMin'] as number | undefined) ?? null,
      },
      considered: candidates.length,
      summary: `Out of ${candidates.length} actionable tasks, "${topItem['title']}" is the highest priority. ${reasons.join('. ')}.`,
    };
  },

  /**
   * verify: Assert the current state of a task or goal against a claim.
   */
  async verify(params: VerifyInput, ctx: ServiceContext): Promise<VerifyOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let verified = false;
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let reason = '';
    let currentState: Record<string, unknown> | null = null;

    if (params.taskId) {
      const item = await Item.findOne({
        _id: new mongoose.Types.ObjectId(params.taskId),
        ownerId: userId,
        deletedAt: null,
      }).lean();

      if (!item) {
        reason = `Task ${params.taskId} not found or deleted.`;
        return { claim: params.claim, verified: false, confidence: 'high', reason, currentState: null, evidence, contradictions };
      }

      currentState = {
        id: (item['_id'] as mongoose.Types.ObjectId).toString(),
        title: item['title'],
        status: item['status'],
        priority: item['priority'],
        dueAt: item['dueAt'] ? (item['dueAt'] as Date).toISOString() : null,
      };

      // Check expected status if provided
      if (params.expectedStatus) {
        if (item['status'] === params.expectedStatus) {
          evidence.push(`Task status is "${item['status']}" as expected.`);
          verified = true;
          confidence = 'high';
          reason = `Task "${item['title']}" has status "${item['status']}" which matches the expected status "${params.expectedStatus}".`;
        } else {
          contradictions.push(`Task status is "${item['status']}", not "${params.expectedStatus}".`);
          verified = false;
          confidence = 'high';
          reason = `Task "${item['title']}" is "${item['status']}", NOT "${params.expectedStatus}" as claimed.`;
        }
      } else {
        // Fuzzy check: try to match claim text to task state
        const claim = params.claim.toLowerCase();
        const titleMatch = (item['title'] as string).toLowerCase().includes(claim.split(' ')[0] ?? '');

        if (claim.includes('done') || claim.includes('complete') || claim.includes('finished')) {
          if (item['status'] === 'done') {
            verified = true; confidence = 'high';
            evidence.push(`Task status is "done".`);
            reason = `Task "${item['title']}" is confirmed done.`;
          } else {
            verified = false; confidence = 'high';
            contradictions.push(`Task is "${item['status']}", not done.`);
            reason = `Task "${item['title']}" is NOT done — current status: ${item['status']}.`;
          }
        } else if (claim.includes('blocked')) {
          if (item['status'] === 'blocked') {
            verified = true; confidence = 'high';
            const blockers = await Blocker.find({ itemId: item['_id'], resolvedAt: null }).lean();
            evidence.push(`Task is blocked by ${blockers.length} blocker(s).`);
            reason = `Task "${item['title']}" is confirmed blocked.`;
          } else {
            verified = false; confidence = 'high';
            contradictions.push(`Task is "${item['status']}", not blocked.`);
            reason = `Task "${item['title']}" is NOT blocked — current status: ${item['status']}.`;
          }
        } else {
          // Can't verify without more context
          confidence = 'low';
          reason = `Cannot verify claim without knowing the expected state. Current status: "${item['status']}". Please use expectedStatus parameter for precise verification.`;
        }
      }
    } else if (params.goalId) {
      // Goal-level verification
      const goal = await Item.findOne({
        _id: new mongoose.Types.ObjectId(params.goalId),
        ownerId: userId,
        deletedAt: null,
      }).lean();

      if (!goal) {
        reason = `Goal ${params.goalId} not found.`;
        return { claim: params.claim, verified: false, confidence: 'high', reason, currentState: null, evidence, contradictions };
      }

      // Get all tasks under goal
      const stories = await Item.find({ parentId: goal['_id'], type: 'story', ownerId: userId, deletedAt: null }).lean();
      const storyIds = stories.map(s => s['_id'] as mongoose.Types.ObjectId);
      const allTasks = await Item.find({
        parentId: { $in: storyIds },
        ownerId: userId,
        deletedAt: null,
        type: { $ne: 'event' },
      }).lean();

      const total = allTasks.length;
      const done = allTasks.filter(t => t['status'] === 'done').length;
      const blocked = allTasks.filter(t => t['status'] === 'blocked').length;
      const overdue = allTasks.filter(t => {
        const dueAt = t['dueAt'] as Date | undefined;
        return dueAt && dueAt < new Date() && t['status'] !== 'done';
      }).length;

      currentState = {
        goalTitle: goal['title'],
        total, done, blocked, overdue,
        percentComplete: total > 0 ? Math.round((done / total) * 100) : 0,
        goalStatus: goal['status'],
      };

      const claim = params.claim.toLowerCase();
      if (claim.includes('on track') || claim.includes('progress')) {
        if (overdue === 0 && blocked === 0) {
          verified = true; confidence = 'high';
          evidence.push(`${done}/${total} tasks done. No overdue. No blocked.`);
          reason = `Goal appears on track: ${done}/${total} tasks done, no blockers or overdue items.`;
        } else {
          verified = false; confidence = 'high';
          if (overdue > 0) contradictions.push(`${overdue} task(s) overdue.`);
          if (blocked > 0) contradictions.push(`${blocked} task(s) blocked.`);
          reason = `Goal is NOT on track. ${contradictions.join(' ')}`;
        }
      } else {
        confidence = 'medium';
        reason = `Goal "${goal['title']}": ${done}/${total} tasks done (${Math.round((done/total)*100)}%). Use a specific taskId for precise verification.`;
      }
    } else {
      confidence = 'low';
      reason = 'Provide a taskId or goalId to verify a specific claim against real data.';
    }

    return { claim: params.claim, verified, confidence, reason, currentState, evidence, contradictions };
  },

  /**
   * search: Structured + text search across Items, Decisions, Blockers, and Unknowns.
   */
  async search(params: SearchInput, ctx: ServiceContext): Promise<SearchOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    const results: SearchOutput['results'] = [];
    const query = params.query.trim();

    // Build a case-insensitive regex for text matching (fallback if no text index)
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    if (params.sources.includes('tasks')) {
      const itemFilter: Record<string, unknown> = {
        ownerId: userId,
        deletedAt: null,
        $or: [{ title: regex }, { body: regex }],
      };
      if (params.goalId) {
        const gId = new mongoose.Types.ObjectId(params.goalId);
        const stories = await Item.find({ parentId: gId, type: 'story', ownerId: userId, deletedAt: null }).lean();
        const storyIds = stories.map(s => s['_id'] as mongoose.Types.ObjectId);
        itemFilter['parentId'] = { $in: [gId, ...storyIds] };
      }

      const items = await Item.find(itemFilter).limit(params.limit).lean();
      for (const it of items) {
        const body = (it['body'] as string | undefined) ?? '';
        const excerpt = body.length > 0
          ? body.substring(0, 150) + (body.length > 150 ? '...' : '')
          : (it['title'] as string);
        results.push({
          source: 'tasks',
          id: (it['_id'] as mongoose.Types.ObjectId).toString(),
          title: it['title'] as string,
          excerpt,
          relevanceHint: `Status: ${it['status']} | Priority: ${it['priority']}`,
          itemId: (it['_id'] as mongoose.Types.ObjectId).toString(),
          createdAt: (it['createdAt'] as Date).toISOString(),
        });
      }
    }

    if (params.sources.includes('decisions')) {
      const decisions = await Decision.find({
        decidedBy: userId,
        $or: [{ summary: regex }, { rationale: regex }],
      }).limit(params.limit).lean();

      for (const d of decisions) {
        results.push({
          source: 'decisions',
          id: d._id.toString(),
          title: d.summary,
          excerpt: d.rationale.substring(0, 150) + (d.rationale.length > 150 ? '...' : ''),
          relevanceHint: 'Decision record',
          itemId: d.itemId?.toString() ?? null,
          createdAt: d.createdAt.toISOString(),
        });
      }
    }

    if (params.sources.includes('blockers')) {
      const blockers = await Blocker.find({
        resolvedAt: null,
        reason: regex,
      }).limit(params.limit).lean();

      // Filter by owner via item lookup
      const itemIds = blockers.map(b => b.itemId);
      const items = await Item.find({ _id: { $in: itemIds }, ownerId: userId }).lean();
      const ownedIds = new Set(items.map(it => (it['_id'] as mongoose.Types.ObjectId).toString()));

      for (const b of blockers) {
        if (!ownedIds.has(b.itemId.toString())) continue;
        const item = items.find(it => (it['_id'] as mongoose.Types.ObjectId).toString() === b.itemId.toString());
        results.push({
          source: 'blockers',
          id: b._id.toString(),
          title: `Blocker: ${b.reason}`,
          excerpt: b.waitingOnName ? `Waiting on: ${b.waitingOnName}` : b.reason,
          relevanceHint: `Active blocker on "${item?.title ?? 'Unknown task'}"`,
          itemId: b.itemId.toString(),
          createdAt: b.createdAt.toISOString(),
        });
      }
    }

    if (params.sources.includes('unknowns')) {
      const unknowns = await Unknown.find({
        ownerId: userId,
        resolvedAt: null,
        $or: [{ title: regex }, { description: regex }],
      }).limit(params.limit).lean();

      for (const u of unknowns) {
        results.push({
          source: 'unknowns',
          id: u._id.toString(),
          title: `Unknown: ${u.title}`,
          excerpt: u.description?.substring(0, 150) ?? u.title,
          relevanceHint: 'Unresolved unknown',
          itemId: null,
          createdAt: u.createdAt.toISOString(),
        });
      }
    }

    // Sort by recency
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const trimmed = results.slice(0, params.limit);

    log.info({ userId: ctx.userId, query, resultCount: trimmed.length }, 'Search completed');

    return {
      query,
      results: trimmed,
      total: trimmed.length,
      summary: trimmed.length > 0
        ? `Found ${trimmed.length} result(s) for "${query}" across ${params.sources.join(', ')}.`
        : `No results found for "${query}". Try different keywords.`,
    };
  },
};
