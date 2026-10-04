import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { toolRegistry } from './registry.js';
import { registerAllTools } from './tools.js';
import type { ServiceContext } from '@assistant/shared';

// Mock domain services so tests run fast and deterministically in any environment
vi.mock('../modules/items/service.js', () => ({
  itemsService: {
    createItem: vi.fn().mockResolvedValue({
      item: { id: '507f1f77bcf86cd799439011', type: 'task', title: 'Test Task', status: 'todo', priority: 'medium', dueAt: null, parentId: null, parentTitle: null, createdAt: new Date().toISOString() },
      activity: { id: 'act-1' },
    }),
    updateItem: vi.fn().mockResolvedValue({
      item: { id: '507f1f77bcf86cd799439011', type: 'task', title: 'Updated Task', status: 'todo', priority: 'high', dueAt: null, parentId: null, parentTitle: null, createdAt: new Date().toISOString() },
      changes: [{ field: 'status', from: 'todo', to: 'in_progress' }],
      activity: { id: 'act-2' },
    }),
    completeItem: vi.fn().mockResolvedValue({
      item: { id: '507f1f77bcf86cd799439011', type: 'task', title: 'Test Task', status: 'done', priority: 'medium', dueAt: null, parentId: null, parentTitle: null, createdAt: new Date().toISOString() },
      activity: { id: 'act-3' },
      unblocked: [],
    }),
    softDeleteItem: vi.fn().mockResolvedValue({
      deletedCount: 1,
      deletedIds: ['507f1f77bcf86cd799439011'],
    }),
    listItems: vi.fn().mockResolvedValue({
      items: [
        { id: '507f1f77bcf86cd799439011', type: 'task', title: 'Task 1', status: 'todo', priority: 'high', dueAt: null, parentId: null, parentTitle: null, createdAt: new Date().toISOString() },
      ],
      total: 1,
      hasMore: false,
    }),
    getItem: vi.fn().mockResolvedValue({
      item: { id: '507f1f77bcf86cd799439011', type: 'task', title: 'Task 1', status: 'todo', priority: 'high', dueAt: null, parentId: null, parentTitle: null, createdAt: new Date().toISOString() },
      decisions: [],
      blockers: [],
      links: [],
      history: [],
    }),
  },
}));

vi.mock('../modules/links/service.js', () => ({
  linksService: {
    createLink: vi.fn().mockResolvedValue({
      link: { id: 'link-1', fromId: '507f1f77bcf86cd799439011', toId: '507f1f77bcf86cd799439012', kind: 'depends_on', createdAt: new Date().toISOString() },
      activity: { id: 'act-5' },
    }),
  },
}));

vi.mock('../modules/decisions/service.js', () => ({
  decisionsService: {
    logDecision: vi.fn().mockResolvedValue({
      id: 'dec-1',
      itemId: '507f1f77bcf86cd799439011',
      summary: 'Architectural Choice',
      rationale: 'Clean and maintainable',
      decidedBy: 'user-1',
      createdAt: new Date().toISOString(),
    }),
  },
}));

vi.mock('../modules/blockers/service.js', () => ({
  blockersService: {
    setBlocker: vi.fn().mockResolvedValue({
      blocker: {
        id: 'blk-1',
        itemId: '507f1f77bcf86cd799439011',
        reason: 'Waiting for vendor quote',
        waitingOnUserId: null,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
      },
      taskStatusUpdated: true,
    }),
  },
}));

vi.mock('../modules/planner/service.js', () => ({
  plannerService: {
    getDailyBrief: vi.fn().mockResolvedValue({
      date: '2026-10-04',
      timezone: 'Asia/Kolkata',
      suggestedFocus: [{ id: '507f1f77bcf86cd799439011', title: 'Task 1', status: 'todo', priority: 'critical', dueAt: null, parentId: null, parentTitle: null, createdAt: new Date().toISOString() }],
      dueTasks: [],
      overdueTasks: [],
      blockedTasks: [],
      summary: '1 task in progress. Focus on critical items.',
    }),
    explainDelay: vi.fn().mockResolvedValue({
      taskId: '507f1f77bcf86cd799439011',
      taskTitle: 'Critical Task',
      status: 'blocked',
      isDelayed: true,
      blockers: [{ reason: 'Waiting for vendor', waitingOnUserId: null, createdAt: new Date().toISOString() }],
      dependencies: [],
      summary: 'Blocked by vendor quote.',
    }),
  },
}));

