/**
 * Zod schemas for Constraints and Unknowns — first-class agent reasoning entities.
 *
 * Constraints: budget limits, hard deadlines, preferences, resource limits.
 * Unknowns: explicitly tracked missing information that blocks or risks the project.
 */
import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

import { CONSTRAINT_TYPES } from '../constants/index.js';

// --- Constraint Inputs ---

export const addConstraintInput = z.object({
  goalId: objectIdString.optional().describe('Goal this constraint applies to. Omit for global constraints.'),
  type: z.enum(CONSTRAINT_TYPES).describe('Type of constraint: budget, deadline, preference, resource, or dependency'),
  value: z.string().min(1).max(500).describe('The constraint value, e.g. "500000 INR" or "2027-03-15"'),
  description: z.string().min(1).max(1000).describe('Human-readable explanation of the constraint'),
  requestId: z.string().max(100).optional(),
});
export type AddConstraintInput = z.infer<typeof addConstraintInput>;

export const listConstraintsInput = z.object({
  goalId: objectIdString.optional().describe('Filter by goal. Omit to get all constraints including global ones.'),
  type: z.enum(CONSTRAINT_TYPES).optional(),
});
export type ListConstraintsInput = z.infer<typeof listConstraintsInput>;

export const deleteConstraintInput = z.object({
  constraintId: objectIdString,
  reason: z.string().max(1000).optional(),
});
export type DeleteConstraintInput = z.infer<typeof deleteConstraintInput>;

// --- Constraint Outputs ---

export const constraintOutput = z.object({
  id: z.string(),
  goalId: z.string().nullable(),
  type: z.enum(CONSTRAINT_TYPES),
  value: z.string(),
  description: z.string(),
  createdAt: z.string(),
});
export type ConstraintOutput = z.infer<typeof constraintOutput>;

// --- Unknown Inputs ---

export const addUnknownInput = z.object({
  goalId: objectIdString.optional().describe('Goal this unknown is related to. Omit for global unknowns.'),
  title: z.string().min(1).max(500).describe('What is unknown, e.g. "Final guest count"'),
  description: z.string().max(2000).optional().describe('More details about why this is unknown and what resolving it unlocks'),
  requestId: z.string().max(100).optional(),
});
export type AddUnknownInput = z.infer<typeof addUnknownInput>;

export const resolveUnknownInput = z.object({
  unknownId: objectIdString,
  resolvedValue: z.string().min(1).max(1000).describe('The answer/resolved value for this unknown'),
  reason: z.string().max(1000).optional(),
});
export type ResolveUnknownInput = z.infer<typeof resolveUnknownInput>;

export const listUnknownsInput = z.object({
  goalId: objectIdString.optional(),
  onlyUnresolved: z.coerce.boolean().default(true).describe('If true (default), only return unresolved unknowns'),
});
export type ListUnknownsInput = z.infer<typeof listUnknownsInput>;

// --- Unknown Outputs ---

export const unknownOutput = z.object({
  id: z.string(),
  goalId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedValue: z.string().nullable(),
  createdAt: z.string(),
});
export type UnknownOutput = z.infer<typeof unknownOutput>;

// --- Consolidated Manage Constraints Input ---

export const manageConstraintsInput = z.object({
  action: z.enum(['add', 'delete']).describe('Action: "add" to record a constraint, "delete" to remove one'),
  goalId: objectIdString.optional().describe('Goal this constraint applies to (omit for global)'),
  type: z.enum(CONSTRAINT_TYPES).optional().describe('Type of constraint (required for add)'),
  value: z.string().min(1).max(500).optional().describe('Constraint value, e.g. "500000 INR" (required for add)'),
  description: z.string().min(1).max(1000).optional().describe('Description of the constraint (required for add)'),
  constraintId: objectIdString.optional().describe('ID of constraint to delete (required for delete)'),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type ManageConstraintsInput = z.infer<typeof manageConstraintsInput>;

// --- Consolidated Manage Unknowns Input ---

export const manageUnknownsInput = z.object({
  action: z.enum(['add', 'resolve']).describe('Action: "add" to track an unknown gap, "resolve" to record the verified answer'),
  goalId: objectIdString.optional().describe('Goal this unknown relates to (omit for global)'),
  title: z.string().min(1).max(500).optional().describe('What is unknown, e.g. "Final guest count" (required for add)'),
  description: z.string().max(2000).optional().describe('Why this is unknown and what resolving it unlocks'),
  unknownId: objectIdString.optional().describe('ID of unknown to resolve (required for resolve)'),
  resolvedValue: z.string().min(1).max(1000).optional().describe('The verified answer/value for this unknown (required for resolve)'),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type ManageUnknownsInput = z.infer<typeof manageUnknownsInput>;
