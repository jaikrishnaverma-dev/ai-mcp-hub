/**
 * Zod schemas for Blockers — reasons work can't proceed.
 *
 * A blocker records what's stuck and optionally who it's waiting on.
 * Different from a "blocked" status — the status is derived, the blocker is the reason.
 */
import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const setBlockerInput = z.object({
  itemId: objectIdString.describe('Item that is blocked'),
  reason: z.string().min(1).max(1000).describe('Why the item is blocked'),
  waitingOnUserId: objectIdString.optional().describe('User we are waiting on, if applicable'),
  requestId: z.string().max(100).optional(),
});
export type SetBlockerInput = z.infer<typeof setBlockerInput>;

export const resolveBlockerInput = z.object({
  blockerId: objectIdString,
  reason: z.string().max(1000).optional(),
});
export type ResolveBlockerInput = z.infer<typeof resolveBlockerInput>;

// --- Outputs ---

export const blockerOutput = z.object({
  id: z.string(),
  itemId: z.string(),
  reason: z.string(),
  waitingOnUserId: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type BlockerOutput = z.infer<typeof blockerOutput>;
