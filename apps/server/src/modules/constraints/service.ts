/**
 * Constraints + Unknowns service.
 *
 * Constraints are immutable facts about the project (budgets, hard deadlines, etc.).
 * Unknowns are tracked gaps in information — resolved when the answer is found.
 */
import mongoose from 'mongoose';
import { Constraint, Unknown } from './model.js';
import { Item } from '../items/model.js'
import { NotFoundError, ForbiddenError, ValidationError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';
import type {
  ServiceContext,
  AddConstraintInput,
  ListConstraintsInput,
  DeleteConstraintInput,
  AddUnknownInput,
  ResolveUnknownInput,
  ListUnknownsInput,
  ManageConstraintsInput,
  ManageUnknownsInput,
} from '@assistant/shared';

const log = createModuleLogger('constraints');

export const constraintsService = {

  // ─── Constraints ────────────────────────────────────────────────────────

  async addConstraint(params: AddConstraintInput, ctx: ServiceContext) {
    // If goalId provided, verify it belongs to this user
    if (params.goalId) {
      const goal = await Item.findById(params.goalId).lean();
      if (!goal) throw new NotFoundError('Goal', params.goalId);
      if ((goal['ownerId'] as mongoose.Types.ObjectId).toString() !== ctx.userId) {
        throw new ForbiddenError();
      }
    }

    const constraint = await Constraint.create({
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
      goalId: params.goalId ? new mongoose.Types.ObjectId(params.goalId) : undefined,
      type: params.type,
      value: params.value,
      description: params.description,
    });

    log.info({ constraintId: constraint._id, type: params.type }, 'Constraint added');

    return {
      constraint: {
        id: constraint._id.toString(),
        goalId: constraint.goalId?.toString() ?? null,
        type: constraint.type,
        value: constraint.value,
        description: constraint.description,
        createdAt: constraint.createdAt.toISOString(),
      },
    };
  },

  async listConstraints(params: ListConstraintsInput, ctx: ServiceContext) {
    const filter: Record<string, unknown> = {
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
    };

    if (params.goalId) {
      // Goal-scoped + global constraints both
      filter['$or'] = [
        { goalId: new mongoose.Types.ObjectId(params.goalId) },
        { goalId: { $exists: false } },
      ];
    }

    if (params.type) {
      filter['type'] = params.type;
    }

    const constraints = await Constraint.find(filter).sort({ createdAt: -1 }).lean();

    return constraints.map(c => ({
      id: c._id.toString(),
      goalId: c.goalId?.toString() ?? null,
      type: c.type,
      value: c.value,
      description: c.description,
      createdAt: c.createdAt.toISOString(),
    }));
  },

  async deleteConstraint(params: DeleteConstraintInput, ctx: ServiceContext) {
    const constraint = await Constraint.findById(params.constraintId);
    if (!constraint) throw new NotFoundError('Constraint', params.constraintId);
    if (constraint.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

    await constraint.deleteOne();
    log.info({ constraintId: params.constraintId }, 'Constraint deleted');

    return { deleted: true };
  },

  // ─── Unknowns ────────────────────────────────────────────────────────────

  async addUnknown(params: AddUnknownInput, ctx: ServiceContext) {
    if (params.goalId) {
      const goal = await Item.findById(params.goalId).lean();
      if (!goal) throw new NotFoundError('Goal', params.goalId);
      if ((goal['ownerId'] as mongoose.Types.ObjectId).toString() !== ctx.userId) {
        throw new ForbiddenError();
      }
    }

    const unknown = await Unknown.create({
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
      goalId: params.goalId ? new mongoose.Types.ObjectId(params.goalId) : undefined,
      title: params.title,
      description: params.description,
    });

    log.info({ unknownId: unknown._id }, 'Unknown added');

    return {
      unknown: {
        id: unknown._id.toString(),
        goalId: unknown.goalId?.toString() ?? null,
        title: unknown.title,
        description: unknown.description ?? null,
        resolvedAt: null,
        resolvedValue: null,
        createdAt: unknown.createdAt.toISOString(),
      },
    };
  },

  async resolveUnknown(params: ResolveUnknownInput, ctx: ServiceContext) {
    const unknown = await Unknown.findById(params.unknownId);
    if (!unknown) throw new NotFoundError('Unknown', params.unknownId);
    if (unknown.ownerId.toString() !== ctx.userId) throw new ForbiddenError();

    unknown.resolvedAt = new Date();
    unknown.resolvedValue = params.resolvedValue;
    await unknown.save();

    log.info({ unknownId: params.unknownId, resolvedValue: params.resolvedValue }, 'Unknown resolved');

    return {
      unknown: {
        id: unknown._id.toString(),
        goalId: unknown.goalId?.toString() ?? null,
        title: unknown.title,
        description: unknown.description ?? null,
        resolvedAt: unknown.resolvedAt.toISOString(),
        resolvedValue: unknown.resolvedValue ?? null,
        createdAt: unknown.createdAt.toISOString(),
      },
    };
  },

  async manageUnknowns(params: ManageUnknownsInput, ctx: ServiceContext) {
    if (params.action === 'add') {
      if (!params.title) {
        throw new ValidationError('title is required when adding an unknown');
      }
      return await this.addUnknown({
        goalId: params.goalId,
        title: params.title,
        description: params.description,
        requestId: params.requestId,
      }, ctx);
    } else {
      if (!params.unknownId || !params.resolvedValue) {
        throw new ValidationError('unknownId and resolvedValue are required when resolving an unknown');
      }
      return await this.resolveUnknown({
        unknownId: params.unknownId,
        resolvedValue: params.resolvedValue,
        reason: params.reason,
      }, ctx);
    }
  },

  async listUnknowns(params: ListUnknownsInput, ctx: ServiceContext) {
    const filter: Record<string, unknown> = {
      ownerId: new mongoose.Types.ObjectId(ctx.userId),
    };

    if (params.goalId) {
      filter['$or'] = [
        { goalId: new mongoose.Types.ObjectId(params.goalId) },
        { goalId: { $exists: false } },
      ];
    }

    if (params.onlyUnresolved) {
      filter['resolvedAt'] = null;
    }

    const unknowns = await Unknown.find(filter).sort({ createdAt: -1 }).lean();

    return unknowns.map(u => ({
      id: u._id.toString(),
      goalId: u.goalId?.toString() ?? null,
      title: u.title,
      description: u.description ?? null,
      resolvedAt: u.resolvedAt ? u.resolvedAt.toISOString() : null,
      resolvedValue: u.resolvedValue ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  },

  async manageConstraints(params: ManageConstraintsInput, ctx: ServiceContext) {
    if (params.action === 'add') {
      if (!params.type || !params.value || !params.description) {
        throw new ValidationError('type, value, and description are required when adding a constraint');
      }
      return await this.addConstraint({
        goalId: params.goalId,
        type: params.type,
        value: params.value,
        description: params.description,
        requestId: params.requestId,
      }, ctx);
    } else {
      if (!params.constraintId) {
        throw new ValidationError('constraintId is required when deleting a constraint');
      }
      return await this.deleteConstraint({
        constraintId: params.constraintId,
        reason: params.reason,
      }, ctx);
    }
  },
};
