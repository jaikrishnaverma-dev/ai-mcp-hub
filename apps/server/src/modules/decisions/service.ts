/**
 * Decisions service — record choices with rationale.
 */
import mongoose from 'mongoose';
import { Decision } from './model.js';
import { Item } from '../items/model.js';
import { Activity } from '../activity/model.js';
import { NotFoundError, ForbiddenError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import type { ServiceContext } from '@assistant/shared';

const log = createModuleLogger('decisions');

export const decisionsService = {
  async logDecision(
    params: { itemId: string; summary: string; rationale: string; reason?: string },
    ctx: ServiceContext,
  ) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const item = await Item.findById(params.itemId).session(session);
        if (!item) throw new NotFoundError('Item', params.itemId);
        if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

        const [decision] = await Decision.create(
          [
            {
              itemId: new mongoose.Types.ObjectId(params.itemId),
              summary: params.summary,
              rationale: params.rationale,
              decidedBy: new mongoose.Types.ObjectId(ctx.userId),
            },
          ],
          { session },
        );

        await Activity.create(
          [
            {
              itemId: new mongoose.Types.ObjectId(params.itemId),
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'decision_logged',
              changes: [{ field: 'decision', from: null, to: params.summary }],
              reason: params.reason,
            },
          ],
          { session },
        );

        log.info({ itemId: params.itemId, decisionId: decision!._id }, 'Decision logged');

        return {
          decision: {
            id: decision!._id.toString(),
            itemId: params.itemId,
            summary: decision!.summary,
            rationale: decision!.rationale,
            decidedBy: ctx.userId,
            createdAt: decision!.createdAt.toISOString(),
          },
          activity: { id: decision!._id.toString() },
        };
      });
    } finally {
      await session.endSession();
    }
  },

  async getDecisionsForItem(itemId: string, ctx: ServiceContext) {
    const item = await Item.findById(itemId).lean();
    if (!item) throw new NotFoundError('Item', itemId);
    if (item['ownerId'].toString() !== ctx.userId) throw new ForbiddenError();

    const decisions = await Decision.find({
      itemId: new mongoose.Types.ObjectId(itemId),
    }).sort({ createdAt: -1 }).lean();

    return decisions.map(d => ({
      id: d._id.toString(),
      itemId: d.itemId.toString(),
      summary: d.summary,
      rationale: d.rationale,
      decidedBy: d.decidedBy.toString(),
      createdAt: d.createdAt.toISOString(),
    }));
  },
};
