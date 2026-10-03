/**
 * Items service — core CRUD with hierarchy enforcement.
 *
 * Complex rules:
 * 1. Hierarchy: Goal → Story → Task → Subtask (parentId type validation)
 * 2. Soft delete cascades to children
 * 3. Restore cascades to children
 * 4. Every write logs Activity
 * 5. Ownership check on all operations
 * 6. Complete task → auto-check if blocked items can be unblocked
 */
import mongoose from 'mongoose';
import { Item, type ItemDocument } from './model.js';
import { Activity } from '../activity/model.js';
import { Blocker } from '../blockers/model.js';
import { Decision } from '../decisions/model.js';
import { Link } from '../links/model.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import {
  VALID_PARENT_TYPES,
  DEFAULT_TIMEZONE,
  type ItemType,
  type ItemStatus,
  type ItemPriority,
  type ServiceContext,
  type ItemSummary,
  type ItemFull,
} from '@assistant/shared';

const log = createModuleLogger('items');

// --- Helpers ---

/** Cast Mongoose toObject() result to a plain record for transformation */
function asRecord(doc: unknown): Record<string, unknown> {
  return doc as Record<string, unknown>;
}

function toItemSummary(doc: Record<string, unknown>, parentTitle?: string | null): ItemSummary {
  return {
    id: String(doc['_id'] ?? doc['id']),
    type: doc['type'] as ItemType,
    title: doc['title'] as string,
    status: doc['status'] as ItemStatus,
    priority: doc['priority'] as ItemPriority,
    dueAt: doc['dueAt'] ? (doc['dueAt'] as Date).toISOString() : null,
    parentId: doc['parentId'] ? String(doc['parentId']) : null,
    parentTitle: parentTitle ?? null,
    createdAt: (doc['createdAt'] as Date).toISOString(),
  };
}

function toItemFull(doc: Record<string, unknown>, parentTitle?: string | null): ItemFull {
  return {
    ...toItemSummary(doc, parentTitle),
    description: (doc['body'] as string) ?? null,
    estimateMin: (doc['estimateMin'] as number) ?? null,
    assigneeId: doc['assigneeId'] ? String(doc['assigneeId']) : null,
    startAt: doc['startAt'] ? (doc['startAt'] as Date).toISOString() : null,
    endAt: doc['endAt'] ? (doc['endAt'] as Date).toISOString() : null,
    tz: (doc['tz'] as string) ?? DEFAULT_TIMEZONE,
    updatedAt: (doc['updatedAt'] as Date).toISOString(),
    deletedAt: doc['deletedAt'] ? (doc['deletedAt'] as Date).toISOString() : null,
  };
}

/**
 * Validate hierarchy: check that the parent item is the correct type.
 */
async function validateParent(
  type: ItemType,
  parentId: string | undefined,
  ownerId: string,
  session?: mongoose.ClientSession,
): Promise<ItemDocument | null> {
  const expectedParentType = VALID_PARENT_TYPES[type];

  if (expectedParentType === null) {
    // This type should have no parent
    if (parentId) {
      throw new ValidationError(`${type} cannot have a parent item`);
    }
    return null;
  }

  // Tasks can be standalone (e.g. quick inbox tasks)
  if (type === 'task' && !parentId) {
    return null;
  }

  // Other types (story, subtask) require a parent
  if (!parentId) {
    throw new ValidationError(`${type} requires a parentId (must be a ${expectedParentType})`);
  }

  const parent = await Item.findById(parentId).session(session ?? null);
  if (!parent) throw new NotFoundError('Parent item', parentId);
  if (parent.ownerId.toString() !== ownerId) {
    throw new ForbiddenError('Cannot create items under another user\'s item');
  }
  if (parent.type !== expectedParentType) {
    throw new ValidationError(
      `${type} parent must be a ${expectedParentType}, got ${parent.type}`,
    );
  }

  return parent;
}

