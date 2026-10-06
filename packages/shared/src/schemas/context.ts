/**
 * Zod schemas for Agent Core tools:
 * get_context, get_critical_path, next_action, verify, search, list_waiting_for
 */
import { z } from 'zod';
import { itemSummary } from './items.js';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- get_context ---

export const getContextInput = z.object({
  goalId: objectIdString.optional().describe(
    'Specific goal to get context for. Omit to get a cross-goal overview of all active work.',
  ),
  view: z.enum(['summary', 'full', 'next_action', 'waiting_for']).default('summary').describe(
    'View mode: summary (metrics + key items), full (all details), next_action (single next action), waiting_for (external blockers)',
  ),
  depth: z.enum(['summary', 'full']).default('summary').describe(
    'summary = key metrics + top items only. full = all tasks, decisions, blockers, unknowns.',
  ),
  includeDecisions: z.coerce.boolean().default(true),
  includeUnknowns: z.coerce.boolean().default(true),
  includeConstraints: z.coerce.boolean().default(true),
  includeWaitingFor: z.coerce.boolean().default(true),
});
export type GetContextInput = z.infer<typeof getContextInput>;

const taskWithContext = itemSummary.extend({
  blockers: z.array(z.object({
    id: z.string(),
    reason: z.string(),
    waitingOnName: z.string().nullable(),
    followUpAt: z.string().nullable(),
    deadline: z.string().nullable(),
    daysPending: z.number(),
  })),
  decisions: z.array(z.object({ id: z.string(), summary: z.string(), createdAt: z.string() })),
  overdueDays: z.number().nullable(),
});

export const getContextOutput = z.object({
  generatedAt: z.string(),
  goal: z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    priority: z.string(),
    dueAt: z.string().nullable(),
    daysUntilDue: z.number().nullable(),
  }).nullable(),
  progress: z.object({
    total: z.number(),
    done: z.number(),
    inProgress: z.number(),
    blocked: z.number(),
    overdue: z.number(),
    percentComplete: z.number(),
  }),
  activeTasks: z.array(taskWithContext),
  blockedTasks: z.array(taskWithContext),
  overdueTasks: z.array(taskWithContext),
  recentDecisions: z.array(z.object({
    id: z.string(),
    summary: z.string(),
    rationale: z.string(),
    createdAt: z.string(),
    itemTitle: z.string().nullable(),
  })),
  constraints: z.array(z.object({
    id: z.string(),
    type: z.string(),
    value: z.string(),
    description: z.string(),
  })),
  unknowns: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
  })),
  waitingFor: z.array(z.object({
    blockerId: z.string(),
    itemId: z.string(),
    itemTitle: z.string(),
    waitingOnName: z.string(),
    reason: z.string(),
    daysPending: z.number(),
    followUpAt: z.string().nullable(),
    deadline: z.string().nullable(),
  })),
  nextRecommendedAction: z.object({
    action: z.string(),
    targetId: z.string().nullable(),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    reason: z.string(),
    estimatedMinutes: z.number().nullable(),
  }).nullable(),
  risks: z.array(z.string()),
  summary: z.string(),
});
export type GetContextOutput = z.infer<typeof getContextOutput>;

// --- get_critical_path ---

export const getCriticalPathInput = z.object({
  goalId: objectIdString.describe('Goal to compute critical path for'),
});
export type GetCriticalPathInput = z.infer<typeof getCriticalPathInput>;

export const getCriticalPathOutput = z.object({
  goalId: z.string(),
  goalTitle: z.string(),
  criticalPath: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    priority: z.string(),
    dueAt: z.string().nullable(),
    isBottleneck: z.boolean(),
    blockedBy: z.array(z.string()),
    unlocksCount: z.number(),
  })),
  bottleneck: z.object({
    id: z.string(),
    title: z.string(),
    reason: z.string(),
  }).nullable(),
  summary: z.string(),
});
export type GetCriticalPathOutput = z.infer<typeof getCriticalPathOutput>;

// --- next_action ---

export const nextActionInput = z.object({
  goalId: objectIdString.optional().describe('Narrow to a specific goal. Omit for cross-goal recommendation.'),
});
export type NextActionInput = z.infer<typeof nextActionInput>;

export const nextActionOutput = z.object({
  recommendation: z.object({
    action: z.string(),
    targetId: z.string().nullable(),
    targetTitle: z.string().nullable(),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    reason: z.array(z.string()),
    estimatedMinutes: z.number().nullable(),
  }).nullable(),
  considered: z.number(),
  summary: z.string(),
});
export type NextActionOutput = z.infer<typeof nextActionOutput>;

// --- verify ---

export const verifyInput = z.object({
  claim: z.string().min(1).max(1000).describe('The factual claim to verify, e.g. "guest count is finalized"'),
  taskId: objectIdString.optional().describe('If checking a specific task\'s state'),
  expectedStatus: z.enum(['todo', 'in_progress', 'done', 'blocked', 'cancelled']).optional(),
  goalId: objectIdString.optional().describe('If checking goal-level completion'),
});
export type VerifyInput = z.infer<typeof verifyInput>;

export const verifyOutput = z.object({
  claim: z.string(),
  verified: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  currentState: z.record(z.unknown()).nullable(),
  evidence: z.array(z.string()),
  contradictions: z.array(z.string()),
});
export type VerifyOutput = z.infer<typeof verifyOutput>;

// --- search ---

export const searchInput = z.object({
  query: z.string().min(1).max(500).describe('What to search for'),
  sources: z.array(z.enum(['tasks', 'decisions', 'blockers', 'unknowns', 'notes'])).default(['tasks', 'decisions', 'blockers']),
  goalId: objectIdString.optional().describe('Narrow search to a specific goal'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchInput = z.infer<typeof searchInput>;

export const searchOutput = z.object({
  query: z.string(),
  results: z.array(z.object({
    source: z.string(),
    id: z.string(),
    title: z.string(),
    excerpt: z.string(),
    relevanceHint: z.string(),
    itemId: z.string().nullable(),
    createdAt: z.string(),
  })),
  total: z.number(),
  summary: z.string(),
});
export type SearchOutput = z.infer<typeof searchOutput>;

// list_waiting_for schemas are defined in blockers.ts
