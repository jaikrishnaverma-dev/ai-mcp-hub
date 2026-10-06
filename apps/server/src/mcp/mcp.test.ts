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
    listDecisions: vi.fn().mockResolvedValue([{
      id: 'dec-1',
      itemId: '507f1f77bcf86cd799439011',
      goalId: null,
      category: 'architecture',
      status: 'active',
      summary: 'Architectural Choice',
      rationale: 'Clean and maintainable',
      decidedBy: 'user-1',
      createdAt: new Date().toISOString(),
    }]),
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
    listWaitingFor: vi.fn().mockResolvedValue([{
      blockerId: 'blk-1',
      itemId: '507f1f77bcf86cd799439011',
      itemTitle: 'Book Venue',
      waitingOnName: 'Rahul',
      reason: 'Awaiting venue contract',
      daysPending: 3,
      followUpAt: '2026-10-08T10:00:00.000Z',
      deadline: '2026-10-10T10:00:00.000Z',
    }]),
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
    getCalendar: vi.fn().mockResolvedValue({
      events: [],
      tasksWithDueDates: [],
      totalCount: 0,
      conflicts: [],
      freeSlots: [],
    }),
  },
}));

vi.mock('../modules/planner/agent-service.js', () => ({
  plannerAgentService: {
    getContext: vi.fn().mockResolvedValue({
      generatedAt: new Date().toISOString(),
      goal: null,
      progress: { total: 5, done: 2, inProgress: 1, blocked: 1, overdue: 1, percentComplete: 40 },
      activeTasks: [],
      blockedTasks: [],
      overdueTasks: [],
      recentDecisions: [],
      constraints: [],
      unknowns: [],
      waitingFor: [],
      nextRecommendedAction: {
        action: 'Unblock critical task',
        targetId: '507f1f77bcf86cd799439011',
        priority: 'critical',
        reason: 'Blocking 3 dependent tasks',
        estimatedMinutes: 15,
      },
      risks: ['1 task overdue'],
      summary: '5 tasks total, 40% complete.',
    }),
    getCriticalPath: vi.fn().mockResolvedValue({
      goalId: '507f1f77bcf86cd799439011',
      goalTitle: 'Launch MVP',
      criticalPath: [],
      bottleneck: null,
      summary: 'Critical path length: 0 tasks.',
    }),
    getNextAction: vi.fn().mockResolvedValue({
      recommendation: {
        action: 'Follow up on blocker',
        targetId: '507f1f77bcf86cd799439011',
        targetTitle: 'Venue quote',
        priority: 'critical',
        reason: ['High priority', 'Due soon'],
        estimatedMinutes: 10,
      },
      considered: 5,
      summary: 'Recommended next action: Follow up on blocker',
    }),
    verify: vi.fn().mockResolvedValue({
      claim: 'Guest count finalized',
      verified: true,
      confidence: 'high',
      reason: 'Confirmed by task status done',
      currentState: { status: 'done' },
      evidence: ['Task status is done'],
      contradictions: [],
    }),
    search: vi.fn().mockResolvedValue({
      query: 'catering',
      results: [{
        source: 'tasks',
        id: '507f1f77bcf86cd799439011',
        title: 'Book catering',
        excerpt: 'Catering vendor selection',
        relevanceHint: 'Title match',
        itemId: '507f1f77bcf86cd799439011',
        createdAt: new Date().toISOString(),
      }],
      total: 1,
      summary: 'Found 1 result for "catering".',
    }),
  },
}));

