/**
 * Decisions service — record choices with rationale.
 * Supports task-specific decisions, goal-level decisions, and project-wide decisions.
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
    params: {
      itemId?: string;
      goalId?: string;
      category?: string;
      summary: string;
      rationale: string;
      reason?: string;
    },
    ctx: ServiceContext,
  ) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        let targetItemId = params.itemId;

        if (params.itemId) {
          const item = await Item.findById(params.itemId).session(session);
          if (!item) throw new NotFoundError('Item', params.itemId);
          if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();
        }

        if (params.goalId) {
          const goal = await Item.findById(params.goalId).session(session);
          if (!goal) throw new NotFoundError('Goal', params.goalId);
          if (goal.ownerId.toString() !== ctx.userId) throw new ForbiddenError();
          if (!targetItemId) targetItemId = params.goalId;
        }

        const [decision] = await Decision.create(
          [
            {
              itemId: params.itemId ? new mongoose.Types.ObjectId(params.itemId) : undefined,
              goalId: params.goalId ? new mongoose.Types.ObjectId(params.goalId) : undefined,
              category: params.category,
              status: 'active',
              summary: params.summary,
              rationale: params.rationale,
              decidedBy: new mongoose.Types.ObjectId(ctx.userId),
            },
          ],
          { session },
        );

        // If attached to an item or goal, record Activity
        if (targetItemId) {
          await Activity.create(
            [
              {
                itemId: new mongoose.Types.ObjectId(targetItemId),
                actorId: new mongoose.Types.ObjectId(ctx.userId),
                actorType: ctx.actorType,
                action: 'decision_logged',
                changes: [{ field: 'decision', from: null, to: params.summary }],
                reason: params.reason,
              },
            ],
            { session },
          );
        }

        log.info({ itemId: params.itemId, goalId: params.goalId, decisionId: decision!._id }, 'Decision logged');

        return {
          decision: {
            id: decision!._id.toString(),
            itemId: params.itemId ?? null,
            goalId: params.goalId ?? null,
            category: decision!.category ?? null,
            status: decision!.status,
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

  async listDecisions(
    params: {
      goalId?: string;
      itemId?: string;
      category?: string;
      status?: 'active' | 'superseded';
      limit?: number;
    },
    ctx: ServiceContext,
  ) {
    const filter: Record<string, unknown> = {
      decidedBy: new mongoose.Types.ObjectId(ctx.userId),
    };

    if (params.itemId) {
      filter['itemId'] = new mongoose.Types.ObjectId(params.itemId);
    }
    if (params.goalId) {
      filter['goalId'] = new mongoose.Types.ObjectId(params.goalId);
    }
    if (params.category) {
      filter['category'] = params.category;
    }
    if (params.status) {
      filter['status'] = params.status;
    }

    const limit = Math.min(params.limit ?? 20, 100);
    const decisions = await Decision.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return decisions.map(d => ({
      id: d._id.toString(),
      itemId: d.itemId ? d.itemId.toString() : null,
      goalId: d.goalId ? d.goalId.toString() : null,
      category: d.category ?? null,
      status: (d.status ?? 'active') as 'active' | 'superseded',
      summary: d.summary,
      rationale: d.rationale,
      decidedBy: d.decidedBy.toString(),
      createdAt: d.createdAt.toISOString(),
    }));
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
      itemId: d.itemId ? d.itemId.toString() : itemId,
      goalId: d.goalId ? d.goalId.toString() : null,
      category: d.category ?? null,
      status: (d.status ?? 'active') as 'active' | 'superseded',
      summary: d.summary,
      rationale: d.rationale,
      decidedBy: d.decidedBy.toString(),
      createdAt: d.createdAt.toISOString(),
    }));
  },
};
