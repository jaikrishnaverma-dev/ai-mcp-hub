/**
 * Zod schemas for Decisions — recorded choices with rationale.
 * 
 * Decisions are first-class objects attached to items or goals (or project-wide).
 * "Chose Studio X because of price" — structured, searchable.
 */
import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const logDecisionInput = z.object({
  itemId: objectIdString.optional().describe('Item this decision relates to. Omit for project-level decisions.'),
  goalId: objectIdString.optional().describe('Goal this decision relates to. Omit for standalone/item-only decisions.'),
  category: z.string().max(100).optional().describe('Optional category, e.g. "budget", "venue", "design", "tech_stack"'),
  summary: z.string().min(1).max(500).describe('What was decided'),
  rationale: z.string().min(1).max(2000).describe('Why this choice was made'),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type LogDecisionInput = z.infer<typeof logDecisionInput>;

export const listDecisionsInput = z.object({
  goalId: objectIdString.optional().describe('Filter decisions by goal'),
  itemId: objectIdString.optional().describe('Filter decisions by item'),
  category: z.string().max(100).optional().describe('Filter by category'),
  status: z.enum(['active', 'superseded']).optional().describe('Filter by status'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListDecisionsInput = z.infer<typeof listDecisionsInput>;

// --- Outputs ---

export const decisionOutput = z.object({
  id: z.string(),
  itemId: z.string().nullable(),
  goalId: z.string().nullable(),
  category: z.string().nullable(),
  status: z.enum(['active', 'superseded']).default('active'),
  summary: z.string(),
  rationale: z.string(),
  decidedBy: z.string(),
  createdAt: z.string(),
});
export type DecisionOutput = z.infer<typeof decisionOutput>;