vi.mock('../modules/constraints/service.js', () => ({
  constraintsService: {
    manageConstraints: vi.fn().mockResolvedValue({
      constraint: {
        id: 'c-1',
        goalId: null,
        type: 'budget',
        value: '500000 INR',
        description: 'Maximum total wedding budget',
        createdAt: new Date().toISOString(),
      },
    }),
    manageUnknowns: vi.fn().mockImplementation(async (params) => {
      if (params.action === 'resolve') {
        return {
          unknown: {
            id: params.unknownId || 'u-1',
            goalId: null,
            title: 'Final guest count',
            description: 'Need exact head count for catering',
            resolvedAt: new Date().toISOString(),
            resolvedValue: params.resolvedValue || '150 guests',
            createdAt: new Date().toISOString(),
          },
        };
      }
      return {
        unknown: {
          id: 'u-1',
          goalId: null,
          title: params.title || 'Final guest count',
          description: params.description || 'Need exact head count for catering',
          resolvedAt: null,
          resolvedValue: null,
          createdAt: new Date().toISOString(),
        },
      };
    }),
    addConstraint: vi.fn().mockResolvedValue({
      constraint: {
        id: 'c-1',
        goalId: null,
        type: 'budget',
        value: '500000 INR',
        description: 'Maximum total wedding budget',
        createdAt: new Date().toISOString(),
      },
    }),
    listConstraints: vi.fn().mockResolvedValue([{
      id: 'c-1',
      goalId: null,
      type: 'budget',
      value: '500000 INR',
      description: 'Maximum total wedding budget',
      createdAt: new Date().toISOString(),
    }]),
    deleteConstraint: vi.fn().mockResolvedValue({
      id: 'c-1',
      deleted: true,
    }),
    addUnknown: vi.fn().mockResolvedValue({
      unknown: {
        id: 'u-1',
        goalId: null,
        title: 'Final guest count',
        description: 'Need exact head count for catering',
        resolvedAt: null,
        resolvedValue: null,
        createdAt: new Date().toISOString(),
      },
    }),
    resolveUnknown: vi.fn().mockResolvedValue({
      unknown: {
        id: 'u-1',
        goalId: null,
        title: 'Final guest count',
        description: 'Need exact head count for catering',
        resolvedAt: new Date().toISOString(),
        resolvedValue: '150 guests',
        createdAt: new Date().toISOString(),
      },
    }),
    listUnknowns: vi.fn().mockResolvedValue([{
      id: 'u-1',
      goalId: null,
      title: 'Final guest count',
      description: 'Need exact head count for catering',
      resolvedAt: null,
      resolvedValue: null,
      createdAt: new Date().toISOString(),
    }]),
  },
}));

