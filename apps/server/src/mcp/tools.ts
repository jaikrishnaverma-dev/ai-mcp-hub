/**
 * P1 MCP Tool definitions — the 9 tools for the Daily Assistant endpoint.
 *
 * Each tool: validate input (Zod) → call service → format response.
 * No business logic here — that's in the service layer.
 *
 * Tools:
 * 1. get_daily_brief (read)
 * 2. create_task (write)
 * 3. update_task (write)
 * 4. complete_task (write)
 * 5. list_tasks (read)
 * 6. get_task (read)
 * 7. log_decision (write)
 * 8. link_tasks (write)
 * 9. set_blocker (write)
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  createTaskInput,
  updateTaskInput,
  deleteTaskInput,
  completeTaskInput,
  listTasksInput,
  getTaskInput,
  getDailyBriefInput,
  logDecisionInput,
  createLinkInput,
  setBlockerInput,
  createEventInput,
  getCalendarViewInput,
  checkConflictsInput,
  findFreeSlotsInput,
  setReminderInput,
  cancelReminderInput,
  listRemindersInput,
  updateNotificationPrefsInput,
  explainDelayInput,
} from '@assistant/shared';
import { toolRegistry, type McpToolResult } from './registry.js';
import { itemsService } from '../modules/items/service.js';
import { linksService } from '../modules/links/service.js';
import { decisionsService } from '../modules/decisions/service.js';
import { blockersService } from '../modules/blockers/service.js';
import { plannerService } from '../modules/planner/service.js';
import { calendarService } from '../modules/calendar/service.js';
import { notificationsService } from '../modules/notifications/service.js';
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
      throw err; // Re-throw unexpected errors
    }
  };
}

/**
 * Register all Phase 1 tools.
 */
