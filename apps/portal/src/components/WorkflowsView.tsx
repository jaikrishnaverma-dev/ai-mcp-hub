import React, { useState, useEffect } from 'react';
import {
  api,
  type Workflow,
  type McpTool,
  type UserProfile,
  type OAuthClientItem,
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
  Bot,
  Sparkles,
  Key,
  ShieldCheck,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import { Textarea } from './ui/textarea.js';
import { Checkbox } from './ui/checkbox.js';
import { Skeleton } from './ui/skeleton.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';


export interface WorkflowsViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
}

export type EndpointsViewProps = WorkflowsViewProps;

export function WorkflowsView({ currentUser, onRequireAuth }: WorkflowsViewProps) {
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

  // OAuth Connect Modal state
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthClients, setOauthClients] = useState<OAuthClientItem[]>([]);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthSubTab, setOauthSubTab] = useState<'create' | 'list'>('create');
  const [presetType, setPresetType] = useState<'chatgpt' | 'claude' | 'custom'>('chatgpt');
  const [newClientName, setNewClientName] = useState('ChatGPT Custom Action');
  const [newRedirectUri, setNewRedirectUri] = useState('https://chatgpt.com/aip/g-assistant/oauth/callback');
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [createdClient, setCreatedClient] = useState<OAuthClientItem | null>(null);
  const [copiedOAuthKey, setCopiedOAuthKey] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

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
      onRequireAuth('Sign in to create custom workflows');
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
      if (selectedTools.length >= 20) {
        setFormError('Workflows are limited to 20 tools max for optimal AI token budget.');
        return;
      }
      setSelectedTools([...selectedTools, toolName]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please provide a workflow name.');
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

  const handleOpenOAuthModal = async () => {
    if (!currentUser) {
      onRequireAuth('Sign in to connect AI clients');
      return;
    }
    setCreatedClient(null);
    setOauthError(null);
    setOauthModalOpen(true);
    if (endpoints.length > 0 && !selectedEndpointId) {
      setSelectedEndpointId(endpoints[0]?.id || '');
    }
    loadOAuthClients();
  };

  const loadOAuthClients = async () => {
    try {
      setOauthLoading(true);
      const res = await api.getOAuthClients();
      setOauthClients(res.clients || []);
    } catch (err) {
      console.error('Failed to load OAuth clients:', err);
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSelectPreset = (type: 'chatgpt' | 'claude' | 'custom') => {
    setPresetType(type);
    setCreatedClient(null);
    if (type === 'chatgpt') {
      setNewClientName('ChatGPT Custom Action');
      setNewRedirectUri('https://chatgpt.com/aip/g-assistant/oauth/callback');
    } else if (type === 'claude') {
      setNewClientName('Claude AI Web & Desktop');
      setNewRedirectUri('https://claude.ai/api/mcp/oauth/callback');
    } else {
      setNewClientName('Custom AI Client');
      setNewRedirectUri('');
    }
  };

  const handleCreateOAuthClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      setOauthError('Client name is required');
      return;
    }
    try {
      setOauthLoading(true);
      setOauthError(null);
      const res = await api.createOAuthClient({
        clientName: newClientName.trim(),
        redirectUris: newRedirectUri.trim() ? [newRedirectUri.trim()] : [],
        endpointId: selectedEndpointId || undefined,
        scopes: ['read', 'write'],
      });
      setCreatedClient(res.client);
      loadOAuthClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate OAuth credentials';
      setOauthError(msg);
    } finally {
      setOauthLoading(false);
    }
  };

  const handleRevokeOAuthClient = async (clientId: string) => {
    try {
      await api.deleteOAuthClient(clientId);
      loadOAuthClients();
      if (createdClient && createdClient.clientId === clientId) {
        setCreatedClient(null);
      }
    } catch (err) {
      console.error('Failed to revoke client:', err);
    }
  };

  const handleCopyOAuth = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedOAuthKey(key);
    setTimeout(() => setCopiedOAuthKey(null), 2000);
  };

    if (!currentUser) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <Server className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Workflows
        </h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Sign in to view your active workflows, adjust tool allowlists, and link AI clients to your process manager.
        </p>
        <div className="pt-2">
          <Button
            onClick={() => onRequireAuth('Sign in to manage workflows')}
            className="rounded-xl h-10 px-5 text-sm font-semibold bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
          >
            Sign In to Manage Workflows
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
              Workflows
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Custom agent workflows and scoped MCP tool groups for your AI assistants (Claude, Cursor, ChatGPT)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenOAuthModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50 hover:bg-purple-100/70 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 px-3 sm:px-3.5 py-2 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Connect Claude &amp; ChatGPT</span>
              <span className="sm:hidden">Connect AI</span>
            </button>

            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3.5 sm:px-4 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Create Workflow</span>
            </button>
          </div>
        </div>

        <div>
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Workflows</span>
          </button>
        </div>
      </div>

      {/* Workflows List */}
      <div className="space-y-4">
        {loading && endpoints.length === 0 ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-xs space-y-4"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-6 w-44 rounded-lg" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-16 rounded-xl" />
                    <Skeleton className="h-7 w-7 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-5/6 rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
                <div className="pt-2 flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-28 rounded-lg" />
                  <Skeleton className="h-6 w-24 rounded-lg" />
                  <Skeleton className="h-6 w-32 rounded-lg" />
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between">
                  <Skeleton className="h-4 w-64 rounded" />
                  <Skeleton className="h-6 w-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : endpoints.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-xs text-zinc-500">
            No workflows configured. Click &quot;Create Workflow&quot; to provision your first one.
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
                      title="Edit workflow"
                    >
                      <Edit className="h-3 w-3" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleDelete(ep.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-red-600 transition-colors"
                      title="Delete workflow"
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
              {editingEndpoint ? 'Edit Workflow' : 'Create Workflow'}
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Select tool allowlists and instructions to scope down what an AI agent can read or execute.
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
                Workflow Name
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
                  Allowed Tools ({selectedTools.length}/20 max)
                </Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTools(tools.slice(0, 20).map((t) => t.name))}
                    className="text-xs text-zinc-900 dark:text-zinc-100 font-semibold hover:underline"
                  >
                    Select All (up to 20)
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate text-xs">
                            {tool.name}
                          </p>
                          {tool.isExternal && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              External • {tool.serverName || 'Spent App'}
                            </span>
                          )}
                        </div>
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
                {editingEndpoint ? 'Save Changes' : 'Create Workflow'}
              </Button>
            </div>
          </form>

        </DialogContent>
      </Dialog>

      {/* OAuth Connect Dialog for Claude & ChatGPT */}
      <Dialog open={oauthModalOpen} onOpenChange={setOauthModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                <Bot className="h-4 w-4" />
              </div>
              <DialogTitle className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Connect AI Client (OAuth 2.0)
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Generate OAuth credentials for Claude AI, ChatGPT Actions, or custom agents. When you connect, you will be redirected to an approval screen to grant permissions.
            </DialogDescription>
          </DialogHeader>

          {/* Sub tabs: Create vs List */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-4 pt-2">
            <button
              type="button"
              onClick={() => setOauthSubTab('create')}
              className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px cursor-pointer ${
                oauthSubTab === 'create'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Configure New Client
            </button>
            <button
              type="button"
              onClick={() => setOauthSubTab('list')}
              className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px cursor-pointer flex items-center gap-1.5 ${
                oauthSubTab === 'list'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <span>Active Integrations</span>
              {oauthClients.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400">
                  {oauthClients.length}
                </span>
              )}
            </button>
          </div>

          {oauthSubTab === 'create' ? (
            <div className="space-y-5 pt-3">
              {/* Presets */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Choose Platform Preset
                </Label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('chatgpt')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      presetType === 'chatgpt'
                        ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 ring-1 ring-purple-500'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      ChatGPT
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      Custom GPT Action with OAuth redirect
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('claude')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      presetType === 'claude'
                        ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 ring-1 ring-purple-500'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      Claude AI
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      Claude Web / Desktop MCP OAuth
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('custom')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      presetType === 'custom'
                        ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 ring-1 ring-purple-500'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      Custom
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      Custom agent or web client
                    </p>
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateOAuthClient} className="space-y-3.5">
                {oauthError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 p-3 text-xs text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{oauthError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="oauth-client-name" className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Client App Name
                    </Label>
                    <Input
                      id="oauth-client-name"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="e.g., Claude Assistant"
                      className="rounded-xl text-xs h-9 bg-zinc-50/50 dark:bg-zinc-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="oauth-endpoint" className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Bind to MCP Endpoint
                    </Label>
                    <select
                      id="oauth-endpoint"
                      value={selectedEndpointId}
                      onChange={(e) => setSelectedEndpointId(e.target.value)}
                      className="w-full rounded-xl text-xs h-9 px-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    >
                      <option value="">All User Workflows &amp; Endpoints</option>
                      {endpoints.map((ep) => (
                        <option key={ep.id} value={ep.id}>
                          {ep.name} (/mcp/{ep.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="oauth-redirect-uri" className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Client Callback / Redirect URI
                  </Label>
                  <Input
                    id="oauth-redirect-uri"
                    value={newRedirectUri}
                    onChange={(e) => setNewRedirectUri(e.target.value)}
                    placeholder="https://chatgpt.com/aip/g-assistant/oauth/callback"
                    className="rounded-xl text-xs h-9 font-mono bg-zinc-50/50 dark:bg-zinc-900"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Where the authorization code will be sent after you click Approve on the consent screen.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={oauthLoading}
                  className="w-full h-9 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs shadow-xs"
                >
                  {oauthLoading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Generate Credentials
                </Button>
              </form>

              {/* Created Client Credentials Box */}
              {createdClient && (
                <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Client Created Successfully!
                    </span>
                    <span className="text-[11px] text-purple-700 dark:text-purple-400 font-mono">
                      Save client secret now
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                    Copy these credentials into your AI client (ChatGPT Custom GPT Action or Claude OAuth settings):
                  </p>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold block">Client ID</span>
                        <span className="text-zinc-800 dark:text-zinc-200 truncate block">{createdClient.clientId}</span>
                      </div>
                      <button
                        onClick={() => handleCopyOAuth('cid', createdClient.clientId)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                        title="Copy Client ID"
                      >
                        {copiedOAuthKey === 'cid' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {createdClient.clientSecret && (
                      <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold block">Client Secret</span>
                          <span className="text-emerald-700 dark:text-emerald-400 truncate block font-bold">{createdClient.clientSecret}</span>
                        </div>
                        <button
                          onClick={() => handleCopyOAuth('secret', createdClient.clientSecret || '')}
                          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                          title="Copy Secret"
                        >
                          {copiedOAuthKey === 'secret' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold block">Authorization URL</span>
                        <span className="text-zinc-800 dark:text-zinc-200 truncate block">{`${window.location.origin}/oauth/authorize`}</span>
                      </div>
                      <button
                        onClick={() => handleCopyOAuth('auth_url', `${window.location.origin}/oauth/authorize`)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                        title="Copy Authorization URL"
                      >
                        {copiedOAuthKey === 'auth_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold block">Token URL</span>
                        <span className="text-zinc-800 dark:text-zinc-200 truncate block">{`${window.location.origin}/oauth/token`}</span>
                      </div>
                      <button
                        onClick={() => handleCopyOAuth('token_url', `${window.location.origin}/oauth/token`)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                        title="Copy Token URL"
                      >
                        {copiedOAuthKey === 'token_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold block">Scope</span>
                        <span className="text-zinc-800 dark:text-zinc-200 truncate block">read write</span>
                      </div>
                      <button
                        onClick={() => handleCopyOAuth('scope', 'read write')}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                        title="Copy Scope"
                      >
                        {copiedOAuthKey === 'scope' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Active Clients List */
            <div className="space-y-3 pt-3">
              {oauthLoading ? (
                <div className="py-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading clients...
                </div>
              ) : oauthClients.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No OAuth clients generated yet. Switch to &quot;Configure New Client&quot; to connect Claude or ChatGPT.
                </div>
              ) : (
                <div className="space-y-2">
                  {oauthClients.map((c) => (
                    <div
                      key={c.clientId}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {c.clientName}
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 truncate">
                          ID: {c.clientId}
                        </div>
                        {c.redirectUris && c.redirectUris.length > 0 && (
                          <div className="font-mono text-[10px] text-zinc-400 truncate">
                            Redirect: {c.redirectUris.join(', ')}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeOAuthClient(c.clientId)}
                        className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const EndpointsView = WorkflowsView;