vi.mock('../modules/activity/service.js', () => ({
  activityService: {
    getJournal: vi.fn().mockResolvedValue({
      entries: [{
        id: 'act-1',
        itemId: '507f1f77bcf86cd799439011',
        itemTitle: 'Task 1',
        actorId: 'user-1',
        actorType: 'user',
        action: 'created',
        changes: [{ field: 'title', from: null, to: 'Task 1' }],
        reason: 'Initial setup',
        createdAt: new Date().toISOString(),
      }],
      total: 1,
      summary: 'Found 1 journal entries.',
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
    manageReminders: vi.fn().mockResolvedValue({
      reminder: {
        id: 'rem-1',
        itemTitle: 'Test Task',
        triggerAt: '2026-10-05T10:00:00.000Z',
        channels: ['telegram'],
        status: 'pending',
      },
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
    'create_task',
    'update_task',
    'delete_task',
    'list_tasks',
    'get_task',
    'link_tasks',
    'get_daily_brief',
    'get_context',
    'get_critical_path',
    'verify',
    'search',
    'explain_delay',
    'manage_constraints',
    'list_constraints',
    'manage_unknowns',
    'list_unknowns',
    'log_decision',
    'list_decisions',
    'create_calendar_event',
    'get_calendar',
    'manage_reminders',
    'list_reminders',
    'update_notification_preferences',
    'get_journal',
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

    it('update_task handles status transitions to done and blocked seamlessly', async () => {
      const tool = toolRegistry.get('update_task')!;
      
      // Update status to done
      const doneResult = await tool.handler({ taskId: '507f1f77bcf86cd799439011', status: 'done', reason: 'Finished' }, ctx);
      expect(doneResult.isError).toBeFalsy();
      expect(doneResult.content[0]!.text).toContain('507f1f77bcf86cd799439011');

      // Update status to blocked with blockerReason
      const blockedResult = await tool.handler({
        taskId: '507f1f77bcf86cd799439011',
        status: 'blocked',
        blockerReason: 'Waiting for vendor quote',
        waitingOnName: 'Vendor X',
      }, ctx);
      expect(blockedResult.isError).toBeFalsy();
      expect(blockedResult.content[0]!.text).toContain('507f1f77bcf86cd799439011');
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

    it('get_calendar returns structured scheduling data, events, and free slots', async () => {
      const calTool = toolRegistry.get('get_calendar')!;
      const result = await calTool.handler(
        {
          startDate: '2026-10-05T00:00:00.000Z',
          endDate: '2026-10-12T00:00:00.000Z',
          includeConflicts: true,
          findFreeSlots: { durationMinutes: 30 },
        },
        ctx,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('events');
      expect(result.content[0]!.text).toContain('totalCount');
    });

    it('manage_reminders schedules and cancels reminders', async () => {
      const tool = toolRegistry.get('manage_reminders')!;
      const setResult = await tool.handler(
        {
          action: 'set',
          itemId: '507f1f77bcf86cd799439011',
          trigger: 'at_time',
          triggerAt: '2026-10-05T10:00:00.000Z',
          channels: ['telegram'],
        },
        ctx,
      );
      expect(setResult.isError).toBeFalsy();
      expect(setResult.content[0]!.text).toContain('rem-1');

      const cancelResult = await tool.handler(
        {
          action: 'cancel',
          reminderId: '507f1f77bcf86cd799439011',
        },
        ctx,
      );
      expect(cancelResult.isError).toBeFalsy();
    });

    it('explain_delay performs graph dependency analysis and returns delay breakdown', async () => {
      const tool = toolRegistry.get('explain_delay')!;
      const result = await tool.handler({ taskId: '507f1f77bcf86cd799439011' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('507f1f77bcf86cd799439011');
      expect(result.content[0]!.text).toContain('Critical Task');
    });

    it('get_context executes and returns unified project snapshot with next action', async () => {
      const tool = toolRegistry.get('get_context')!;
      const result = await tool.handler({ depth: 'summary' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.type).toBe('text');
      expect(result.content[0]!.text).toContain('progress');
      expect(result.content[0]!.text).toContain('percentComplete');
      expect(result.content[0]!.text).toContain('nextRecommendedAction');
    });

    it('get_critical_path executes and identifies bottlenecks', async () => {
      const tool = toolRegistry.get('get_critical_path')!;
      const result = await tool.handler({ goalId: '507f1f77bcf86cd799439011' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('Launch MVP');
      expect(result.content[0]!.text).toContain('criticalPath');
    });

    it('verify executes state assertion for facts and status claims', async () => {
      const tool = toolRegistry.get('verify')!;
      const result = await tool.handler({ claim: 'Guest count finalized' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('verified');
      expect(result.content[0]!.text).toContain('confidence');
    });

    it('search performs full search across entities', async () => {
      const tool = toolRegistry.get('search')!;
      const result = await tool.handler({ query: 'catering' }, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('catering');
      expect(result.content[0]!.text).toContain('Book catering');
    });

    it('manage_constraints and list_constraints execute successfully', async () => {
      const manageTool = toolRegistry.get('manage_constraints')!;
      const addResult = await manageTool.handler({
        action: 'add',
        type: 'budget',
        value: '500000 INR',
        description: 'Maximum total wedding budget',
      }, ctx);

      expect(addResult.isError).toBeFalsy();
      expect(addResult.content[0]!.text).toContain('500000 INR');

      const listTool = toolRegistry.get('list_constraints')!;
      const listResult = await listTool.handler({}, ctx);
      expect(listResult.isError).toBeFalsy();
      expect(listResult.content[0]!.text).toContain('constraints');
    });

    it('manage_unknowns and list_unknowns execute successfully', async () => {
      const manageTool = toolRegistry.get('manage_unknowns')!;
      const addResult = await manageTool.handler({
        action: 'add',
        title: 'Final guest count',
        description: 'Need exact head count for catering',
      }, ctx);

      expect(addResult.isError).toBeFalsy();
      expect(addResult.content[0]!.text).toContain('Final guest count');

      const resolveResult = await manageTool.handler({
        action: 'resolve',
        unknownId: '507f1f77bcf86cd799439011',
        resolvedValue: '150 guests',
      }, ctx);

      expect(resolveResult.isError).toBeFalsy();
      expect(resolveResult.content[0]!.text).toContain('150 guests');

      const listTool = toolRegistry.get('list_unknowns')!;
      const listResult = await listTool.handler({}, ctx);
      expect(listResult.isError).toBeFalsy();
      expect(listResult.content[0]!.text).toContain('unknowns');
    });

    it('list_decisions returns recorded choices and rationales', async () => {
      const tool = toolRegistry.get('list_decisions')!;
      const result = await tool.handler({}, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('Architectural Choice');
    });

    it('get_journal returns audit history with diffs and reasons', async () => {
      const tool = toolRegistry.get('get_journal')!;
      const result = await tool.handler({}, ctx);

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain('entries');
      expect(result.content[0]!.text).toContain('Task 1');
    });
  });
});
