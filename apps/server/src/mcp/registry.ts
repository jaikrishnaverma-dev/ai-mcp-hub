/**
 * MCP Tool Registry — central registry of all tools.
 *
 * Each tool is registered with:
 * - name (snake_case)
 * - description (for AI tool selection)
 * - inputSchema (JSON Schema from Zod)
 * - handler function
 * - requiredScope (read/write/destructive)
 *
 * The registry is filtered per endpoint via toolAllowlist.
 */
import type { EndpointScope, ServiceContext } from '@assistant/shared';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: EndpointScope;
  handler: (
    args: Record<string, unknown>,
    ctx: ServiceContext,
  ) => Promise<McpToolResult>;
}

export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

class ToolRegistry {
  private tools = new Map<string, McpToolDefinition>();

  register(tool: McpToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): McpToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools filtered by endpoint allowlist AND scope.
   * This is what tools/list returns.
   */
  getFiltered(
    allowlist: string[],
    scopes: EndpointScope[],
  ): McpToolDefinition[] {
    const allowSet = new Set(allowlist);
    return Array.from(this.tools.values()).filter(
      (tool) => allowSet.has(tool.name) && scopes.includes(tool.requiredScope),
    );
  }

  /**
   * Check if a tool is allowed for a given endpoint.
   * This is the security-critical re-check on tools/call.
   */
  isAllowed(
    toolName: string,
    allowlist: string[],
    scopes: EndpointScope[],
  ): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return false;
    return allowlist.includes(toolName) && scopes.includes(tool.requiredScope);
  }
}

// Singleton
export const toolRegistry = new ToolRegistry();
