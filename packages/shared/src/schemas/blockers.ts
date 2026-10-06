/**
 * Zod schemas for Blockers — reasons work can't proceed.
 *
 * A blocker records what's stuck and optionally who it's waiting on.
 * Different from a "blocked" status — the status is derived, the blocker is the reason.
 *
 * Extended for Agent Core:
 * - waitingOnName: free-text external person/entity (e.g. "Rahul", "Venue coordinator")
 * - followUpAt: when to nudge (agent reminder anchor)
 * - deadline: when we actually need the response by
 */
import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const setBlockerInput = z.object({
  itemId: objectIdString.describe('Item that is blocked'),
  reason: z.string().min(1).max(1000).describe('Why the item is blocked'),
  waitingOnUserId: objectIdString.optional().describe('System user we are waiting on, if applicable'),
  waitingOnName: z.string().max(200).optional().describe(
    'Free-text name of external person or entity we are waiting on (e.g. "Rahul", "Venue coordinator")',
  ),
  followUpAt: z.string().datetime({ offset: true }).optional().describe(
    'When to follow up on this blocker (ISO 8601)',
  ),
  deadline: z.string().datetime({ offset: true }).optional().describe(
    'When we actually need the response by — triggers urgency signals if missed',
  ),
  requestId: z.string().max(100).optional(),
});
export type SetBlockerInput = z.infer<typeof setBlockerInput>;

export const resolveBlockerInput = z.object({
  blockerId: objectIdString,
  reason: z.string().max(1000).optional(),
});
export type ResolveBlockerInput = z.infer<typeof resolveBlockerInput>;

export const listWaitingForInput = z.object({
  goalId: objectIdString.optional().describe('Filter blockers by goal. Omit for all.'),
  onlyPending: z.coerce.boolean().default(true).describe('If true, only show unresolved blockers with a waitingOn name'),
});
export type ListWaitingForInput = z.infer<typeof listWaitingForInput>;

// --- Outputs ---

export const blockerOutput = z.object({
  id: z.string(),
  itemId: z.string(),
  reason: z.string(),
  waitingOnUserId: z.string().nullable(),
  waitingOnName: z.string().nullable(),
  followUpAt: z.string().nullable(),
  deadline: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type BlockerOutput = z.infer<typeof blockerOutput>;

export const waitingForOutput = z.object({
  blockerId: z.string(),
  itemId: z.string(),
  itemTitle: z.string(),
  waitingOnName: z.string(),
  reason: z.string(),
  daysPending: z.number(),
  followUpAt: z.string().nullable(),
  deadline: z.string().nullable(),
});
export type WaitingForOutput = z.infer<typeof waitingForOutput>;
