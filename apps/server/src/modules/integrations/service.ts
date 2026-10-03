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

  async addIntegration(
    userId: string,
    data: { name: string; url: string; authToken?: string },
  ): Promise<ExternalMcpDocument> {
    const tools = await this.fetchRemoteTools(data.url, data.authToken);

    const doc = await ExternalMcp.create({
      userId,
      name: data.name.trim(),
      url: data.url.trim(),
      authToken: data.authToken?.trim() || undefined,
      tools,
      status: 'active',
    });

    return doc;
  }

  async removeIntegration(userId: string, id: string): Promise<boolean> {
    const res = await ExternalMcp.deleteOne({ _id: id, userId });
    return res.deletedCount > 0;
  }
}

export const externalMcpService = new ExternalMcpService();
