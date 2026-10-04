/**
 * MCP Transport — Streamable HTTP transport for MCP protocol.
 *
 * This sets up the MCP server using the official SDK and wires it
 * into Express routes. Each endpoint slug resolves to a filtered
 * set of tools via the endpoint's toolAllowlist.
 *
 * Security:
 * - tools/list returns ONLY allowlisted tools
 * - tools/call RE-CHECKS allowlist (not just filtering)
 * - Endpoint slug is routing, NOT authentication
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { Endpoint } from '../modules/endpoints/model.js';
import { oauthService } from '../modules/auth/oauth-service.js';
import { toolRegistry } from './registry.js';
import { registerAllTools } from './tools.js';
import { createModuleLogger } from '../config/index.js';
import { ForbiddenError, AppError } from '../errors.js';
import type { ServiceContext } from '@assistant/shared';

import { externalMcpService } from '../modules/integrations/service.js';
import { User } from '../modules/auth/model.js';

const log = createModuleLogger('mcp');

// Register all P1 and P2 tools at startup
registerAllTools();

/**
 * Handle an MCP request for a specific endpoint slug.
 *
 * Flow:
 * 1. Resolve endpoint by slug
 * 2. Authenticate: Bearer Token or endpoint owner
 * 3. Create MCP server scoped to this endpoint's allowlist
 * 4. Process the request through MCP protocol
 */
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const slug = req.params['slug'];

  if (!slug) {
    res.status(400).json({ error: 'Missing endpoint slug' });
    return;
  }

  // 1. Resolve endpoint
  const endpoint = await Endpoint.findOne({ slug, status: 'active' });
  if (!endpoint) {
    res.status(404).json({ error: 'Endpoint not found or revoked' });
    return;
  }

  // 2. Authenticate: Bearer token or fallback to endpoint owner
  let authenticatedUserId = endpoint.ownerId.toString();
  let effectiveScopes = endpoint.scopes;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tokenStr = authHeader.slice(7).trim();
    const tokenInfo = await oauthService.verifyBearerToken(tokenStr);
    if (!tokenInfo) {
      res.status(401).json({ error: 'Invalid or expired Bearer token' });
      return;
    }
    authenticatedUserId = tokenInfo.user.id;
    // Effective permission = token scopes ∩ endpoint allowlist
    effectiveScopes = endpoint.scopes.filter((s) => tokenInfo.scopes.includes(s));
  }

  const ctx: ServiceContext = {
    userId: authenticatedUserId,
    actorType: 'ai',
    endpointScopes: effectiveScopes,
  };

  // Load user's connected external MCP servers (e.g. Spent App)
  const externalMcps = await externalMcpService.getUserIntegrations(authenticatedUserId);
  const externalTools = externalMcps.flatMap((m) =>
    (m.tools || [])
      .map((t) => {
        const raw = (t as any).toObject ? (t as any).toObject() : t;
        const name = String(raw.name || t.name || '').trim();
        if (!name) return null;
        return {
          name,
          description: String(raw.description || t.description || `Remote tool from ${m.name}`),
          inputSchema: (raw.inputSchema || (t as any).inputSchema || { type: 'object', properties: {} }) as {
            type: 'object';
            properties?: Record<string, unknown>;
          },
          mcpUrl: m.url,
          authToken: m.authToken,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
  );

  // Workflow-basis scoping: Only include remote tools allowed for this specific workflow
  const allowedRemoteTools = externalTools.filter((t) =>
    endpoint.toolAllowlist.includes(t.name)
  );

  // 3. Create a per-request MCP server using low-level Server class
  const server = new Server(
    {
      name: `assistant-${endpoint.name}`,
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: endpoint.instructions ? {} : undefined,
      },
    },
  );

  // 4. Handle tools/list — return allowed native tools + allowed workflow external tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allowedTools = toolRegistry.getFiltered(endpoint.toolAllowlist, effectiveScopes);
    const nativeTools = allowedTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as {
        type: 'object';
        properties?: Record<string, unknown>;
      },
    }));

    const remoteTools = allowedRemoteTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    return {
      tools: [...nativeTools, ...remoteTools],
    };
  });

  // 5. Handle tools/call — Proxy external tools or execute native tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    // Check if it's an allowed external tool from a connected server (e.g. Spent App)
    const remoteTool = allowedRemoteTools.find((t) => t.name === toolName);
    if (remoteTool) {
      log.info(
        { tool: toolName, url: remoteTool.mcpUrl, userId: ctx.userId },
        'Proxying tool call to remote external MCP server',
      );
      // Auto-inject user's saved Spent App bearer token
      const userDoc = await User.findById(ctx.userId);
      const token = remoteTool.authToken || userDoc?.spentBearer;
      const res = await externalMcpService.proxyToolCall(remoteTool.mcpUrl, toolName, args, token);
      return res as unknown as Record<string, unknown>;
    }

    // SECURITY: Re-check allowlist on every native call
    if (!toolRegistry.isAllowed(toolName, endpoint.toolAllowlist, endpoint.scopes)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'FORBIDDEN', message: `Tool '${toolName}' is not allowed on this endpoint` }),
          },
        ],
        isError: true,
      } as Record<string, unknown>;
    }

    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'NOT_FOUND', message: `Tool '${toolName}' not found` }) }],
        isError: true,
      } as Record<string, unknown>;
    }

    log.info(
      { endpoint: endpoint.name, tool: toolName, userId: ctx.userId },
      'MCP tool called',
    );

    try {
      const result = await tool.handler(args, ctx);
      return { ...result } as Record<string, unknown>;
    } catch (err) {
      if (err instanceof AppError) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.code, message: err.message }) }],
          isError: true,
        } as Record<string, unknown>;
      }
      log.error({ err, tool: toolName }, 'Unexpected tool error');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }) }],
        isError: true,
      } as Record<string, unknown>;
    }
  });

  // 6. If the endpoint has instructions, register resource handlers
  if (endpoint.instructions) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'assistant://instructions',
          name: 'Workflow Instructions',
          description: 'Instructions for how this AI workflow should behave',
          mimeType: 'text/plain',
        },
      ],
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'assistant://instructions') {
        return {
          contents: [
            {
              uri: 'assistant://instructions',
              mimeType: 'text/plain',
              text: endpoint.instructions!,
            },
          ],
        };
      }
      throw new Error(`Resource not found: ${request.params.uri}`);
    });
  }

  // 7. Process via Streamable HTTP transport
  try {
    // Normalize Accept header: ensure test harnesses, curl, and HTTP clients succeed
    const acceptHeader = req.headers['accept'] || '';
    if (!acceptHeader.includes('text/event-stream')) {
      req.headers['accept'] = acceptHeader
        ? `${acceptHeader}, text/event-stream`
        : 'application/json, text/event-stream';
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log.error({ err, slug }, 'MCP request failed');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP error' });
    }
  }
}

/**
 * Handle MCP DELETE requests (session cleanup).
 */
export async function handleMcpDelete(_req: Request, res: Response): Promise<void> {
  // Stateless mode — nothing to clean up
  res.status(200).json({ ok: true });
}
