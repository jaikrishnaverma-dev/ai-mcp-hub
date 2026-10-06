/**
 * MCP Tool definitions — Consolidated Agent Architecture (24 Tools).
 *
 * Each tool: validate input (Zod) → call service → format response.
 *
 * Consolidated Toolset:
 * - Task & Item Management: create_task, update_task, delete_task, list_tasks, get_task, link_tasks
 * - Planning & Reasoning: get_daily_brief, get_context, get_critical_path, verify, search, explain_delay
 * - Knowledge & Ground Truth: manage_constraints, list_constraints, manage_unknowns, list_unknowns, log_decision, list_decisions
 * - Calendar & Scheduling: create_calendar_event, get_calendar
 * - Notifications & Alerts: manage_reminders, list_reminders, update_notification_preferences
 * - Audit Trail: get_journal
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodError } from 'zod';
import {
  createTaskInput,
  updateTaskInput,
  deleteTaskInput,
  listTasksInput,
  getTaskInput,
  getDailyBriefInput,
  createLinkInput,
  explainDelayInput,
  getContextInput,
  getCriticalPathInput,
  verifyInput,
  searchInput,
  manageConstraintsInput,
  listConstraintsInput,
  manageUnknownsInput,
  listUnknownsInput,
  logDecisionInput,
  listDecisionsInput,
  createEventInput,
  getCalendarInput,
  manageRemindersInput,
  listRemindersInput,
  updateNotificationPrefsInput,
  getJournalInput,
} from '@assistant/shared';
import { plannerAgentService } from '../modules/planner/agent-service.js';
import { constraintsService } from '../modules/constraints/service.js';
import { toolRegistry, type McpToolResult } from './registry.js';
import { itemsService } from '../modules/items/service.js';
import { linksService } from '../modules/links/service.js';
import { decisionsService } from '../modules/decisions/service.js';
import { plannerService } from '../modules/planner/service.js';
import { calendarService } from '../modules/calendar/service.js';
import { notificationsService } from '../modules/notifications/service.js';
import { activityService } from '../modules/activity/service.js';
import { AppError } from '../errors.js';
import type { ServiceContext } from '@assistant/shared';

/**
 * Wrap a handler to catch errors and format them as MCP error responses.
 */
function wrapHandler(
  handler: (args: Record<string, unknown>, ctx: ServiceContext) => Promise<McpToolResult>,
): (args: Record<string, unknown>, ctx: ServiceContext) => Promise<McpToolResult> {
  return async (args, ctx) => {
    try {
      return await handler(args, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'VALIDATION_ERROR',
                message: 'Invalid tool arguments',
                issues: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof AppError) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: err.code,
                message: err.message,
                ...(('details' in err) ? { details: (err as Record<string, unknown>)['details'] } : {}),
                ...(('candidates' in err) ? { candidates: (err as Record<string, unknown>)['candidates'] } : {}),
                ...(('confirmToken' in err) ? { confirmToken: (err as Record<string, unknown>)['confirmToken'], consequences: (err as Record<string, unknown>)['consequences'] } : {}),
              }),
            },
          ],
          isError: true,
        };
      }
      throw err;
    }
  };
}

// ─── 1. Core Task & Item Management ──────────────────────────────────────────

