/**
 * Zod schemas for Endpoints — scoped MCP access points.
 *
 * Each endpoint exposes a subset of tools with workflow instructions.
 * This is the core differentiator: focused AI workflows, not a giant tool dump.
 */
import { z } from 'zod';
import { ENDPOINT_SCOPES, ENDPOINT_STATUSES } from '../constants/index.js';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const createEndpointInput = z.object({
  name: z.string().min(1).max(100).describe('Human-readable endpoint name'),
  toolAllowlist: z.array(z.string().min(1)).min(1).max(15)
    .describe('Tool names this endpoint exposes (max 15)'),
  instructions: z.string().max(10000).optional()
    .describe('Workflow prompt returned to AI clients at connection'),
  scopes: z.array(z.enum(ENDPOINT_SCOPES)).min(1)
    .describe('Permission scopes: read, write, destructive'),
});
export type CreateEndpointInput = z.infer<typeof createEndpointInput>;

export const updateEndpointInput = z.object({
  endpointId: objectIdString,
  name: z.string().min(1).max(100).optional(),
  toolAllowlist: z.array(z.string().min(1)).min(1).max(15).optional(),
  instructions: z.string().max(10000).optional(),
  scopes: z.array(z.enum(ENDPOINT_SCOPES)).min(1).optional(),
  status: z.enum(ENDPOINT_STATUSES).optional(),
});
export type UpdateEndpointInput = z.infer<typeof updateEndpointInput>;

// --- Outputs ---

export const endpointOutput = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  toolAllowlist: z.array(z.string()),
  instructions: z.string().nullable(),
  scopes: z.array(z.enum(ENDPOINT_SCOPES)),
  status: z.enum(ENDPOINT_STATUSES),
  toolCount: z.number(),
  createdAt: z.string(),
});
export type EndpointOutput = z.infer<typeof endpointOutput>;