export function registerP1Tools(): void {
  // --- 1. get_daily_brief ---
  toolRegistry.register({
    name: 'get_daily_brief',
    description:
      'Get your daily brief: today\'s events, due and overdue tasks, blocked items, ' +
      'yesterday\'s unfinished work, and top suggested focus items. ' +
      'Call this at the start of every conversation to understand the current state.',
    inputSchema: zodToJsonSchema(getDailyBriefInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getDailyBriefInput.parse(args);
      const brief = await plannerService.getDailyBrief(input, ctx);
      return {
        content: [{ type: 'text', text: JSON.stringify(brief, null, 2) }],
      };
    }),
  });

  // --- 2. create_task ---
  toolRegistry.register({
    name: 'create_task',
    description:
      'Create a new task, story, subtask, or goal. Optionally group it under a parent item (task, story, or goal) via parentId. ' +
      'Set priority (critical/high/medium/low/none) and deadline (dueAt as ISO 8601). ' +
      'Include a reason to record WHY this task was created.',
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

  // --- 3. update_task ---
  toolRegistry.register({
    name: 'update_task',
    description:
      'Update an existing task\'s fields: title, description, status, priority, dueAt, estimateMin. ' +
      'Include a reason to record WHY the change was made. ' +
      'Returns the updated task and a diff of what changed.',
    inputSchema: zodToJsonSchema(updateTaskInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = updateTaskInput.parse(args);
      const result = await itemsService.updateItem(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Task "${result.item.title}" updated. Changed: ${result.changes.map(c => c.field).join(', ')}.`,
              task: result.item,
              changes: result.changes,
              activityId: result.activity.id,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 4. complete_task ---
  toolRegistry.register({
    name: 'complete_task',
    description:
      'Mark a task as done. If other tasks depended on this one, they may be automatically unblocked. ' +
      'Returns the completed task and a list of any newly unblocked items.',
    inputSchema: zodToJsonSchema(completeTaskInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = completeTaskInput.parse(args);
      const result = await itemsService.completeItem(input.taskId, input.reason, ctx);
      const msg = result.unblocked.length > 0
        ? `Task "${result.item.title}" completed! ${result.unblocked.length} item(s) unblocked: ${result.unblocked.map(u => u.title).join(', ')}.`
        : `Task "${result.item.title}" completed!`;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: msg,
              task: result.item,
              unblocked: result.unblocked,
              activityId: result.activity.id,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 5. list_tasks ---
  toolRegistry.register({
    name: 'list_tasks',
    description:
      'List tasks with optional filters: status, priority, parentId (story), dueBefore, dueAfter. ' +
      'Returns compact summaries (no full body). Paginated with limit/offset. ' +
      'Default limit: 20, max: 50.',
    inputSchema: zodToJsonSchema(listTasksInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = listTasksInput.parse(args);
      const result = await itemsService.listItems(
        { type: 'task', ...input },
        ctx,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Found ${result.total} task(s). Showing ${result.items.length}.`,
              ...result,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 6. get_task ---
  toolRegistry.register({
    name: 'get_task',
    description:
      'Get full details of a task: description, parent goal/story, all decisions, ' +
      'blockers, links (dependencies), and activity history. ' +
      'Use this when you need the full context for a specific task.',
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
              message: `Full details for "${result.item.title}".`,
              ...result,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 7. log_decision ---
  toolRegistry.register({
    name: 'log_decision',
    description:
      'Record a decision with its rationale on any item. ' +
      'Example: "Chose Studio X because of price and availability." ' +
      'Decisions are first-class objects that persist across conversations.',
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

  // --- 8. link_tasks ---
  toolRegistry.register({
    name: 'link_tasks',
    description:
      'Create a relationship between two items. ' +
      'Kinds: depends_on (A needs B done first), blocks (A prevents B), ' +
      'relates_to (loose association), mentions (reference). ' +
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
              message: `Linked: "${result.link.fromTitle}" ${result.link.kind} "${result.link.toTitle}"`,
              link: result.link,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 9. set_blocker ---
  toolRegistry.register({
    name: 'set_blocker',
    description:
      'Record why a task is blocked and optionally who it\'s waiting on. ' +
      'This will set the task status to "blocked" if it isn\'t already. ' +
      'Example: "Waiting for Ankit to confirm guest count."',
    inputSchema: zodToJsonSchema(setBlockerInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = setBlockerInput.parse(args);
      const result = await blockersService.setBlocker(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Blocker set: "${result.blocker.reason}"${result.taskStatusUpdated ? ' (task status changed to blocked)' : ''}`,
              blocker: result.blocker,
              taskStatusUpdated: result.taskStatusUpdated,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 10. delete_task ---
  toolRegistry.register({
    name: 'delete_task',
    description:
      'Soft-delete a task and all its subtasks. Can be recovered later. ' +
      'Include a reason explaining WHY the task was deleted.',
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
              message: `Task ${input.taskId} soft-deleted (${result.deletedCount} items total including descendants).`,
              deletedCount: result.deletedCount,
              deletedIds: result.deletedIds,
            }, null, 2),
          },
        ],
      };
    }),
  });
}

/**
 * Register all Phase 2 tools (Calendar, Notifications/Reminders, Dependency/Delay Analysis).
 */
export function registerP2Tools(): void {
  // --- 11. create_calendar_event ---
  toolRegistry.register({
    name: 'create_calendar_event',
    description:
      'Schedule a calendar event or appointment with startAt, endAt, and optional recurrence (rrule). ' +
      'Events appear on the calendar and daily brief. Provide a reason to explain why.',
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
              message: `Event "${result.event.title}" scheduled from ${result.event.startAt} to ${result.event.endAt}.`,
              event: result.event,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 12. get_calendar_view ---
  toolRegistry.register({
    name: 'get_calendar_view',
    description:
      'Get calendar events within a date range (startDate to endDate in ISO 8601). ' +
      'Recurring events (RRULE) are automatically expanded into their individual occurrences.',
    inputSchema: zodToJsonSchema(getCalendarViewInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = getCalendarViewInput.parse(args);
      const result = await calendarService.getCalendarView(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }),
  });

  // --- 13. check_conflicts ---
  toolRegistry.register({
    name: 'check_conflicts',
    description:
      'Check for scheduling overlaps and time conflicts between calendar events. ' +
      'Can check across a date window or for a specific event.',
    inputSchema: zodToJsonSchema(checkConflictsInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = checkConflictsInput.parse(args);
      const result = await calendarService.checkConflicts(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }),
  });

  // --- 14. find_free_slots ---
  toolRegistry.register({
    name: 'find_free_slots',
    description:
      'Find available free time slots on a given date during working hours (default 9am - 6pm). ' +
      'Specify desired duration in minutes (e.g., 30 or 60).',
    inputSchema: zodToJsonSchema(findFreeSlotsInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = findFreeSlotsInput.parse(args);
      const result = await calendarService.findFreeSlots(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }),
  });

  // --- 15. set_reminder ---
  toolRegistry.register({
    name: 'set_reminder',
    description:
      'Set an alert / reminder for an item (e.g. 15 minutes before due date, or at an exact datetime). ' +
      'Dispatches via web push, telegram, and/or email.',
    inputSchema: zodToJsonSchema(setReminderInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = setReminderInput.parse(args);
      const result = await notificationsService.setReminder(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Reminder set for "${result.reminder.itemTitle}" at ${result.reminder.triggerAt}.`,
              reminder: result.reminder,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 16. cancel_reminder ---
  toolRegistry.register({
    name: 'cancel_reminder',
    description:
      'Cancel an upcoming scheduled reminder by reminderId.',
    inputSchema: zodToJsonSchema(cancelReminderInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = cancelReminderInput.parse(args);
      const result = await notificationsService.cancelReminder(input.reminderId, input.reason, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Reminder ${input.reminderId} cancelled.`,
              cancelled: result.cancelled,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 17. list_reminders ---
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
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }),
  });

  // --- 18. update_notification_preferences ---
  toolRegistry.register({
    name: 'update_notification_preferences',
    description:
      'Configure notification channels (web_push, telegram, email), quiet hours, and alert types.',
    inputSchema: zodToJsonSchema(updateNotificationPrefsInput) as Record<string, unknown>,
    requiredScope: 'write',
    handler: wrapHandler(async (args, ctx) => {
      const input = updateNotificationPrefsInput.parse(args);
      await notificationsService.updatePreferences(input, ctx);
      const prefs = await notificationsService.getPreferences(ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: 'Notification preferences updated.',
              preferences: prefs,
            }, null, 2),
          },
        ],
      };
    }),
  });

  // --- 19. explain_delay ---
  toolRegistry.register({
    name: 'explain_delay',
    description:
      'Analyze why a task is delayed or blocked. Performs dependency graph traversal (using $graphLookup) ' +
      'to pinpoint root-cause blockers, overdue prerequisites, and suggests actionable next steps.',
    inputSchema: zodToJsonSchema(explainDelayInput) as Record<string, unknown>,
    requiredScope: 'read',
    handler: wrapHandler(async (args, ctx) => {
      const input = explainDelayInput.parse(args);
      const result = await plannerService.explainDelay(input, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }),
  });
}

/**
 * Register all Phase 1 and Phase 2 tools.
 */
export function registerAllTools(): void {
  registerP1Tools();
  registerP2Tools();
}