function registerItemTools(): void {
  // 1. create_task
  toolRegistry.register({
    name: 'create_task',
    description:
      'Create a new task, story, subtask, or goal. Group under a parent via parentId. ' +
      'Set priority (critical/high/medium/low/none) and deadline (dueAt as ISO 8601). ' +
      'Include a reason explaining WHY this task was created.',
    inputSchema: zodToJsonSchema(createTaskInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = createTaskInput.parse(args);
      const result = await itemsService.createItem(
        { ...input, type: input.type || 'task', description: input.description },
        ctx,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `${result.item.type.charAt(0).toUpperCase() + result.item.type.slice(1)} "${result.item.title}" created successfully.`,
              task: result.item,
              activityId: result.activity.id,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 2. update_task (Universal updater: fields + status transitions + blockers)
  toolRegistry.register({
    name: 'update_task',
    description:
      'Update any task, story, goal, or subtask. ' +
      'Change status (todo, in_progress, blocked, done, cancelled), title, description, priority, dueAt, or estimateMin. ' +
      'Setting status to "done" automatically unblocks dependent tasks. ' +
      'Setting status to "blocked" records the blockerReason and optional waitingOnName/deadline. ' +
      'Setting status to "in_progress" or "todo" automatically clears active blockers. ' +
      'Include a reason explaining WHY the update was made.',
    inputSchema: zodToJsonSchema(updateTaskInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = updateTaskInput.parse(args);
      const result = await itemsService.updateItem(input, ctx);
      const unblockedMsg = result.unblocked && result.unblocked.length > 0
        ? ` ${result.unblocked.length} dependent task(s) unblocked: ${result.unblocked.map(u => u.title).join(', ')}.`
        : '';
      const blockerMsg = result.blocker
        ? ` Recorded blocker: "${result.blocker['reason']}".`
        : '';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `${result.item.type.charAt(0).toUpperCase() + result.item.type.slice(1)} "${result.item.title}" updated.${unblockedMsg}${blockerMsg}`,
              item: result.item,
              task: result.item,
              changes: result.changes,
              unblocked: result.unblocked ?? [],
              ...(result.blocker ? { blocker: result.blocker } : {}),
              activityId: result.activity.id,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 3. delete_task (Universal soft-delete for tasks, stories, goals, subtasks)
  toolRegistry.register({
    name: 'delete_task',
    description:
      'Soft-delete a task, story, goal, or subtask and all its children. Can be recovered later. ' +
      'Works for both tasks and user stories. Include a reason explaining WHY the item was deleted.',
    inputSchema: zodToJsonSchema(deleteTaskInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = deleteTaskInput.parse(args);
      const result = await itemsService.softDeleteItem(input.taskId, input.reason, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Item ${input.taskId} soft-deleted (${result.deletedCount} items total including descendants).`,
              deletedCount: result.deletedCount,
              deletedIds: result.deletedIds,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 4. list_tasks
  toolRegistry.register({
    name: 'list_tasks',
    description:
      'List tasks or stories with optional filters: type (task, story, goal, subtask), status, priority, parentId, dueBefore, dueAfter. ' +
      'Returns compact summaries. Paginated with limit/offset.',
    inputSchema: zodToJsonSchema(listTasksInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = listTasksInput.parse(args);
      const result = await itemsService.listItems(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              items: result.items,
              tasks: result.items,
              total: result.total,
              hasMore: result.hasMore,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 5. get_task
  toolRegistry.register({
    name: 'get_task',
    description:
      'Get full details of a task: description, parent goal/story, all decisions, blockers, links (dependencies), and activity history.',
    inputSchema: zodToJsonSchema(getTaskInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getTaskInput.parse(args);
      const result = await itemsService.getItem(input.taskId, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              task: result.item,
              item: result.item,
              decisions: result.decisions,
              blockers: result.blockers,
              links: result.links,
              activity: result.history,
              history: result.history,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 6. link_tasks
  toolRegistry.register({
    name: 'link_tasks',
    description:
      'Create a relationship between two items. Kinds: depends_on (A needs B done first), blocks (A prevents B), relates_to, mentions. ' +
      'Dependency cycles are automatically prevented.',
    inputSchema: zodToJsonSchema(createLinkInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = createLinkInput.parse(args);
      const result = await linksService.createLink(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Link created: "${result.link.fromTitle}" ${result.link.kind} "${result.link.toTitle}"`,
              link: result.link,
              activityId: result.activity.id,
            }, null, 2),
          },
        ],
      };
    }),
  });
}

// ─── 2. Planning, Reasoning & Intelligence ────────────────────────────────────

function registerPlanningTools(): void {
  // 7. get_daily_brief
  toolRegistry.register({
    name: 'get_daily_brief',
    description:
      'Get today\'s agenda: scheduled calendar events, tasks due today, overdue tasks, blocked tasks, and top 3 suggested focus items.',
    inputSchema: zodToJsonSchema(getDailyBriefInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getDailyBriefInput.parse(args);
      const brief = await plannerService.getDailyBrief(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              date: brief.date,
              timezone: brief.timezone,
              summary: brief.summary,
              events: brief.events,
              suggestedFocus: brief.suggestedFocus,
              dueTasks: brief.dueTasks,
              overdueTasks: brief.overdueTasks,
              blockedTasks: brief.blockedTasks,
              yesterdayUnfinished: brief.yesterdayUnfinished,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 8. get_context (Unified project snapshot + next_action + waiting_for)
  toolRegistry.register({
    name: 'get_context',
    description:
      'Get a complete, unified project snapshot for a goal or all active work. ' +
      'Returns progress metrics, active/blocked/overdue tasks, decisions, constraints, unknowns, waiting-for items, risks, and next action. ' +
      'CALL THIS FIRST at the start of any planning conversation.',
    inputSchema: zodToJsonSchema(getContextInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getContextInput.parse(args);
      const result = await plannerAgentService.getContext(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 9. get_critical_path
  toolRegistry.register({
    name: 'get_critical_path',
    description:
      'Compute the critical dependency chain for a goal — find the bottleneck task that, if completed, unlocks the most downstream work.',
    inputSchema: zodToJsonSchema(getCriticalPathInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getCriticalPathInput.parse(args);
      const result = await plannerAgentService.getCriticalPath(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 10. verify
  toolRegistry.register({
    name: 'verify',
    description:
      'Assert current state against a claim before reporting it as fact. ' +
      'Returns verified (bool), confidence, evidence, and contradictions. Example: verify({ claim: "guest list is finalized", taskId: "...", expectedStatus: "done" })',
    inputSchema: zodToJsonSchema(verifyInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = verifyInput.parse(args);
      const result = await plannerAgentService.verify(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 11. search
  toolRegistry.register({
    name: 'search',
    description:
      'Search across tasks, decisions, blockers, and unknowns by keyword. Fast full-text search across all entities.',
    inputSchema: zodToJsonSchema(searchInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = searchInput.parse(args);
      const result = await plannerAgentService.search(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 12. explain_delay
  toolRegistry.register({
    name: 'explain_delay',
    description:
      'Analyze why a task is delayed or blocked using dependency graph traversal. Pinpoints root-cause blockers and suggests actionable steps.',
    inputSchema: zodToJsonSchema(explainDelayInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = explainDelayInput.parse(args);
      const result = await plannerService.explainDelay({ taskId: input.taskId }, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });
}

// ─── 3. Knowledge & Ground Truth ──────────────────────────────────────────────

function registerKnowledgeTools(): void {
  // 13. manage_constraints (Unified add + delete)
  toolRegistry.register({
    name: 'manage_constraints',
    description:
      'Record or remove non-negotiable project constraints (budget limits, hard deadlines, resource caps, preferences). ' +
      'Pass action: "add" to create, or action: "delete" with constraintId to remove.',
    inputSchema: zodToJsonSchema(manageConstraintsInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = manageConstraintsInput.parse(args);
      const result = await constraintsService.manageConstraints(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 14. list_constraints
  toolRegistry.register({
    name: 'list_constraints',
    description:
      'List all constraints for a goal or globally. Use to recall budget limits, deadlines, and rules before making decisions.',
    inputSchema: zodToJsonSchema(listConstraintsInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = listConstraintsInput.parse(args);
      const constraints = await constraintsService.listConstraints(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify({ constraints, total: constraints.length }, null, 2) }],
      };
    }),
  });

  // 15. manage_unknowns (Unified add + resolve)
  toolRegistry.register({
    name: 'manage_unknowns',
    description:
      'Track information gaps that risk the goal (action: "add") or record the verified answer when found (action: "resolve").',
    inputSchema: zodToJsonSchema(manageUnknownsInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = manageUnknownsInput.parse(args);
      const result = await constraintsService.manageUnknowns(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 16. list_unknowns
  toolRegistry.register({
    name: 'list_unknowns',
    description:
      'List all open (unresolved) unknowns for a goal or globally. Identifies missing information that blocks progress.',
    inputSchema: zodToJsonSchema(listUnknownsInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = listUnknownsInput.parse(args);
      const unknowns = await constraintsService.listUnknowns(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify({ unknowns, total: unknowns.length }, null, 2) }],
      };
    }),
  });

  // 17. log_decision
  toolRegistry.register({
    name: 'log_decision',
    description:
      'Record an architectural or planning decision with its rationale. Can be tied to a task, a goal, or project-wide.',
    inputSchema: zodToJsonSchema(logDecisionInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = logDecisionInput.parse(args);
      const result = await decisionsService.logDecision(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Decision recorded: "${result.decision.summary}"`,
              decision: result.decision,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 18. list_decisions
  toolRegistry.register({
    name: 'list_decisions',
    description:
      'List decisions recorded across tasks, goals, or the entire project. Filter by goalId, itemId, category, or status.',
    inputSchema: zodToJsonSchema(listDecisionsInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = listDecisionsInput.parse(args);
      const decisions = await decisionsService.listDecisions(input, ctx);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            decisions,
            total: decisions.length,
            summary: `Found ${decisions.length} recorded decision(s).`,
          }, null, 2),
        }],
      };
    }),
  });
}

// ─── 4. Calendar & Scheduling ─────────────────────────────────────────────────

function registerCalendarTools(): void {
  // 19. create_calendar_event
  toolRegistry.register({
    name: 'create_calendar_event',
    description:
      'Schedule a calendar event or appointment with startAt, endAt, and optional recurrence (rrule). Provide a reason to explain why.',
    inputSchema: zodToJsonSchema(createEventInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = createEventInput.parse(args);
      const result = await calendarService.createEvent(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Calendar event "${result.event.title}" scheduled.`,
              event: result.event,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // 20. get_calendar (Unified view + conflicts + free slots)
  toolRegistry.register({
    name: 'get_calendar',
    description:
      'Get calendar events for a date window. Optionally set includeConflicts: true to detect overlaps, or findFreeSlots to compute available gaps.',
    inputSchema: zodToJsonSchema(getCalendarInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getCalendarInput.parse(args);
      const result = await calendarService.getCalendar(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });
}

// ─── 5. Notifications & Reminders ─────────────────────────────────────────────

function registerNotificationTools(): void {
  // 21. manage_reminders (Unified set + cancel)
  toolRegistry.register({
    name: 'manage_reminders',
    description:
      'Schedule a reminder on an item (action: "set") or cancel an upcoming reminder by ID (action: "cancel"). Supports push, telegram, email.',
    inputSchema: zodToJsonSchema(manageRemindersInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = manageRemindersInput.parse(args);
      const result = await notificationsService.manageReminders(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 22. list_reminders
  toolRegistry.register({
    name: 'list_reminders',
    description:
      'List reminders, optionally filtered by itemId or state (pending, sent, failed, cancelled).',
    inputSchema: zodToJsonSchema(listRemindersInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = listRemindersInput.parse(args);
      const result = await notificationsService.listReminders(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }),
  });

  // 23. update_notification_preferences
  toolRegistry.register({
    name: 'update_notification_preferences',
    description:
      'Configure notification channels (web_push, telegram, email), quiet hours, and alert types.',
    inputSchema: zodToJsonSchema(updateNotificationPrefsInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = updateNotificationPrefsInput.parse(args);
      const result = await notificationsService.updatePreferences(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'Notification preferences updated successfully.',
              preferences: result,
            }, null, 2),
          },
        ],
      };
    }),
  });
}

// ─── 6. Audit Trail & Journal ─────────────────────────────────────────────────

function registerAuditTools(): void {
  // 24. get_journal
  toolRegistry.register({
    name: 'get_journal',
    description:
      'Query the immutable audit journal of actions taken on tasks and goals. Shows field diffs and recorded reasons.',
    inputSchema: zodToJsonSchema(getJournalInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getJournalInput.parse(args);
      const journal = await activityService.getJournal(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(journal, null, 2) }],
      };
    }),
  });
}

/**
 * Register all 24 consolidated tools.
 */
export function registerAllTools(): void {
  registerPlanningTools();
  registerItemTools();
  registerKnowledgeTools();
  registerCalendarTools();
  registerNotificationTools();
  registerAuditTools();
}