/**
 * Build a diff of changes between old and new values.
 */
function buildChanges(
  oldDoc: Record<string, unknown>,
  updates: Record<string, unknown>,
): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [key, newVal] of Object.entries(updates)) {
    if (newVal === undefined) continue;
    const oldVal = oldDoc[key];
    // Compare serialized values for Date objects
    const oldStr = oldVal instanceof Date ? oldVal.toISOString() : oldVal;
    const newStr = newVal instanceof Date ? (newVal as Date).toISOString() : newVal;
    if (oldStr !== newStr) {
      changes.push({ field: key, from: oldStr ?? null, to: newStr ?? null });
    }
  }
  return changes;
}

// --- Input types ---

interface CreateItemParams {
  type: ItemType;
  title: string;
  description?: string;
  parentId?: string;
  priority?: ItemPriority;
  dueAt?: string;
  estimateMin?: number;
  reason?: string;
}

interface UpdateItemParams {
  taskId: string;
  title?: string;
  description?: string;
  status?: ItemStatus;
  priority?: ItemPriority;
  dueAt?: string | null;
  estimateMin?: number | null;
  reason?: string;
}

interface ListItemsParams {
  type?: ItemType;
  status?: ItemStatus;
  priority?: ItemPriority;
  parentId?: string;
  dueBefore?: string;
  dueAfter?: string;
  includeSubtasks?: boolean;
  limit?: number;
  offset?: number;
}

// --- Service ---

