import React, { useState, useEffect } from 'react';
import {
  api,
  type Workflow,
  type McpTool,
  type UserProfile,
} from '../api/client.js';
import {
  Plus,
  Server,
  Terminal,
  Copy,
  Check,
  Trash2,
  Edit,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import { Textarea } from './ui/textarea.js';
import { Checkbox } from './ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';


interface EndpointsViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
}

export function EndpointsView({ currentUser, onRequireAuth }: EndpointsViewProps) {
  const [endpoints, setEndpoints] = useState<Workflow[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Workflow | null>(null);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Ping Test state
  const [pingingSlug, setPingingSlug] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{
    slug: string;
    tools: string[];
    raw: unknown;
  } | null>(null);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [epRes, catRes] = await Promise.all([
        api.getWorkflows(),
        api.getToolCatalog().catch(() => ({ tools: [] })),
      ]);
      setEndpoints(epRes.endpoints);
      setTools(catRes.tools);
    } catch (err) {
      console.error('Failed to load endpoints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  const handleOpenCreate = () => {
    if (!currentUser) {
      onRequireAuth('Sign in to create custom MCP endpoints');
      return;
    }
    setEditingEndpoint(null);
    setName('');
    setInstructions('');
    setSelectedTools(tools.map((t) => t.name));
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (ep: Workflow) => {
    setEditingEndpoint(ep);
    setName(ep.name);
    setInstructions(ep.instructions || '');
    setSelectedTools(ep.toolAllowlist);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleToggleTool = (toolName: string) => {
    if (selectedTools.includes(toolName)) {
      setSelectedTools(selectedTools.filter((t) => t !== toolName));
    } else {
      if (selectedTools.length >= 15) {
        setFormError('MCP endpoints are limited to 15 tools max for optimal AI token budget.');
        return;
      }
      setSelectedTools([...selectedTools, toolName]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please provide an endpoint name.');
      return;
    }
    if (selectedTools.length === 0) {
      setFormError('Please select at least one tool to include in the allowlist.');
      return;
    }

    try {
      if (editingEndpoint) {
        await api.updateWorkflow(editingEndpoint.id, {
          name: name.trim(),
          instructions: instructions.trim() || undefined,
          toolAllowlist: selectedTools,
        });
      } else {
        await api.createWorkflow({
          name: name.trim(),
          instructions: instructions.trim() || undefined,
          toolAllowlist: selectedTools,
        });
      }
      setDialogOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save endpoint.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this MCP endpoint?')) return;
    try {
      await api.deleteWorkflow(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete endpoint:', err);
    }
  };

  const handleCopyUrl = (slug: string) => {
    const url = `${window.location.origin}/mcp/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handlePing = async (slug: string) => {
    setPingingSlug(slug);
    try {
      const res = await api.pingWorkflow(slug);
      const toolsReturned = Array.isArray((res as { result?: { tools?: Array<{ name: string }> } })?.result?.tools)
        ? (res as { result: { tools: Array<{ name: string }> } }).result.tools.map((t) => t.name)
        : [];
      setPingResult({ slug, tools: toolsReturned, raw: res });
    } catch (err) {
      console.error('Ping test failed:', err);
      setPingResult({ slug, tools: [], raw: { error: 'Handshake failed', details: String(err) } });
    } finally {
      setPingingSlug(null);
    }
  };

  if (!currentUser) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <Server className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          MCP Server &amp; Endpoints
        </h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Sign in to view your active MCP endpoints, adjust tool allowlists, and link AI clients to your process manager.
        </p>
        <div className="pt-2">
          <Button
            onClick={() => onRequireAuth('Sign in to manage MCP endpoints')}
            className="rounded-xl h-10 px-5 text-sm font-semibold bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
          >
            Sign In to Manage Endpoints
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
              MCP Server &amp; Endpoints
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Deterministic tool filtering &amp; Streamable HTTP transports for Claude, Cursor, and ChatGPT
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create Endpoint</span>
          </button>
        </div>

        <div>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Endpoints</span>
          </button>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="space-y-4">
        {endpoints.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-xs text-zinc-500">
            No endpoints configured. Click &quot;Create Endpoint&quot; to provision your first one.
          </div>
        ) : (
          endpoints.map((ep) => {
            const url = `${window.location.origin}/mcp/${ep.slug}`;
            const isCopied = copiedSlug === ep.slug;
            const isPinging = pingingSlug === ep.slug;

            return (
              <div
                key={ep.id}
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-xs space-y-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {/* Title & Actions Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-100">
                      {ep.name}
                    </h2>
                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 uppercase">
                      {ep.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      onClick={() => handleOpenEdit(ep)}
                      className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 transition-colors"
                      title="Edit endpoint"
                    >
                      <Edit className="h-3 w-3" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleDelete(ep.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-red-600 transition-colors"
                      title="Delete endpoint"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {ep.instructions && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {ep.instructions}
                  </p>
                )}

                {/* Allowlist Section */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
                    <span>Tool Allowlist ({ep.toolAllowlist.length} enabled)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ep.toolAllowlist.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-2 py-0.5 text-[11px] font-mono text-zinc-700 dark:text-zinc-300"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Streamable HTTP URL Copy Box */}
                <div className="space-y-1 pt-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Streamable HTTP Connection URL
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40 p-2">
                    <input
                      type="text"
                      readOnly
                      value={url}
                      className="flex-1 bg-transparent text-xs font-mono text-zinc-800 dark:text-zinc-200 outline-none truncate"
                    />
                    <button
                      onClick={() => handleCopyUrl(ep.slug)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 transition-colors shadow-2xs"
                    >
                      {isCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{isCopied ? 'Copied' : 'Copy URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Test MCP Ping Button */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => handlePing(ep.slug)}
                    disabled={isPinging}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 py-2.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    <span>{isPinging ? 'Pinging protocol...' : 'Test MCP Ping (tools/list)'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PING MODAL */}
      <Dialog open={Boolean(pingResult)} onOpenChange={(open) => !open && setPingResult(null)}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Terminal className="h-5 w-5 shrink-0 text-zinc-900 dark:text-zinc-100" />
              <span>MCP Protocol Response: /{pingResult?.slug}</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Live response from Streamable HTTP MCP endpoint.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-xs">
              <span className="text-zinc-500">Tools exposed by allowlist:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                {pingResult?.tools.length ?? 0} active
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {pingResult?.tools.map((t) => (
                <span key={t} className="rounded-lg border border-zinc-200/80 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] font-mono break-all text-zinc-800 dark:text-zinc-200">
                  {t}
                </span>
              ))}
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                JSON-RPC Result:
              </Label>
              <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 text-[11px] font-mono overflow-x-auto max-h-48 border border-zinc-200 dark:border-zinc-800 whitespace-pre-wrap break-all text-zinc-800 dark:text-zinc-200">
                {JSON.stringify(pingResult?.raw, null, 2)}
              </pre>
            </div>
          </div>

          <div className="pt-2">
            <Button
              className="w-full h-11 rounded-xl bg-zinc-950 text-white hover:bg-zinc-900 font-medium text-sm transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              onClick={() => setPingResult(null)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {editingEndpoint ? 'Edit MCP Endpoint' : 'Create MCP Endpoint'}
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Select tool allowlists to scope down what an AI agent can read or execute.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4 pt-1 w-full min-w-0 max-w-full overflow-hidden">
            <div className="space-y-1.5 min-w-0 w-full">
              <Label htmlFor="ep-name" className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Endpoint Name
              </Label>
              <Input
                id="ep-name"
                placeholder="e.g. Daily Standup Assistant"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11 rounded-xl text-sm border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800 w-full"
              />
            </div>

            <div className="space-y-1.5 min-w-0 w-full">
              <Label htmlFor="ep-instructions" className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Instructions / Role Prompt
              </Label>
              <Textarea
                id="ep-instructions"
                placeholder="System instructions provided to AI client..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                className="rounded-xl text-sm border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800 resize-none p-3 w-full"
              />
            </div>

            <div className="space-y-2 pt-1 min-w-0 w-full">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Allowed Tools ({selectedTools.length}/15 max)
                </Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTools(tools.map((t) => t.name))}
                    className="text-xs text-zinc-900 dark:text-zinc-100 font-semibold hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-xs text-zinc-300 dark:text-zinc-700">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTools([])}
                    className="text-xs text-zinc-500 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Grouped tool allowlist panel with subtle soft borders and safe responsive overflow */}
              <div className="rounded-xl bg-zinc-50/70 border border-zinc-200/80 dark:bg-zinc-900/50 dark:border-zinc-800 p-2 space-y-1.5 max-h-56 overflow-y-auto overflow-x-hidden w-full min-w-0 max-w-full">
                {tools.map((tool) => {
                  const isChecked = selectedTools.includes(tool.name);
                  return (
                    <div
                      key={tool.name}
                      onClick={() => handleToggleTool(tool.name)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-all w-full min-w-0 max-w-full overflow-hidden ${
                        isChecked
                          ? 'border-zinc-300/90 bg-white shadow-2xs dark:border-zinc-700 dark:bg-zinc-800'
                          : 'border-transparent bg-white/60 hover:bg-white hover:border-zinc-200/80 text-zinc-600 dark:bg-zinc-800/40 dark:border-transparent dark:hover:border-zinc-700'
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleTool(tool.name)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="space-y-0.5 min-w-0 flex-1 overflow-hidden">
                        <p className="font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate text-xs">
                          {tool.name}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 break-words leading-relaxed">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 w-full">
              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-zinc-950 text-white hover:bg-zinc-900 font-medium text-sm transition-colors shadow-xs dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {editingEndpoint ? 'Save Changes' : 'Create Endpoint'}
              </Button>
            </div>
          </form>

        </DialogContent>
      </Dialog>
    </div>
  );
}
