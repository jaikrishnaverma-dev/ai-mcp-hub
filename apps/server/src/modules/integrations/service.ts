import { ExternalMcp, type ExternalMcpTool, type ExternalMcpDocument } from './model.js';
import { logger } from '../../config/index.js';
import { AppError } from '../../errors.js';

export interface RemoteToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export class ExternalMcpService {
  /**
   * Ping a remote MCP server and fetch its tools via JSON-RPC 2.0 tools/list.
   */
  async fetchRemoteTools(url: string, token?: string): Promise<ExternalMcpTool[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        }),
      });

      if (!res.ok) {
        throw new Error(`Remote MCP returned HTTP status ${res.status}`);
      }

      // Check if SSE event-stream or plain JSON
      const text = await res.text();
      let data: any;

      if (text.includes('data:')) {
        const line = text.split('\n').find((l) => l.trim().startsWith('data:'));
        if (line) {
          data = JSON.parse(line.replace('data:', '').trim());
        }
      } else {
        data = JSON.parse(text);
      }

      if (data?.error) {
        throw new Error(data.error.message || 'Remote MCP error');
      }

      const rawTools = data?.result?.tools || [];
      return rawTools.map((t: any) => ({
        name: String(t.name),
        description: String(t.description || ''),
        inputSchema: t.inputSchema || {},
      }));
    } catch (err) {
      logger.error({ err, url }, 'Failed to fetch remote MCP tools');
      throw new AppError(
        `Failed to reach remote MCP server at ${url}: ${err instanceof Error ? err.message : String(err)}`,
        502,
        'BAD_GATEWAY',
      );
    }
  }

  /**
   * Forward a tool call to the remote MCP server.
   */
  async proxyToolCall(
    url: string,
    toolName: string,
    args: Record<string, unknown>,
    token?: string,
  ): Promise<RemoteToolResult> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const payloadArgs = { ...args };
      if (token && !payloadArgs['access_token']) {
        payloadArgs['access_token'] = token;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: payloadArgs,
          },
        }),
      });

      const text = await res.text();
      let data: any;

      if (text.includes('data:')) {
        const line = text.split('\n').find((l) => l.trim().startsWith('data:'));
        if (line) {
          data = JSON.parse(line.replace('data:', '').trim());
        }
      } else {
        data = JSON.parse(text);
      }

      if (data?.error) {
        return {
          content: [{ type: 'text', text: JSON.stringify(data.error) }],
          isError: true,
        };
      }

      return (
        data?.result || {
          content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
        }
      );
    } catch (err) {
      logger.error({ err, toolName, url }, 'Failed to proxy tool call to remote MCP');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'PROXY_ERROR',
              message: `Failed to execute remote tool ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  async getUserIntegrations(userId: string): Promise<ExternalMcpDocument[]> {
    return ExternalMcp.find({ userId, status: 'active' }).sort({ createdAt: -1 });
  }

  /**
   * Add or update an external MCP integration.
   * If an integration with the same URL already exists for this user, it updates
   * the tools and credentials in-place rather than creating duplicates.
   */
  async addIntegration(
    userId: string,
    data: { name: string; url: string; authToken?: string },
  ): Promise<{ doc: ExternalMcpDocument; isNew: boolean }> {
    const trimmedUrl = data.url.trim().replace(/\/+$/, '');
    const tools = await this.fetchRemoteTools(trimmedUrl, data.authToken);

    // Look for existing integration by normalized URL
    const existing = await ExternalMcp.findOne({
      userId,
      $or: [
        { url: trimmedUrl },
        { url: `${trimmedUrl}/` },
        { url: data.url.trim() },
      ],
    });

    if (existing) {
      existing.name = data.name.trim();
      existing.url = trimmedUrl;
      if (data.authToken !== undefined && data.authToken.trim() !== '') {
        existing.authToken = data.authToken.trim();
      }
      existing.tools = tools;
      existing.status = 'active';
      await existing.save();

      logger.info({ userId, integrationId: existing._id, name: existing.name }, 'Updated existing external MCP integration');
      return { doc: existing, isNew: false };
    }

    const doc = await ExternalMcp.create({
      userId,
      name: data.name.trim(),
      url: trimmedUrl,
      authToken: data.authToken?.trim() || undefined,
      tools,
      status: 'active',
    });

    logger.info({ userId, integrationId: doc._id, name: doc.name }, 'Created new external MCP integration');
    return { doc, isNew: true };
  }

  /**
   * Re-sync/refresh remote tools for an existing external MCP integration.
   */
  async refreshIntegration(userId: string, id: string): Promise<ExternalMcpDocument> {
    const integration = await ExternalMcp.findOne({ _id: id, userId });
    if (!integration) {
      throw new AppError('External MCP integration not found', 404, 'NOT_FOUND');
    }

    const tools = await this.fetchRemoteTools(integration.url, integration.authToken);
    integration.tools = tools;
    integration.status = 'active';
    await integration.save();

    logger.info({ userId, integrationId: id, toolCount: tools.length }, 'Refreshed external MCP tools');
    return integration;
  }

  async removeIntegration(userId: string, id: string): Promise<boolean> {
    const res = await ExternalMcp.deleteOne({ _id: id, userId });
    return res.deletedCount > 0;
  }
}

export const externalMcpService = new ExternalMcpService();
