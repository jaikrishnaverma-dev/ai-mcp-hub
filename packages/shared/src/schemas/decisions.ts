/**
 * Zod schemas for Decisions — recorded choices with rationale.
 * 
 * Decisions are first-class objects attached to items.
 * "Chose Studio X because of price" — not just free-text in a comment.
 */
import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const logDecisionInput = z.object({
  itemId: objectIdString.describe('Item this decision relates to'),
  summary: z.string().min(1).max(500).describe('What was decided'),
  rationale: z.string().min(1).max(2000).describe('Why this choice was made'),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type LogDecisionInput = z.infer<typeof logDecisionInput>;

// --- Outputs ---

export const decisionOutput = z.object({
  id: z.string(),
  itemId: z.string(),
  summary: z.string(),
  rationale: z.string(),
  decidedBy: z.string(),
  createdAt: z.string(),
});
export type DecisionOutput = z.infer<typeof decisionOutput>;
