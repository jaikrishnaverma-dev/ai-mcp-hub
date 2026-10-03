/**
 * Zod schemas for Activity — append-only audit log.
 *
 * Every write operation creates an Activity record.
 * Records who changed what, when, and why.
 */
import { z } from 'zod';
import { ACTOR_TYPES } from '../constants/index.js';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Output only (Activity is created by services, never directly by users) ---

export const changeRecord = z.object({
  field: z.string(),
  from: z.unknown().nullable(),
  to: z.unknown().nullable(),
});
export type ChangeRecord = z.infer<typeof changeRecord>;

export const activityOutput = z.object({
  id: z.string(),
  itemId: z.string(),
  actorId: z.string(),
  actorType: z.enum(ACTOR_TYPES),
  action: z.string(),
  changes: z.array(changeRecord),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type ActivityOutput = z.infer<typeof activityOutput>;

export const activityList = z.object({
  activities: z.array(activityOutput),
  total: z.number(),
});
export type ActivityList = z.infer<typeof activityList>;
