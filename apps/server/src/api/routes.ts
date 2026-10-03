/**
 * REST API routes for Portal and HTTP clients.
 *
 * Implements the same domain services used by the MCP tools.
 * Rules:
 * - Handlers: validate → call domain service → format response
 * - No business logic in handlers
 * - Zod validation
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  createTaskInput,
  updateTaskInput,
  listTasksInput,
  getDailyBriefInput,
  logDecisionInput,
  setBlockerInput,
  createLinkInput,
  type ServiceContext,
  type ItemType,
} from '@assistant/shared';
import { itemsService } from '../modules/items/service.js';
import { linksService } from '../modules/links/service.js';
import { decisionsService } from '../modules/decisions/service.js';
import { blockersService } from '../modules/blockers/service.js';
import { plannerService } from '../modules/planner/service.js';
import { toolRegistry } from '../mcp/registry.js';
import { Decision } from '../modules/decisions/model.js';
import { Blocker } from '../modules/blockers/model.js';
import { Endpoint } from '../modules/endpoints/model.js';
import { User } from '../modules/auth/model.js';
import { Activity } from '../modules/activity/model.js';
import { AppError, NotFoundError } from '../errors.js';

export const apiRouter: Router = Router();

/**
 * Middleware: build user ServiceContext.
 * Accepts x-user-id header to switch users, otherwise falls back to first user in DB.
 */
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requestedUserId = req.headers['x-user-id'] as string | undefined;

    let user = null;
    if (requestedUserId && requestedUserId !== 'none' && mongoose.isValidObjectId(requestedUserId)) {
      user = await User.findById(requestedUserId);
    }

    if (requestedUserId === 'none') {
      // Explicitly logged out session
      (req as Request & { ctx?: ServiceContext; currentUser?: any }).currentUser = null;
      next();
      return;
    }

    if (!user) {
      user = await User.findOne({});
    }
    if (!user) {
      user = await User.create({
        externalId: 'demo-user-001',
        email: 'jai@example.com',
        name: 'Jai',
        timezone: 'Asia/Kolkata',
      });
    }

    const userId = user._id.toString();

    (req as Request & { ctx: ServiceContext; currentUser: typeof user }).ctx = {
      userId,
      actorType: 'user',
    };
    (req as Request & { ctx: ServiceContext; currentUser: typeof user }).currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

apiRouter.use(requireAuth);

function getCtx(req: Request): ServiceContext {
  const ctx = (req as Request & { ctx?: ServiceContext }).ctx;
  if (!ctx) {
    throw new AppError('Authentication required. Please sign in.', 401, 'UNAUTHORIZED');
  }
  return ctx;
}

// ==============================================================================
// 1. Auth & Users Management
// ==============================================================================

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = (req as Request & { currentUser: any }).currentUser;
  if (!user) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      externalId: user.externalId,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

