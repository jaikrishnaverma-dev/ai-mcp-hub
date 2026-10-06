/**
 * Zod schemas for Workflows — scoped MCP access points.
 *
 * Each workflow exposes a subset of tools with workflow instructions.
 * Focused AI workflows, not a giant tool dump.
 */
import { z } from 'zod';
import { ENDPOINT_SCOPES, ENDPOINT_STATUSES } from '../constants/index.js';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const createWorkflowInput = z.object({
  name: z.string().min(1).max(100).describe('Human-readable workflow name'),
  toolAllowlist: z.array(z.string().min(1)).min(1)
    .describe('Tool names this workflow exposes'),
  instructions: z.string().max(10000).optional()
    .describe('Workflow prompt returned to AI clients at connection'),
  scopes: z.array(z.enum(ENDPOINT_SCOPES)).min(1).optional().default(['read', 'write'])
    .describe('Permission scopes: read, write, destructive'),
  isPublic: z.boolean().optional().default(false)
    .describe('Whether workflow is publicly discoverable in Community Hub'),
  authorName: z.string().optional()
    .describe('Display name of author for public workflows'),
});
export type CreateWorkflowInput = z.infer<typeof createWorkflowInput>;

export const updateWorkflowInput = z.object({
  endpointId: objectIdString,
  name: z.string().min(1).max(100).optional(),
  toolAllowlist: z.array(z.string().min(1)).min(1).optional(),
  instructions: z.string().max(10000).optional(),
  scopes: z.array(z.enum(ENDPOINT_SCOPES)).min(1).optional(),
  status: z.enum(ENDPOINT_STATUSES).optional(),
  isPublic: z.boolean().optional(),
  likes: z.number().optional(),
  commentsCount: z.number().optional(),
});
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowInput>;

// --- Outputs ---

export const workflowOutput = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  toolAllowlist: z.array(z.string()),
  instructions: z.string().nullable(),
  scopes: z.array(z.enum(ENDPOINT_SCOPES)),
  status: z.enum(ENDPOINT_STATUSES),
  toolCount: z.number(),
  isPublic: z.boolean().default(false),
  likes: z.number().default(0),
  commentsCount: z.number().default(0),
  authorName: z.string().optional(),
  createdAt: z.string(),
});
export type WorkflowOutput = z.infer<typeof workflowOutput>;

// Aliases for backwards compatibility
export const createEndpointInput = createWorkflowInput;
export type CreateEndpointInput = CreateWorkflowInput;
export const updateEndpointInput = updateWorkflowInput;
export type UpdateEndpointInput = UpdateWorkflowInput;
export const endpointOutput = workflowOutput;
export type EndpointOutput = WorkflowOutput;