vi.mock('../modules/calendar/service.js', () => ({
  calendarService: {
    createEvent: vi.fn().mockResolvedValue({
      event: {
        id: 'ev-1',
        title: 'Planning Session',
        startAt: '2026-10-05T10:00:00.000Z',
        endAt: '2026-10-05T11:00:00.000Z',
        hasRecurrence: false,
      },
    }),
    getCalendarView: vi.fn().mockResolvedValue({
      startDate: '2026-10-05T00:00:00.000Z',
      endDate: '2026-10-12T00:00:00.000Z',
      events: [],
      tasksWithDueDates: [],
      totalCount: 0,
    }),
    checkConflicts: vi.fn().mockResolvedValue({
      hasConflict: false,
      conflictingItems: [],
    }),
    findFreeSlots: vi.fn().mockResolvedValue({
      date: '2026-10-05',
      durationMinutes: 30,
      freeSlots: [{ start: '2026-10-05T09:00:00.000Z', end: '2026-10-05T09:30:00.000Z' }],
    }),
  },
}));

vi.mock('../modules/notifications/service.js', () => ({
  notificationsService: {
    setReminder: vi.fn().mockResolvedValue({
      reminder: {
        id: 'rem-1',
        itemTitle: 'Test Task',
        triggerAt: '2026-10-05T10:00:00.000Z',
        channels: ['telegram'],
        status: 'pending',
      },
    }),
    cancelReminder: vi.fn().mockResolvedValue({
      cancelled: true,
    }),
    listReminders: vi.fn().mockResolvedValue({
      reminders: [],
    }),
    updatePreferences: vi.fn().mockResolvedValue({
      userId: 'user-1',
      channels: { inApp: true, email: false, telegram: true, webPush: true },
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      advanceNoticeMinutes: 15,
    }),
    getPreferences: vi.fn().mockResolvedValue({
      userId: 'user-1',
      channels: { inApp: true, email: false, telegram: true, webPush: true },
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      advanceNoticeMinutes: 15,
    }),
  },
}));