export const itemsService = {
  /**
   * Create an item (goal, story, task, subtask).
   * Validates hierarchy, logs activity.
   */
  async createItem(
    params: CreateItemParams,
    ctx: ServiceContext,
  ): Promise<{ item: ItemFull; activity: { id: string } }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // 1. Validate parent hierarchy
        const parent = await validateParent(params.type, params.parentId, ctx.userId, session);

        // 2. Create item
        const [item] = await Item.create(
          [
            {
              type: params.type,
              title: params.title,
              body: params.description,
              status: 'todo',
              priority: params.priority ?? 'medium',
              parentId: params.parentId ? new mongoose.Types.ObjectId(params.parentId) : undefined,
              ownerId: new mongoose.Types.ObjectId(ctx.userId),
              dueAt: params.dueAt ? new Date(params.dueAt) : undefined,
              estimateMin: params.estimateMin,
              tz: DEFAULT_TIMEZONE,
            },
          ],
          { session },
        );

        if (!item) throw new Error('Failed to create item');

        // 3. Log activity
        const [activity] = await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'created',
              changes: [
                { field: 'title', from: null, to: item.title },
                { field: 'type', from: null, to: item.type },
                { field: 'status', from: null, to: item.status },
                { field: 'priority', from: null, to: item.priority },
              ],
              reason: params.reason,
            },
          ],
          { session },
        );

        log.info({ itemId: item._id, type: params.type, title: params.title }, 'Item created');

        return {
          item: toItemFull(asRecord(item.toObject()), parent?.title ?? null),
          activity: { id: activity!._id.toString() },
        };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Update an item's fields.
   * Only the owner can update. Logs activity with change diff.
   */
  async updateItem(
    params: UpdateItemParams,
    ctx: ServiceContext,
  ): Promise<{ item: ItemFull; changes: Array<{ field: string; from: unknown; to: unknown }>; activity: { id: string } }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const item = await Item.findById(params.taskId).session(session);
        if (!item) throw new NotFoundError('Item', params.taskId);
        if (item.ownerId.toString() !== ctx.userId) {
          throw new ForbiddenError();
        }

        const oldDoc = asRecord(item.toObject());

        // Build update object (only set provided fields)
        const updates: Record<string, unknown> = {};
        if (params.title !== undefined) updates['title'] = params.title;
        if (params.description !== undefined) updates['body'] = params.description;
        if (params.status !== undefined) updates['status'] = params.status;
        if (params.priority !== undefined) updates['priority'] = params.priority;
        if (params.dueAt !== undefined) updates['dueAt'] = params.dueAt ? new Date(params.dueAt) : null;
        if (params.estimateMin !== undefined) updates['estimateMin'] = params.estimateMin;

        if (Object.keys(updates).length === 0) {
          throw new ValidationError('No fields to update');
        }

        // Apply updates
        Object.assign(item, updates);
        await item.save({ session });

        // Build change diff
        const changes = buildChanges(oldDoc, updates);

        // Log activity
        const [activity] = await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'updated',
              changes,
              reason: params.reason,
            },
          ],
          { session },
        );

        // Fetch parent title
        let parentTitle: string | null = null;
        if (item.parentId) {
          const parent = await Item.findById(item.parentId).session(session).lean();
          parentTitle = parent ? (parent['title'] as string) : null;
        }

        log.info({ itemId: params.taskId, changes: changes.map(c => c.field) }, 'Item updated');

        return {
          item: toItemFull(asRecord(item.toObject()), parentTitle),
          changes,
          activity: { id: activity!._id.toString() },
        };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Complete a task. Sets status to 'done'.
   * Returns list of items that were unblocked by this completion.
   */
  async completeItem(
    taskId: string,
    reason: string | undefined,
    ctx: ServiceContext,
  ): Promise<{ item: ItemFull; activity: { id: string }; unblocked: ItemSummary[] }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const item = await Item.findById(taskId).session(session);
        if (!item) throw new NotFoundError('Item', taskId);
        if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

        if (item.status === 'done') {
          throw new ValidationError('Item is already completed');
        }

        const oldStatus = item.status;
        item.status = 'done';
        await item.save({ session });

        // Log activity
        const [activity] = await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'completed',
              changes: [{ field: 'status', from: oldStatus, to: 'done' }],
              reason,
            },
          ],
          { session },
        );

        // Find items that depended on this one (this item blocks others)
        // Check if any of those items can now be unblocked
        const blockingLinks = await Link.find({
          toId: item._id,
          kind: 'depends_on',
        }).session(session);

        const unblocked: ItemSummary[] = [];

        for (const link of blockingLinks) {
          const dependentItem = await Item.findById(link.fromId).session(session);
          if (!dependentItem || dependentItem.status !== 'blocked') continue;

          // Check if ALL dependencies of this item are now done
          const allDeps = await Link.find({
            fromId: dependentItem._id,
            kind: 'depends_on',
          }).session(session);

          const depItemIds = allDeps.map(d => d.toId);
          const unresolvedDeps = await Item.countDocuments({
            _id: { $in: depItemIds },
            status: { $ne: 'done' },
          }).session(session);

          if (unresolvedDeps === 0) {
            // All dependencies resolved → unblock
            dependentItem.status = 'todo';
            await dependentItem.save({ session });

            await Activity.create(
              [
                {
                  itemId: dependentItem._id,
                  actorId: new mongoose.Types.ObjectId(ctx.userId),
                  actorType: 'system',
                  action: 'unblocked',
                  changes: [{ field: 'status', from: 'blocked', to: 'todo' }],
                  reason: `Dependency "${item.title}" was completed`,
                },
              ],
              { session },
            );

            unblocked.push(toItemSummary(asRecord(dependentItem.toObject())));
          }
        }

        let parentTitle: string | null = null;
        if (item.parentId) {
          const parent = await Item.findById(item.parentId).session(session).lean();
          parentTitle = parent ? (parent['title'] as string) : null;
        }

        log.info({ itemId: taskId, unblockedCount: unblocked.length }, 'Item completed');

        return {
          item: toItemFull(asRecord(item.toObject()), parentTitle),
          activity: { id: activity!._id.toString() },
          unblocked,
        };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Get an item with full context: parent, decisions, blockers, links, history.
   */
  async getItem(
    taskId: string,
    ctx: ServiceContext,
  ): Promise<{
    item: ItemFull;
    decisions: Array<{ id: string; summary: string; rationale: string; createdAt: string }>;
    blockers: Array<{ id: string; reason: string; resolvedAt: string | null; createdAt: string }>;
    links: Array<{ id: string; kind: string; targetId: string; targetTitle: string; direction: string }>;
    history: Array<{ id: string; action: string; actorType: string; changes: unknown[]; reason: string | null; createdAt: string }>;
  }> {
    const item = await Item.findById(taskId).lean();
    if (!item) throw new NotFoundError('Item', taskId);
    if (item['ownerId'].toString() !== ctx.userId) throw new ForbiddenError();

    // Fetch parent title
    let parentTitle: string | null = null;
    if (item['parentId']) {
      const parent = await Item.findById(item['parentId']).lean();
      parentTitle = parent ? (parent['title'] as string) : null;
    }

    // Fetch related data in parallel
    const itemObjectId = new mongoose.Types.ObjectId(taskId);
    const [decisions, blockers, outLinks, inLinks, history] = await Promise.all([
      Decision.find({ itemId: itemObjectId }).sort({ createdAt: -1 }).lean(),
      Blocker.find({ itemId: itemObjectId }).sort({ createdAt: -1 }).lean(),
      Link.find({ fromId: itemObjectId }).lean(),
      Link.find({ toId: itemObjectId }).lean(),
      Activity.find({ itemId: itemObjectId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    // Resolve link target titles
    const linkTargetIds = [
      ...outLinks.map(l => l.toId),
      ...inLinks.map(l => l.fromId),
    ];
    const linkTargets = await Item.find({ _id: { $in: linkTargetIds } }).lean();
    const titleMap = new Map(linkTargets.map(t => [t._id.toString(), t['title'] as string]));

    const formattedLinks = [
      ...outLinks.map(l => ({
        id: l._id.toString(),
        kind: l.kind,
        targetId: l.toId.toString(),
        targetTitle: titleMap.get(l.toId.toString()) ?? 'Unknown',
        direction: 'outgoing' as const,
      })),
      ...inLinks.map(l => ({
        id: l._id.toString(),
        kind: l.kind,
        targetId: l.fromId.toString(),
        targetTitle: titleMap.get(l.fromId.toString()) ?? 'Unknown',
        direction: 'incoming' as const,
      })),
    ];

    return {
      item: toItemFull(item as Record<string, unknown>, parentTitle),
      decisions: decisions.map(d => ({
        id: d._id.toString(),
        summary: d.summary,
        rationale: d.rationale,
        createdAt: d.createdAt.toISOString(),
      })),
      blockers: blockers.map(b => ({
        id: b._id.toString(),
        reason: b.reason,
        resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null,
        createdAt: b.createdAt.toISOString(),
      })),
      links: formattedLinks,
      history: history.map(h => ({
        id: h._id.toString(),
        action: h.action,
        actorType: h.actorType,
        changes: h.changes,
        reason: h.reason ?? null,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  },

  /**
   * List items with filters and pagination.
   */
  async listItems(
    params: ListItemsParams,
    ctx: ServiceContext,
  ): Promise<{ items: ItemSummary[]; total: number; hasMore: boolean }> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;

    // Build query filter
    const filter: Record<string, unknown> = {
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
    };

    if (params.type) filter['type'] = params.type;
    if (!params.includeSubtasks && !params.type) {
      filter['type'] = { $in: ['goal', 'story', 'task'] };
    }
    if (params.status) filter['status'] = params.status;
    if (params.priority) filter['priority'] = params.priority;
    if (params.parentId) filter['parentId'] = new mongoose.Types.ObjectId(params.parentId);

    if (params.dueBefore || params.dueAfter) {
      const dueFilter: Record<string, Date> = {};
      if (params.dueBefore) dueFilter['$lte'] = new Date(params.dueBefore);
      if (params.dueAfter) dueFilter['$gte'] = new Date(params.dueAfter);
      filter['dueAt'] = dueFilter;
    }

    const [items, total] = await Promise.all([
      Item.find(filter)
        .sort({ priority: 1, dueAt: 1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Item.countDocuments(filter),
    ]);

    // Batch-fetch parent titles
    const parentIds = items
      .filter(i => i.parentId)
      .map(i => i.parentId!);
    const parents = parentIds.length > 0
      ? await Item.find({ _id: { $in: parentIds } }).lean()
      : [];
    const parentMap = new Map(parents.map(p => [p._id.toString(), p['title'] as string]));

    return {
      items: items.map(i =>
        toItemSummary(
          i as Record<string, unknown>,
          i.parentId ? parentMap.get(i.parentId.toString()) ?? null : null,
        ),
      ),
      total,
      hasMore: offset + limit < total,
    };
  },

  /**
   * Soft delete an item and cascade to children.
   */
  async softDeleteItem(
    taskId: string,
    reason: string | undefined,
    ctx: ServiceContext,
  ): Promise<{ deletedCount: number; deletedIds: string[] }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // Find the item (including already-deleted check explicitly)
        const item = await Item.findOne({ _id: taskId, deletedAt: null }).session(session);
        if (!item) throw new NotFoundError('Item', taskId);
        if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

        // Find all descendants recursively
        const allIds = [item._id];
        const toProcess = [item._id];

        while (toProcess.length > 0) {
          const currentId = toProcess.pop()!;
          const children = await Item.find(
            { parentId: currentId, deletedAt: null },
            { _id: 1 },
          ).session(session).lean();

          for (const child of children) {
            allIds.push(child._id);
            toProcess.push(child._id);
          }
        }

        // Soft delete all
        const now = new Date();
        await Item.updateMany(
          { _id: { $in: allIds } },
          { $set: { deletedAt: now } },
        ).session(session);

        // Log activity for the root item
        await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'deleted',
              changes: [
                { field: 'deletedAt', from: null, to: now.toISOString() },
                { field: 'cascadedCount', from: null, to: allIds.length },
              ],
              reason,
            },
          ],
          { session },
        );

        const deletedIds = allIds.map(id => id.toString());
        log.info({ rootId: taskId, deletedCount: allIds.length }, 'Item soft-deleted with cascade');

        return { deletedCount: allIds.length, deletedIds };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Restore a soft-deleted item and its children.
   */
  async restoreItem(
    taskId: string,
    ctx: ServiceContext,
  ): Promise<{ restoredCount: number }> {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // Find the deleted item
        const item = await Item.findOne({ _id: taskId, deletedAt: { $ne: null } }).session(session);
        if (!item) throw new NotFoundError('Deleted item', taskId);
        if (item.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

        // Find all deleted descendants
        const allIds = [item._id];
        const toProcess = [item._id];

        while (toProcess.length > 0) {
          const currentId = toProcess.pop()!;
          const children = await Item.find(
            { parentId: currentId, deletedAt: { $ne: null } },
            { _id: 1 },
          ).session(session).lean();

          for (const child of children) {
            allIds.push(child._id);
            toProcess.push(child._id);
          }
        }

        // Restore all
        await Item.updateMany(
          { _id: { $in: allIds } },
          { $set: { deletedAt: null } },
        ).session(session);

        await Activity.create(
          [
            {
              itemId: item._id,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'restored',
              changes: [
                { field: 'deletedAt', from: item.deletedAt?.toISOString() ?? null, to: null },
                { field: 'cascadedCount', from: null, to: allIds.length },
              ],
            },
          ],
          { session },
        );

        log.info({ rootId: taskId, restoredCount: allIds.length }, 'Item restored with cascade');

        return { restoredCount: allIds.length };
      });
    } finally {
      await session.endSession();
    }
  },
};
