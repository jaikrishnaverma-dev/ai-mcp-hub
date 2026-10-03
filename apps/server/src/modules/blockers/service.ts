/**
 * Blockers service — record why work can't proceed.
 *
 * Setting a blocker optionally updates the item status to "blocked".
 * Resolving a blocker optionally updates the item status back.
 */
import mongoose from 'mongoose';
import { Blocker } from './model.js';
import { Item } from '../items/model.js';
import { Activity } from '../activity/model.js';
import { NotFoundError, ForbiddenError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import type { ServiceContext } from '@assistant/shared';

const log = createModuleLogger('blockers');

export const blockersService = {
  async setBlocker(
    params: { itemId: string; reason: string; waitingOnUserId?: string },
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
            },
          ],
          { session },
        );

        // Update item status to blocked if it's not already
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
};