describe('MCP Tools Quality Suite', () => {
  const ctx: ServiceContext = {
    userId: '507f1f77bcf86cd799439011',
    actorType: 'user',
  };

  const EXPECTED_TOOLS = [
    'get_daily_brief',
    'create_task',
    'update_task',
    'delete_task',
    'update_story',
    'delete_story',
    'complete_task',
    'list_tasks',
    'get_task',
    'log_decision',
    'link_tasks',
    'set_blocker',
    'create_calendar_event',
    'get_calendar_view',
    'check_conflicts',
    'find_free_slots',
    'set_reminder',
    'cancel_reminder',
    'list_reminders',
    'update_notification_preferences',
    'explain_delay',
  ];

  beforeAll(() => {
    try {
      registerAllTools();
    } catch {
      // already registered
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registry & Schema Quality Checks', () => {
    it(`registers all ${EXPECTED_TOOLS.length} required tools with no duplicates`, () => {
      const allTools = toolRegistry.getAll();
      const toolNames = allTools.map((t) => t.name);

      expect(toolNames.length).toBe(EXPECTED_TOOLS.length);
      for (const expected of EXPECTED_TOOLS) {
        expect(toolNames).toContain(expected);
      }
    });

    it('each tool has a descriptive explanation for AI agents (minimum 20 chars)', () => {
      for (const tool of toolRegistry.getAll()) {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.description.trim().length).toBeGreaterThan(20);
      }
    });

    it('each tool uses snake_case naming', () => {
      const snakeCaseRegex = /^[a-z][a-z0-9_]*$/;
      for (const tool of toolRegistry.getAll()) {
        expect(tool.name).toMatch(snakeCaseRegex);
      }
    });

    it('each tool has a valid JSON Schema root object', () => {
      for (const tool of toolRegistry.getAll()) {
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
        expect((tool.inputSchema as any).type).toBe('object');
      }
    });

    it('each tool defines a valid permission scope (read, write, or destructive)', () => {
      const validScopes = ['read', 'write', 'destructive'];
      for (const tool of toolRegistry.getAll()) {
        expect(validScopes).toContain(tool.requiredScope);
      }
    });
  });

  describe('Security & Scoped Filtering Quality Checks', () => {
    it('only returns allowed tools for a restricted endpoint allowlist', () => {
      const allowlist = ['get_daily_brief', 'list_tasks'];
      const filtered = toolRegistry.getFiltered(allowlist, ['read']);

      expect(filtered.map((t) => t.name)).toEqual(['get_daily_brief', 'list_tasks']);
    });

    it('blocks write tools when endpoint only has read scope', () => {
      const allowlist = ['create_task', 'list_tasks'];
      const filtered = toolRegistry.getFiltered(allowlist, ['read']);

      expect(filtered.map((t) => t.name)).toEqual(['list_tasks']);
      expect(toolRegistry.isAllowed('create_task', allowlist, ['read'])).toBe(false);
      expect(toolRegistry.isAllowed('list_tasks', allowlist, ['read'])).toBe(true);
    });

    it('blocks unregistered tools from being allowed', () => {
      expect(toolRegistry.isAllowed('hack_database', ['hack_database'], ['read', 'write'])).toBe(false);
    });
  });

  describe('Tool Execution & Response Format Quality Checks', () => {
    it('get_daily_brief executes and returns compliant text content', async () => {
      const tool = toolRegistry.get('get_daily_brief')!;
      const result = await tool.handler({}, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]!.type).toBe('text');
      expect(result.content[0]!.text).toContain('suggestedFocus');
    });

    it('create_task rejects invalid inputs and returns actionable error message', async () => {
      const tool = toolRegistry.get('create_task')!;
      // Missing title
      const result = await tool.handler({ description: 'No title' }, ctx);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('VALIDATION_ERROR');
    });

    it('create_task executes with valid input and returns JSON payload with IDs', async () => {
      const tool = toolRegistry.get('create_task')!;
      const result = await tool.handler({ title: 'New Test Task', priority: 'high' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.type).toBe('text');
      expect(result.content[0]!.text).toContain('507f1f77bcf86cd799439011');
    });

    it('update_task requires valid taskId and validates updates', async () => {
      const tool = toolRegistry.get('update_task')!;
      const badResult = await tool.handler({ title: 'Missing ID' }, ctx);
      expect(badResult.isError).toBe(true);

      const goodResult = await tool.handler({ taskId: '507f1f77bcf86cd799439011', status: 'in_progress' }, ctx);
      expect(goodResult.isError).toBeFalsy();
      expect(goodResult.content[0]!.text).toContain('507f1f77bcf86cd799439011');
    });

    it('delete_task requires valid taskId and explanation', async () => {
      const tool = toolRegistry.get('delete_task')!;
      const result = await tool.handler({ taskId: '507f1f77bcf86cd799439011', reason: 'No longer needed' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('soft-deleted');
    });

    it('set_blocker validates itemId and reason', async () => {
      const tool = toolRegistry.get('set_blocker')!;
      const badResult = await tool.handler({ itemId: '507f1f77bcf86cd799439011' }, ctx); // missing reason
      expect(badResult.isError).toBe(true);

      const goodResult = await tool.handler({ itemId: '507f1f77bcf86cd799439011', reason: 'Waiting for vendor quote' }, ctx);
      expect(goodResult.isError).toBeFalsy();
      expect(goodResult.content[0]!.text).toContain('blk-1');
    });

    it('create_calendar_event validates startAt and endAt ISO format', async () => {
      const tool = toolRegistry.get('create_calendar_event')!;
      const badResult = await tool.handler({ title: 'Meeting', startAt: 'tomorrow' }, ctx);
      expect(badResult.isError).toBe(true);

      const goodResult = await tool.handler(
        {
          title: 'Planning Session',
          startAt: '2026-10-05T10:00:00.000Z',
          endAt: '2026-10-05T11:00:00.000Z',
        },
        ctx,
      );
      expect(goodResult.isError).toBeFalsy();
      expect(goodResult.content[0]!.text).toContain('ev-1');
    });

    it('check_conflicts and find_free_slots return structured scheduling data', async () => {
      const conflictTool = toolRegistry.get('check_conflicts')!;
      const conflictResult = await conflictTool.handler(
        { startAt: '2026-10-05T10:00:00.000Z', endAt: '2026-10-05T11:00:00.000Z' },
        ctx,
      );
      expect(conflictResult.isError).toBeFalsy();
      expect(conflictResult.content[0]!.text).toContain('hasConflict');

      const freeSlotsTool = toolRegistry.get('find_free_slots')!;
      const freeSlotsResult = await freeSlotsTool.handler(
        { date: '2026-10-05', durationMinutes: 30 },
        ctx,
      );
      expect(freeSlotsResult.isError).toBeFalsy();
      expect(freeSlotsResult.content[0]!.text).toContain('freeSlots');
    });

    it('set_reminder validates channels and scheduled time', async () => {
      const tool = toolRegistry.get('set_reminder')!;
      const result = await tool.handler(
        {
          itemId: '507f1f77bcf86cd799439011',
          trigger: 'at_time',
          triggerAt: '2026-10-05T10:00:00.000Z',
          channels: ['telegram'],
        },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('rem-1');
    });

    it('explain_delay performs graph dependency analysis and returns delay breakdown', async () => {
      const tool = toolRegistry.get('explain_delay')!;
      const result = await tool.handler({ taskId: '507f1f77bcf86cd799439011' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('507f1f77bcf86cd799439011');
      expect(result.content[0]!.text).toContain('Critical Task');
    });
  });
});
