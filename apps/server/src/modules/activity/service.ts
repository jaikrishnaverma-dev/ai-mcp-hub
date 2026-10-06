/**
 * Activity service — immutable audit log and journal queries.
 */
import mongoose from 'mongoose';
import { Activity } from './model.js';
import { Item } from '../items/model.js';
import { NotFoundError, ForbiddenError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import type { ServiceContext, GetJournalInput, GetJournalOutput } from '@assistant/shared';

const log = createModuleLogger('activity');

export const activityService = {
  async getJournal(
    params: GetJournalInput,
    ctx: ServiceContext,
  ): Promise<GetJournalOutput> {
    const userId = new mongoose.Types.ObjectId(ctx.userId);
    let itemFilter: mongoose.Types.ObjectId[] | null = null;

    if (params.itemId) {
      const item = await Item.findById(params.itemId).lean();
      if (!item) throw new NotFoundError('Item', params.itemId);
      if (item['ownerId'].toString() !== ctx.userId) throw new ForbiddenError();
      itemFilter = [new mongoose.Types.ObjectId(params.itemId)];
    } else if (params.goalId) {
      const goal = await Item.findById(params.goalId).lean();
      if (!goal) throw new NotFoundError('Goal', params.goalId);
      if (goal['ownerId'].toString() !== ctx.userId) throw new ForbiddenError();

      // Find all descendant items under this goal
      const descendants = await Item.find({
        ownerId: userId,
        parentId: new mongoose.Types.ObjectId(params.goalId),
      }).select('_id').lean();

      itemFilter = [
        new mongoose.Types.ObjectId(params.goalId),
        ...descendants.map(d => d._id),
      ];
    } else {
      // Find all items owned by the user (up to 200 for activity query)
      const userItems = await Item.find({ ownerId: userId }).select('_id').limit(200).lean();
      itemFilter = userItems.map(d => d._id);
    }

    const query: Record<string, unknown> = {
      $or: [
        { itemId: { $in: itemFilter } },
        { actorId: userId },
      ],
    };

    const limit = Math.min(params.limit ?? 20, 100);
    const docs = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Batch resolve item titles
    const distinctItemIds = [...new Set(docs.map(d => d.itemId.toString()))];
    const items = await Item.find({
      _id: { $in: distinctItemIds.map(id => new mongoose.Types.ObjectId(id)) },
    }).select('title').lean();
    const titleMap = new Map(items.map(i => [i._id.toString(), i['title'] as string]));

    const entries = docs.map(doc => ({
      id: doc._id.toString(),
      itemId: doc.itemId.toString(),
      itemTitle: titleMap.get(doc.itemId.toString()) ?? null,
      actorId: doc.actorId.toString(),
      actorType: doc.actorType,
      action: doc.action,
      changes: doc.changes.map(c => ({
        field: c.field,
        from: c.from ?? null,
        to: c.to ?? null,
      })),
      reason: doc.reason ?? null,
      createdAt: doc.createdAt.toISOString(),
    }));

    const summary = `Found ${entries.length} journal entries. Most recent action: ${
      entries.length > 0 ? `${entries[0]!.action} on "${entries[0]!.itemTitle ?? entries[0]!.itemId}"` : 'none'
    }.`;

    return {
      entries,
      total: entries.length,
      summary,
    };
  },
};