apiRouter.get('/auth/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({}).sort({ createdAt: 1 }).lean();
    res.json({
      users: users.map(u => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        timezone: u.timezone,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    let user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      user = await User.create({
        externalId: `user-${Date.now()}`,
        email: email.toLowerCase().trim(),
        name: name || email.split('@')[0],
        timezone: 'Asia/Kolkata',
      });
    }

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        timezone: user.timezone,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 2. MCP Server & Endpoints Management
// ==============================================================================

// Tool Catalog — all available tools that can be bound to endpoints
apiRouter.get('/mcp-catalog', (_req: Request, res: Response) => {
  const allTools = toolRegistry.getAll();
  res.json({
    tools: allTools.map(t => ({
      name: t.name,
      description: t.description,
      requiredScope: t.requiredScope,
      inputSchema: t.inputSchema,
    })),
  });
});

// List Endpoints for the logged-in user
apiRouter.get('/endpoints', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = getCtx(req);
    let endpoints = await Endpoint.find({ ownerId: ctx.userId }).sort({ createdAt: -1 }).lean();

    // If this user has no endpoints yet, provision default workflow groups
    if (endpoints.length === 0) {
      const defaultGroups = [
        {
          ownerId: ctx.userId,
          name: 'Daily Assistant',
          toolAllowlist: [
            'get_daily_brief',
            'create_task',
            'update_task',
            'complete_task',
            'list_tasks',
            'get_task',
            'log_decision',
            'link_tasks',
            'set_blocker',
          ],
          scopes: ['read', 'write'],
          instructions:
            "You are the user's Daily Assistant. Start conversations by calling get_daily_brief, surface blockers and urgent commitments, and help manage tasks and decisions.",
          status: 'active',
        },
        {
          ownerId: ctx.userId,
          name: 'Project Planner',
          toolAllowlist: [
            'list_tasks',
            'get_task',
            'create_task',
            'update_task',
            'link_tasks',
            'set_blocker',
            'log_decision',
          ],
          scopes: ['read', 'write'],
          instructions:
            'You are the Project Planner. Help break down initiatives, map dependencies with link_tasks, identify bottlenecks, and log architectural decisions.',
          status: 'active',
        },
        {
          ownerId: ctx.userId,
          name: 'Read-Only Observer',
          toolAllowlist: ['get_daily_brief', 'list_tasks', 'get_task'],
          scopes: ['read'],
          instructions:
            'You are a Read-Only Observer. You can inspect tasks and retrieve the daily brief, but cannot make edits or create data.',
          status: 'active',
        },
      ];

      for (const grp of defaultGroups) {
        await Endpoint.create(grp);
      }
      endpoints = await Endpoint.find({ ownerId: ctx.userId }).sort({ createdAt: -1 }).lean();
    }

    res.json({
      endpoints: endpoints.map(e => ({
        id: e._id.toString(),
        ownerId: e.ownerId.toString(),
        name: e.name,
        slug: e.slug,
        toolAllowlist: e.toolAllowlist,
        instructions: e.instructions ?? null,
        status: e.status,
        scopes: e.scopes,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Create new MCP Endpoint
const createEndpointSchema = z.object({
  name: z.string().min(1).max(100),
  toolAllowlist: z.array(z.string()).min(1).max(15),
  instructions: z.string().optional(),
  slug: z.string().optional(),
});

apiRouter.post('/endpoints', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createEndpointSchema.parse(req.body);
    const ctx = getCtx(req);

    const endpoint = await Endpoint.create({
      ownerId: ctx.userId,
      name: input.name,
      toolAllowlist: input.toolAllowlist,
      instructions: input.instructions,
      ...(input.slug ? { slug: input.slug } : {}),
      scopes: ['read', 'write'],
      status: 'active',
    });

    res.status(201).json({
      endpoint: {
        id: endpoint._id.toString(),
        name: endpoint.name,
        slug: endpoint.slug,
        toolAllowlist: endpoint.toolAllowlist,
        instructions: endpoint.instructions ?? null,
        status: endpoint.status,
        createdAt: endpoint.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Update MCP Endpoint (toggle status, edit allowlist)
apiRouter.patch('/endpoints/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const ctx = getCtx(req);
    const { status, toolAllowlist, name, instructions } = req.body;

    const endpoint = await Endpoint.findOne({ _id: id, ownerId: ctx.userId });
    if (!endpoint) throw new NotFoundError('Endpoint', id);

    if (status) endpoint.status = status;
    if (toolAllowlist && Array.isArray(toolAllowlist)) {
      if (toolAllowlist.length > 15) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Tool allowlist cannot exceed 15 tools' });
        return;
      }
      endpoint.toolAllowlist = toolAllowlist;
    }
    if (name) endpoint.name = name;
    if (instructions !== undefined) endpoint.instructions = instructions;

    await endpoint.save();

    res.json({
      endpoint: {
        id: endpoint._id.toString(),
        name: endpoint.name,
        slug: endpoint.slug,
        toolAllowlist: endpoint.toolAllowlist,
        instructions: endpoint.instructions ?? null,
        status: endpoint.status,
        createdAt: endpoint.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Delete MCP Endpoint
apiRouter.delete('/endpoints/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const ctx = getCtx(req);
    const result = await Endpoint.findOneAndDelete({ _id: id, ownerId: ctx.userId });
    if (!result) throw new NotFoundError('Endpoint', id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 3. Users' Data Browser & Management
// ==============================================================================

// Daily Brief
apiRouter.get('/daily-brief', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = getDailyBriefInput.parse(req.query);
    const brief = await plannerService.getDailyBrief(input, getCtx(req));
    res.json(brief);
  } catch (err) {
    next(err);
  }
});

// Items / Tasks
apiRouter.get('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listTasksInput.parse(req.query);
    const result = await itemsService.listItems(query, getCtx(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const item = await itemsService.getItem(id, getCtx(req));
    res.json(item);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = (req.body.type as ItemType) || 'task';
    const input = createTaskInput.parse(req.body);
    const result = await itemsService.createItem(
      { type, ...input },
      getCtx(req),
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

apiRouter.patch('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const input = updateTaskInput.parse({ ...req.body, taskId: id });
    const result = await itemsService.updateItem(input, getCtx(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/items/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const reason = req.body.reason as string | undefined;
    const result = await itemsService.completeItem(id, reason, getCtx(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

apiRouter.delete('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const reason = req.query['reason'] as string | undefined;
    const result = await itemsService.softDeleteItem(id, reason, getCtx(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Decisions
apiRouter.get('/decisions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt((req.query['limit'] as string) || '50', 10);
    const decisions = await Decision.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      decisions: decisions.map(d => ({
        id: d._id.toString(),
        itemId: d.itemId.toString(),
        summary: d.summary,
        rationale: d.rationale,
        decidedBy: d.decidedBy.toString(),
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/decisions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = logDecisionInput.parse(req.body);
    const decision = await decisionsService.logDecision(input, getCtx(req));
    res.status(201).json(decision);
  } catch (err) {
    next(err);
  }
});

// Blockers
apiRouter.get('/blockers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blockers = await Blocker.find({ resolvedAt: null })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      blockers: blockers.map(b => ({
        id: b._id.toString(),
        itemId: b.itemId.toString(),
        reason: b.reason,
        waitingOnUserId: b.waitingOnUserId ? b.waitingOnUserId.toString() : null,
        resolvedAt: null,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/blockers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = setBlockerInput.parse(req.body);
    const blocker = await blockersService.setBlocker(input, getCtx(req));
    res.status(201).json(blocker);
  } catch (err) {
    next(err);
  }
});

apiRouter.delete('/blockers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const reason = req.body?.reason as string | undefined;
    const result = await blockersService.resolveBlocker(id, reason, getCtx(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Links
apiRouter.post('/links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createLinkInput.parse(req.body);
    const link = await linksService.createLink(input, getCtx(req));
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
});

// Activity / Audit Log
apiRouter.get('/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt((req.query['limit'] as string) || '40', 10);
    const activities = await Activity.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      activities: activities.map(a => ({
        id: a._id.toString(),
        itemId: a.itemId.toString(),
        actorId: a.actorId.toString(),
        actorType: a.actorType,
        action: a.action,
        changes: a.changes,
        reason: a.reason ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Global error handler for REST API
apiRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...( 'details' in err ? { details: (err as Record<string, unknown>)['details'] } : {} ),
    });
    return;
  }

  if (err instanceof Error && (err.name === 'BSONError' || err.name === 'CastError' || err.message.includes('24 character hex'))) {
    res.status(400).json({
      error: 'INVALID_ID_FORMAT',
      message: 'Invalid ID format: must be a 24 character hex string',
    });
    return;
  }

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'Unknown server error',
  });
});
