/**
 * Blockers service — record why work can't proceed.
 *
 * Setting a blocker optionally updates the item status to "blocked".
 * Resolving a blocker optionally updates the item status back.
 *
 * Extended for Agent Core:
 * - waitingOnName: track external people by name
 * - followUpAt / deadline: urgency anchors
 * - listWaitingFor: cross-item view of everything you're waiting on
 */
import mongoose from 'mongoose';
import { Blocker } from './model.js';
import { Item } from '../items/model.js';
import { Activity } from '../activity/model.js';
import { NotFoundError, ForbiddenError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import type { ServiceContext, SetBlockerInput, ListWaitingForInput } from '@assistant/shared';

const log = createModuleLogger('blockers');

export const blockersService = {
  async setBlocker(
    params: SetBlockerInput,
    ctx: ServiceContext,
  ) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const item = await Item.findById(params.itemId).session(session);
        if (!item) throw new NotFoundError('Item', params.itemId);
        if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

        const [blocker] = await Blocker.create(
          [
            {
              itemId: new mongoose.Types.ObjectId(params.itemId),
              reason: params.reason,
              waitingOnUserId: params.waitingOnUserId
                ? new mongoose.Types.ObjectId(params.waitingOnUserId)
                : undefined,
              waitingOnName: params.waitingOnName,
              followUpAt: params.followUpAt ? new Date(params.followUpAt) : undefined,
              deadline: params.deadline ? new Date(params.deadline) : undefined,
            },
          ],
          { session },
        );

        // Update item status to blocked if it's not already done/cancelled
        let statusUpdated = false;
        if (item.status !== 'blocked' && item.status !== 'done' && item.status !== 'cancelled') {
          const oldStatus = item.status;
          item.status = 'blocked';
          await item.save({ session });
          statusUpdated = true;

          await Activity.create(
            [
              {
                itemId: item._id,
                actorId: new mongoose.Types.ObjectId(ctx.userId),
                actorType: ctx.actorType,
                action: 'blocked',
                changes: [
                  { field: 'status', from: oldStatus, to: 'blocked' },
                  { field: 'blocker', from: null, to: params.reason },
                ],
              },
            ],
            { session },
          );
        } else {
          await Activity.create(
            [
              {
                itemId: item._id,
                actorId: new mongoose.Types.ObjectId(ctx.userId),
                actorType: ctx.actorType,
                action: 'blocker_added',
                changes: [{ field: 'blocker', from: null, to: params.reason }],
              },
            ],
            { session },
          );
        }

        log.info({ itemId: params.itemId, blockerId: blocker!._id }, 'Blocker set');

        return {
          blocker: {
            id: blocker!._id.toString(),
            itemId: params.itemId,
            reason: blocker!.reason,
            waitingOnUserId: params.waitingOnUserId ?? null,
            waitingOnName: blocker!.waitingOnName ?? null,
            followUpAt: blocker!.followUpAt ? blocker!.followUpAt.toISOString() : null,
            deadline: blocker!.deadline ? blocker!.deadline.toISOString() : null,
            resolvedAt: null,
            createdAt: blocker!.createdAt.toISOString(),
          },
          taskStatusUpdated: statusUpdated,
        };
      });
    } finally {
      await session.endSession();
    }
  },

  async resolveBlocker(
    blockerId: string,
    reason: string | undefined,
    ctx: ServiceContext,
  ) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const blocker = await Blocker.findById(blockerId).session(session);
        if (!blocker) throw new NotFoundError('Blocker', blockerId);

        const item = await Item.findById(blocker.itemId).session(session);
        if (!item) throw new NotFoundError('Item', blocker.itemId.toString());
        if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

        blocker.resolvedAt = new Date();
        await blocker.save({ session });

        // Check if there are any remaining unresolved blockers
        const activeBlockers = await Blocker.countDocuments({
          itemId: blocker.itemId,
          resolvedAt: null,
          _id: { $ne: blocker._id },
        }).session(session);

        let statusUpdated = false;
        if (activeBlockers === 0 && item.status === 'blocked') {
          item.status = 'todo';
          await item.save({ session });
          statusUpdated = true;
        }

        await Activity.create(
          [
            {
              itemId: blocker.itemId,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'blocker_resolved',
              changes: [
                { field: 'blocker', from: blocker.reason, to: null },
                ...(statusUpdated ? [{ field: 'status', from: 'blocked', to: 'todo' }] : []),
              ],
              reason,
            },
          ],
          { session },
        );

        log.info({ blockerId, itemId: blocker.itemId }, 'Blocker resolved');

        return { resolved: true, taskStatusUpdated: statusUpdated };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * List everything we're currently waiting on (cross-item view).
   * Only returns blockers that have a waitingOnName or waitingOnUserId set.
   */
  async listWaitingFor(params: ListWaitingForInput, ctx: ServiceContext) {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    const now = new Date();

    // Find all active blockers where we have a waitingOn reference
    const blockerFilter: Record<string, unknown> = {
      resolvedAt: null,
      $or: [
        { waitingOnName: { $exists: true, $ne: null } },
        { waitingOnUserId: { $exists: true, $ne: null } },
      ],
    };

    const blockers = await Blocker.find(blockerFilter).lean();
    if (blockers.length === 0) return [];

    // Get all item IDs from blockers and filter by owner
    const itemIds = blockers.map(b => b.itemId);
    const itemFilter: Record<string, unknown> = {
      _id: { $in: itemIds },
      ownerId: userId,
      deletedAt: null,
    };

    // If goalId provided, restrict to items under that goal's stories
    // (items with parentId whose parent has parentId = goalId)
    const items = await Item.find(itemFilter).lean();
    const itemMap = new Map<string, Record<string, unknown>>();
    for (const item of items) {
      itemMap.set((item['_id'] as mongoose.Types.ObjectId).toString(), item as Record<string, unknown>);
    }

    const results = [];
    for (const b of blockers) {
      const itemId = b.itemId.toString();
      const item = itemMap.get(itemId);
      if (!item) continue; // Not owned by this user

      const daysPending = Math.floor(
        (now.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const waitingOnName = b.waitingOnName ?? `User:${b.waitingOnUserId?.toString() ?? 'unknown'}`;

      results.push({
        blockerId: b._id.toString(),
        itemId,
        itemTitle: item['title'] as string,
        waitingOnName,
        reason: b.reason,
        daysPending,
        followUpAt: b.followUpAt ? b.followUpAt.toISOString() : null,
        deadline: b.deadline ? b.deadline.toISOString() : null,
      });
    }

    // Sort: overdue deadline first, then by daysPending desc
    results.sort((a, b) => {
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.daysPending - a.daysPending;
    });

    return results;
  },
};
