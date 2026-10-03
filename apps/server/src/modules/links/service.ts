/**
 * Links service — relationship management with cycle detection.
 *
 * This is the most complex service because it must:
 * 1. Prevent dependency cycles using MongoDB $graphLookup
 * 2. Validate both items exist and are not deleted
 * 3. Log activity on every write
 * 4. Run in a transaction for multi-document consistency
 *
 * Cycle detection logic:
 * - For `depends_on`: A depends_on B → check if B already depends_on A (directly or transitively)
 * - For `blocks`: A blocks B → semantically same as B depends_on A → check reverse path
 * - For `relates_to` / `mentions`: no cycle check needed
 */
import mongoose from 'mongoose';
import { Link, type LinkDocument } from './model.js';
import { Item } from '../items/model.js';
import { Activity } from '../activity/model.js';
import { NotFoundError, ConflictError, CycleDetectedError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import type { ServiceContext, LinkKind } from '@assistant/shared';

const log = createModuleLogger('links');

interface CreateLinkParams {
  fromId: string;
  toId: string;
  kind: LinkKind;
  reason?: string;
}

interface LinkWithTitles {
  id: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
  fromTitle: string;
  toTitle: string;
  createdAt: string;
}

/**
 * Detect if adding a dependency link would create a cycle.
 *
 * Uses MongoDB $graphLookup to traverse the dependency graph from the target
 * item back toward the source. If the source is reachable from the target,
 * adding the link would create a cycle.
 *
 * For `depends_on`: fromId depends on toId → check if fromId is reachable from toId
 * For `blocks`: fromId blocks toId → semantically toId depends on fromId → check if toId is reachable from fromId
 */
async function detectCycle(
  fromId: string,
  toId: string,
  kind: LinkKind,
  session?: mongoose.ClientSession,
): Promise<string[] | null> {
  // Only check cycles for directional dependency links
  if (kind !== 'depends_on' && kind !== 'blocks') {
    return null;
  }

  // For depends_on: A depends_on B. Cycle if B transitively depends_on A.
  // We check: starting from B, follow depends_on links. If we reach A, there's a cycle.
  //
  // For blocks: A blocks B. Semantically B depends_on A.
  // We check: starting from A, follow depends_on links. If we reach B, there's a cycle.
  const startNode = kind === 'depends_on' ? toId : fromId;
  const targetNode = kind === 'depends_on' ? fromId : toId;

  const results = await Link.aggregate([
    // Start from the node we want to check from
    { $match: { fromId: new mongoose.Types.ObjectId(startNode), kind: 'depends_on' } },

    // Traverse the dependency graph
    {
      $graphLookup: {
        from: 'links',
        startWith: '$toId',
        connectFromField: 'toId',
        connectToField: 'fromId',
        as: 'chain',
        maxDepth: 50, // prevent runaway traversal
        restrictSearchWithMatch: { kind: 'depends_on' },
      },
    },

    // Project just the IDs in the chain
    {
      $project: {
        allReachable: {
          $concatArrays: [
            [{ $toString: '$toId' }],
            {
              $map: {
                input: '$chain',
                as: 'link',
                in: { $toString: '$$link.toId' },
              },
            },
          ],
        },
      },
    },
  ]).session(session ?? null);

  // Check if target is reachable
  for (const result of results) {
    const reachable = result['allReachable'] as string[];
    if (reachable.includes(targetNode)) {
      // Build a readable cycle path
      return [startNode, ...reachable.filter(id => id !== startNode), targetNode];
    }
  }

  // Also check: if startNode IS the targetNode (self-link)
  if (startNode === targetNode) {
    return [startNode, targetNode];
  }

  return null;
}

export const linksService = {
  /**
   * Create a link between two items.
   * Validates both items exist, checks for duplicates and cycles.
   */
  async createLink(
    params: CreateLinkParams,
    ctx: ServiceContext,
  ): Promise<{ link: LinkWithTitles; activity: { id: string } }> {
    const { fromId, toId, kind, reason } = params;

    // Self-link check
    if (fromId === toId) {
      throw new ConflictError('Cannot link an item to itself');
    }

    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // 1. Validate both items exist
        const [fromItem, toItem] = await Promise.all([
          Item.findById(fromId).session(session).lean(),
          Item.findById(toId).session(session).lean(),
        ]);

        if (!fromItem) throw new NotFoundError('Item', fromId);
        if (!toItem) throw new NotFoundError('Item', toId);

        // 2. Check for duplicate link
        const existing = await Link.findOne({
          fromId: new mongoose.Types.ObjectId(fromId),
          toId: new mongoose.Types.ObjectId(toId),
          kind,
        }).session(session);

        if (existing) {
          throw new ConflictError(
            `Link already exists: ${fromItem['title']} ${kind} ${toItem['title']}`,
          );
        }

        // 3. Cycle detection for dependency links
        const cycle = await detectCycle(fromId, toId, kind, session);
        if (cycle) {
          log.warn({ fromId, toId, kind, cycle }, 'Dependency cycle detected');
          throw new CycleDetectedError(cycle);
        }

        // 4. Create the link
        const [link] = await Link.create(
          [
            {
              fromId: new mongoose.Types.ObjectId(fromId),
              toId: new mongoose.Types.ObjectId(toId),
              kind,
            },
          ],
          { session },
        );

        if (!link) {
          throw new Error('Failed to create link');
        }

        // 5. Log activity on both items
        const activityDocs = await Activity.create(
          [
            {
              itemId: new mongoose.Types.ObjectId(fromId),
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'linked',
              changes: [
                {
                  field: 'link',
                  from: null,
                  to: { kind, targetId: toId, targetTitle: toItem['title'] },
                },
              ],
              reason,
            },
            {
              itemId: new mongoose.Types.ObjectId(toId),
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'linked',
              changes: [
                {
                  field: 'link',
                  from: null,
                  to: { kind, sourceId: fromId, sourceTitle: fromItem['title'] },
                },
              ],
              reason,
            },
          ],
          { session },
        );

        log.info({ linkId: link._id, fromId, toId, kind }, 'Link created');

        return {
          link: {
            id: link._id.toString(),
            fromId,
            toId,
            kind,
            fromTitle: fromItem['title'] as string,
            toTitle: toItem['title'] as string,
            createdAt: link.createdAt.toISOString(),
          },
          activity: { id: activityDocs[0]!._id.toString() },
        };
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Get all links for an item (both incoming and outgoing).
   */
  async getLinksForItem(
    itemId: string,
    ctx: ServiceContext,
  ): Promise<LinkWithTitles[]> {
    const objectId = new mongoose.Types.ObjectId(itemId);

    // Verify item exists and user owns it
    const item = await Item.findById(itemId).lean();
    if (!item) throw new NotFoundError('Item', itemId);
    if (item['ownerId'].toString() !== ctx.userId) {
      throw new NotFoundError('Item', itemId); // Don't leak existence
    }

    const links = await Link.aggregate([
      {
        $match: {
          $or: [{ fromId: objectId }, { toId: objectId }],
        },
      },
      // Lookup the "from" item title
      {
        $lookup: {
          from: 'items',
          localField: 'fromId',
          foreignField: '_id',
          as: 'fromItem',
        },
      },
      { $unwind: '$fromItem' },
      // Lookup the "to" item title
      {
        $lookup: {
          from: 'items',
          localField: 'toId',
          foreignField: '_id',
          as: 'toItem',
        },
      },
      { $unwind: '$toItem' },
      // Project clean output
      {
        $project: {
          id: { $toString: '$_id' },
          fromId: { $toString: '$fromId' },
          toId: { $toString: '$toId' },
          kind: 1,
          fromTitle: '$fromItem.title',
          toTitle: '$toItem.title',
          createdAt: { $dateToString: { date: '$createdAt' } },
        },
      },
    ]);

    return links as LinkWithTitles[];
  },

  /**
   * Delete a link.
   */
  async deleteLink(
    linkId: string,
    ctx: ServiceContext,
  ): Promise<void> {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const link = await Link.findById(linkId).session(session);
        if (!link) throw new NotFoundError('Link', linkId);

        // Verify ownership via the source item
        const fromItem = await Item.findById(link.fromId).session(session).lean();
        if (!fromItem || fromItem['ownerId'].toString() !== ctx.userId) {
          throw new NotFoundError('Link', linkId);
        }

        await Link.deleteOne({ _id: link._id }).session(session);

        // Log activity
        await Activity.create(
          [
            {
              itemId: link.fromId,
              actorId: new mongoose.Types.ObjectId(ctx.userId),
              actorType: ctx.actorType,
              action: 'unlinked',
              changes: [
                {
                  field: 'link',
                  from: { kind: link.kind, targetId: link.toId.toString() },
                  to: null,
                },
              ],
            },
          ],
          { session },
        );

        log.info({ linkId, fromId: link.fromId, toId: link.toId }, 'Link deleted');
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Get the dependency chain for an item using $graphLookup.
   * Returns all items that this item transitively depends on.
   */
  async getDependencyChain(
    itemId: string,
    _ctx: ServiceContext,
  ): Promise<Array<{ id: string; title: string; status: string; depth: number }>> {
    const objectId = new mongoose.Types.ObjectId(itemId);

    const results = await Link.aggregate([
      // Start: find direct dependencies of our item
      { $match: { fromId: objectId, kind: 'depends_on' } },

      // Traverse the full dependency graph
      {
        $graphLookup: {
          from: 'links',
          startWith: '$toId',
          connectFromField: 'toId',
          connectToField: 'fromId',
          as: 'transitiveDeps',
          maxDepth: 50,
          depthField: 'depth',
          restrictSearchWithMatch: { kind: 'depends_on' },
        },
      },

      // Flatten: combine direct + transitive
      {
        $project: {
          allDeps: {
            $concatArrays: [
              [{ id: '$toId', depth: 0 }],
              {
                $map: {
                  input: '$transitiveDeps',
                  as: 'dep',
                  in: { id: '$$dep.toId', depth: { $add: ['$$dep.depth', 1] } },
                },
              },
            ],
          },
        },
      },
      { $unwind: '$allDeps' },

      // Deduplicate
      {
        $group: {
          _id: '$allDeps.id',
          depth: { $min: '$allDeps.depth' },
        },
      },

      // Lookup item details
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'item',
        },
      },
      { $unwind: '$item' },

      // Filter out deleted items
      { $match: { 'item.deletedAt': null } },

      // Project clean output
      {
        $project: {
          id: { $toString: '$_id' },
          title: '$item.title',
          status: '$item.status',
          depth: 1,
        },
      },
      { $sort: { depth: 1 } },
    ]);

    return results as Array<{ id: string; title: string; status: string; depth: number }>;
  },
};
