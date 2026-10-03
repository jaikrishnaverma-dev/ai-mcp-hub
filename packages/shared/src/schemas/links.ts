/**
 * Zod schemas for Links — relationships between Items.
 * 
 * Link kinds: depends_on, blocks, relates_to, mentions
 * Cycle detection is enforced in the service layer via $graphLookup.
 */
import { z } from 'zod';
import { LINK_KINDS } from '../constants/index.js';

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

// --- Inputs ---

export const createLinkInput = z.object({
  fromId: objectIdString.describe('Source item ID'),
  toId: objectIdString.describe('Target item ID'),
  kind: z.enum(LINK_KINDS),
  reason: z.string().max(1000).optional(),
  requestId: z.string().max(100).optional(),
});
export type CreateLinkInput = z.infer<typeof createLinkInput>;

// --- Outputs ---

export const linkOutput = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  kind: z.enum(LINK_KINDS),
  fromTitle: z.string(),
  toTitle: z.string(),
  createdAt: z.string(),
});
export type LinkOutput = z.infer<typeof linkOutput>;
