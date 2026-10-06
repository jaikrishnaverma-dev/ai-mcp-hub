import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type Workflow,
  type McpTool,
  type UserProfile,
  type OAuthClientItem,
  categorizeTool,
  TOOL_ROLE_GROUPS,
  getStoredComments,
  addStoredComment,
} from '../api/client.js';
import {
  Plus,
  Copy,
  Check,
  Trash2,
  Edit,
  Sparkles,
  Key,
  Globe,
  Lock,
  Heart,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Send,
  Layers,
  Search,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import { Textarea } from './ui/textarea.js';
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'my' | 'community'>('my');
  const [endpoints, setEndpoints] = useState<Workflow[]>([]);
  const [communityWorkflows, setCommunityWorkflows] = useState<Workflow[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);


  // Tool management drawer on card: wfId -> boolean
  const [openToolDrawers, setOpenToolDrawers] = useState<Record<string, boolean>>({});

  // Comments drawer on card: wfId -> boolean
  const [openCommentDrawers, setOpenCommentDrawers] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [, setCommentsTick] = useState(0);

  // Likes tracking
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  // Dialog state (Create / Edit)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Workflow | null>(null);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [toolSearch, setToolSearch] = useState('');

  // OAuth Connect Modal state
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthClients, setOauthClients] = useState<OAuthClientItem[]>([]);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthSubTab, setOauthSubTab] = useState<'create' | 'list'>('create');
  const [newClientName, setNewClientName] = useState('ChatGPT Custom Action');
  const [newRedirectUri, setNewRedirectUri] = useState('https://chatgpt.com/aip/g-assistant/oauth/callback');
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [createdClient, setCreatedClient] = useState<OAuthClientItem | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [epRes, catRes, pubRes] = await Promise.all([
        currentUser ? api.getWorkflows().catch(() => ({ endpoints: [] })) : Promise.resolve({ endpoints: [] }),
        api.getToolCatalog().catch(() => ({ tools: [] })),
        api.getPublicWorkflows().catch(() => ({ workflows: [] })),
      ]);
      setEndpoints(epRes.endpoints || []);
      setTools(catRes.tools || []);
      setCommunityWorkflows(pubRes.workflows || []);
    } catch (err) {
      console.error('Failed to load workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleOpenCreate = () => {
    if (!currentUser) {
      onRequireAuth('Sign in to create custom workflows');
      return;
    }
    setEditingEndpoint(null);
    setName('');
    setInstructions('');
    setIsPublic(false);
    setSelectedTools(tools.map((t) => t.name));
    setFormError(null);
    setToolSearch('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (ep: Workflow) => {
    setEditingEndpoint(ep);
    setName(ep.name);
    setInstructions(ep.instructions || '');
    setIsPublic(Boolean(ep.isPublic));
    setSelectedTools([...ep.toolAllowlist]);
    setFormError(null);
    setToolSearch('');
    setDialogOpen(true);
  };

  const handleToggleToolSelection = (toolName: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const handleSelectAllCategory = (catName: string) => {
    const catTools = tools
      .filter((t) => categorizeTool(t.name, t.isExternal, t.serverName) === catName)
      .map((t) => t.name);

    setSelectedTools((prev) => Array.from(new Set([...prev, ...catTools])));
  };

  const handleDeselectAllCategory = (catName: string) => {
    const catTools = new Set(
      tools
        .filter((t) => categorizeTool(t.name, t.isExternal, t.serverName) === catName)
        .map((t) => t.name)
    );

    setSelectedTools((prev) => prev.filter((t) => !catTools.has(t)));
  };

  // Instant 1-click toggle of a tool on a workflow card
  const handleQuickToggleTool = async (wf: Workflow, toolName: string) => {
    const exists = wf.toolAllowlist.includes(toolName);
    const nextAllowlist = exists
      ? wf.toolAllowlist.filter((t) => t !== toolName)
      : [...wf.toolAllowlist, toolName];

    if (nextAllowlist.length === 0) {
      alert('A workflow must contain at least 1 tool.');
      return;
    }

    // Optimistic UI update
    setEndpoints((prev) =>
      prev.map((e) => (e.id === wf.id ? { ...e, toolAllowlist: nextAllowlist } : e))
    );

    try {
      await api.updateWorkflow(wf.id, { toolAllowlist: nextAllowlist });
    } catch (err) {
      console.error('Failed to update tool allowlist:', err);
      // rollback
      loadData();
    }
  };

  // 1-click toggle Public/Private
  const handleTogglePublicVisibility = async (wf: Workflow) => {
    const nextState = !wf.isPublic;
    setEndpoints((prev) =>
      prev.map((e) => (e.id === wf.id ? { ...e, isPublic: nextState } : e))
    );

    try {
      await api.updateWorkflow(wf.id, { isPublic: nextState });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle workflow visibility:', err);
      loadData();
    }
  };

  // Like workflow
  const handleLikeWorkflow = async (wf: Workflow) => {
    if (!currentUser) {
      onRequireAuth(`Sign in to like "${wf.name}"`);
      return;
    }

    const isLiked = likedMap[wf.id];
    setLikedMap((prev) => ({ ...prev, [wf.id]: !isLiked }));

    try {
      const res = await api.likeWorkflow(wf.id);
      setCommunityWorkflows((prev) =>
        prev.map((w) => (w.id === wf.id ? { ...w, likes: res.likes } : w))
      );
    } catch (err) {
      console.error('Failed to like workflow:', err);
    }
  };

  // Clone public workflow to personal
  const handleCloneWorkflow = async (wf: Workflow) => {
    if (!currentUser) {
      onRequireAuth(`Sign in to clone "${wf.name}"`);
      return;
    }

    try {
      await api.cloneWorkflow(wf.id);
      await loadData();
      setActiveTab('my');
      alert(`Cloned "${wf.name}" to your personal workflows!`);
    } catch (err) {
      console.error('Failed to clone workflow:', err);
      alert('Failed to clone workflow.');
    }
  };

  // Add Comment on workflow
  const handleAddWorkflowComment = (wfId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = (commentDrafts[wfId] || '').trim();
    if (!text) return;

    if (!currentUser) {
      onRequireAuth('Sign in to leave a comment');
      return;
    }

    addStoredComment(wfId, text, currentUser);
    setCommentDrafts((prev) => ({ ...prev, [wfId]: '' }));
    setCommentsTick((t) => t + 1);
  };

  const handleSaveEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Workflow name is required');
      return;
    }
    if (selectedTools.length === 0) {
      setFormError('Please select at least one tool for this workflow');
      return;
    }

    setFormError(null);
    try {
      if (editingEndpoint) {
        await api.updateWorkflow(editingEndpoint.id, {
          name: name.trim(),
          instructions: instructions.trim() || undefined,
          toolAllowlist: selectedTools,
          isPublic,
        });
      } else {
        await api.createWorkflow({
          name: name.trim(),
          instructions: instructions.trim() || undefined,
          toolAllowlist: selectedTools,
          isPublic,
        });
      }
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save workflow');
    }
  };

  const handleDelete = async (id: string, epName: string) => {
    if (!window.confirm(`Are you sure you want to delete workflow "${epName}"?`)) return;
    try {
      await api.deleteWorkflow(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    }
  };

  const handleCopySlug = (slug: string) => {
    const fullUrl = `https://mcphub.apptiva.in/mcp/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  // OAuth Modal helpers
  const handleOpenOAuthModal = async (ep: Workflow) => {
    setSelectedEndpointId(ep.id);
    setOauthModalOpen(true);
    setCreatedClient(null);
    setOauthError(null);
    setOauthSubTab('create');
    setNewClientName(`ChatGPT - ${ep.name}`);
    setNewRedirectUri('https://chatgpt.com/aip/g-assistant/oauth/callback');
    await loadOAuthClients();
  };

  const loadOAuthClients = async () => {
    setOauthLoading(true);
    try {
      const res = await api.getOAuthClients();
      setOauthClients(res.clients || []);
    } catch (err) {
      console.error('Failed to load OAuth clients:', err);
    } finally {
      setOauthLoading(false);
    }
  };

  const handleCreateOAuthClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !newRedirectUri.trim() || !selectedEndpointId) {
      setOauthError('Name, Redirect URI, and Workflow are required');
      return;
    }
    setOauthError(null);
    try {
      const res = await api.createOAuthClient({
        clientName: newClientName.trim(), redirectUris: [newRedirectUri.trim()],
        
        endpointId: selectedEndpointId,
        scopes: ['read', 'write'],
      });
      setCreatedClient(res.client);
      await loadOAuthClients();
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to register OAuth client');
    }
  };

  const filteredToolsInModal = tools.filter((t) => {
    const q = toolSearch.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
  });

  const displayedWorkflows = activeTab === 'my' ? endpoints : communityWorkflows;

  return (
    <div className="container max-w-5xl mx-auto py-6 sm:py-8 px-3 sm:px-6 space-y-6 w-full">
      {/* Header Banner */}
      <div className="space-y-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-100">
                Workflows &amp; AI Endpoints
              </h1>
              <span className="rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2.5 py-0.5 text-xs font-semibold">
                {endpoints.length} Active
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
              Curate focused tool subsets for your AI assistants. Test instantly in the AI Playground, manage tool visibility, and publish community templates.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 px-4 py-2 text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>+ New Workflow</span>
            </button>
          </div>
        </div>

        {/* Tab switch: My Workflows vs Community Hub */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('my')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'my'
                ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>My Workflows ({endpoints.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('community')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'community'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Community Hub ({communityWorkflows.length})</span>
          </button>
        </div>
      </div>

      {/* Main Workflow Cards Grid */}
      <div className="space-y-4">
        {loading && displayedWorkflows.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
                <Skeleton className="h-6 w-48 rounded" />
                <Skeleton className="h-4 w-full rounded" />
              </div>
            ))}
          </div>
        ) : displayedWorkflows.length === 0 ? (
          <div className="text-center p-8 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 space-y-3">
            <Sparkles className="h-8 w-8 text-zinc-400 mx-auto" />
            <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-100">
              {activeTab === 'my' ? 'No Workflows Created Yet' : 'No Community Workflows Available'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              Create your first scoped workflow with targeted tools and system instructions.
            </p>
            {activeTab === 'my' && (
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 px-4 py-2 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Workflow</span>
              </button>
            )}
          </div>
        ) : (
          displayedWorkflows.map((wf) => {
            const isToolDrawerOpen = Boolean(openToolDrawers[wf.id]);
            const isCommentDrawerOpen = Boolean(openCommentDrawers[wf.id]);
            const isLiked = Boolean(likedMap[wf.id]);
            const comments = getStoredComments(wf.id);
            const commentsCount = (wf.commentsCount || 0) + comments.length;
            const likeCount = (wf.likes || 0) + (isLiked ? 1 : 0);
            const draft = commentDrafts[wf.id] || '';

            return (
              <div
                key={wf.id}
                className="rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm p-5 sm:p-6 shadow-xs space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-100 truncate">
                        {wf.name}
                      </h3>

                      {wf.isPublic ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                          <Globe className="h-3 w-3" />
                          <span>Public Community</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[10px] font-semibold">
                          <Lock className="h-3 w-3" />
                          <span>Private</span>
                        </span>
                      )}

                      {wf.authorName && (
                        <span className="text-[11px] text-zinc-400">• By {wf.authorName}</span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 font-mono line-clamp-2 leading-relaxed bg-zinc-50 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                      <span className="font-semibold text-zinc-950 dark:text-zinc-100">Instructions: </span>
                      {wf.instructions || 'Standard general assistant persona.'}
                    </p>
                  </div>

                  {/* Top Right Quick Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Test in Playground Button */}
                    <button
                      onClick={() => navigate(`/playground?workflowId=${wf.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      title="Open AI Chat Playground with OpenRouter free model"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Test Playground</span>
                    </button>

                    {/* Copy Slug Button */}
                    <button
                      onClick={() => handleCopySlug(wf.slug)}
                      className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Copy MCP Server URL"
                    >
                      {copiedSlug === wf.slug ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Slug</span>
                    </button>

                    {activeTab === 'my' ? (
                      <>
                        <button
                          onClick={() => handleTogglePublicVisibility(wf)}
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title={wf.isPublic ? 'Make Private' : 'Make Public in Community Hub'}
                        >
                          {wf.isPublic ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5 text-purple-600" />}
                        </button>

                        <button
                          onClick={() => handleOpenOAuthModal(wf)}
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Connect ChatGPT / Claude Actions"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(wf)}
                          className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors"
                          title="Edit Workflow"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(wf.id, wf.name)}
                          className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          title="Delete Workflow"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleCloneWorkflow(wf)}
                        className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Clone to personal workflows"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Clone</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Active Tools Summary Bar & Enable/Disable Drawer Toggle */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Enabled Tools ({wf.toolAllowlist.length} / {tools.length}):
                    </span>

                    <button
                      onClick={() =>
                        setOpenToolDrawers((prev) => ({ ...prev, [wf.id]: !prev[wf.id] }))
                      }
                      className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-medium hover:underline cursor-pointer"
                    >
                      <span>{isToolDrawerOpen ? 'Hide tool toggles' : 'Manage tool toggles'}</span>
                      {isToolDrawerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Social Counters: Like & Comments */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLikeWorkflow(wf)}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl border transition-colors ${
                        isLiked
                          ? 'border-red-200 bg-red-50 text-red-600 dark:bg-red-950/50 dark:border-red-900'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current text-red-600' : ''}`} />
                      <span>{likeCount}</span>
                    </button>

                    <button
                      onClick={() =>
                        setOpenCommentDrawers((prev) => ({ ...prev, [wf.id]: !prev[wf.id] }))
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{commentsCount} comments</span>
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE TOOL ENABLE/DISABLE DRAWER (Smarts & Ease) */}
                {isToolDrawerOpen && (
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-4 animate-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-950 dark:text-zinc-100 uppercase tracking-wider">
                          1-Click Tool Enable / Disable
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Tap any tool to immediately enable or disable it in this workflow.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {TOOL_ROLE_GROUPS.map((group) => {
                        const groupTools = tools.filter(
                          (t) => categorizeTool(t.name, t.isExternal, t.serverName) === group
                        );
                        if (groupTools.length === 0) return null;

                        return (
                          <div key={group} className="space-y-1.5">
                            <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
                              {group}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {groupTools.map((t) => {
                                const isEnabled = wf.toolAllowlist.includes(t.name);
                                return (
                                  <button
                                    key={t.name}
                                    type="button"
                                    onClick={() => handleQuickToggleTool(wf, t.name)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-medium border transition-all cursor-pointer ${
                                      isEnabled
                                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                        : 'bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-100'
                                    }`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${isEnabled ? 'bg-white' : 'bg-zinc-400'}`} />
                                    <span>{t.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* EXPANDABLE COMMENTS DRAWER */}
                {isCommentDrawerOpen && (
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3 animate-in slide-in-from-top-2 duration-150">
                    <h4 className="text-xs font-bold text-zinc-950 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-purple-600" />
                      <span>Discussion on {wf.name}</span>
                    </h4>

                    {comments.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {comments.map((c) => (
                          <div
                            key={c.id}
                            className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {c.userName}
                              </span>
                              <span className="text-[10px] text-zinc-400">
                                {new Date(c.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-zinc-600 dark:text-zinc-300">{c.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic">No comments yet.</p>
                    )}

                    <form onSubmit={(e) => handleAddWorkflowComment(wf.id, e)} className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Write a comment or workflow tip..."
                        value={draft}
                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [wf.id]: e.target.value }))}
                        className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      />
                      <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="inline-flex items-center gap-1 rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        <Send className="h-3 w-3" />
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / EDIT WORKFLOW DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingEndpoint ? 'Edit Workflow' : 'Create Custom Workflow'}</DialogTitle>
            <DialogDescription>
              Configure focused tool permissions, visibility, and system instructions for AI clients.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEndpoint} className="space-y-4 flex-1 overflow-y-auto pr-1">
            {formError && (
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs border border-red-200 dark:border-red-800">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Workflow Name</Label>
              <Input
                type="text"
                placeholder="e.g. Daily Standup Brief, Finance Advisor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {/* Public vs Private Option */}
            <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-950 dark:text-zinc-100 flex items-center gap-1.5">
                  {isPublic ? <Globe className="h-4 w-4 text-emerald-500" /> : <Lock className="h-4 w-4 text-zinc-500" />}
                  <span>{isPublic ? 'Public Community Workflow' : 'Private Workflow (Only You)'}</span>
                </span>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isPublic
                    ? 'Published to the Community Hub for discovery, likes, and testing.'
                    : 'Accessible only via your private slug and authenticated user token.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isPublic ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isPublic ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Instructions / System Prompt</Label>
              <Textarea
                placeholder="System instructions sent to the AI when this workflow connects..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                className="rounded-xl font-mono text-xs"
              />
            </div>

            {/* Tool Selection Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs font-semibold">
                  Allowed Tools ({selectedTools.length} selected)
                </Label>
                <div className="relative w-44">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search tools..."
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 pl-8 pr-2 py-1 text-xs bg-white dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {TOOL_ROLE_GROUPS.map((group) => {
                  const groupTools = filteredToolsInModal.filter(
                    (t) => categorizeTool(t.name, t.isExternal, t.serverName) === group
                  );
                  if (groupTools.length === 0) return null;

                  return (
                    <div key={group} className="space-y-1.5 p-2.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
                      <div className="flex items-center justify-between text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                        <span>{group} ({groupTools.length})</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectAllCategory(group)}
                            className="text-purple-600 hover:underline text-[10px]"
                          >
                            Select All
                          </button>
                          <span className="text-zinc-300">•</span>
                          <button
                            type="button"
                            onClick={() => handleDeselectAllCategory(group)}
                            className="text-zinc-500 hover:underline text-[10px]"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {groupTools.map((tool) => {
                          const isChecked = selectedTools.includes(tool.name);
                          return (
                            <label
                              key={tool.name}
                              className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? 'border-purple-300 dark:border-purple-900 bg-purple-50/60 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200'
                                  : 'border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleToolSelection(tool.name)}
                                className="rounded text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                              />
                              <span className="font-mono truncate">{tool.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl text-xs">
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl text-xs bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                {editingEndpoint ? 'Save Changes' : 'Create Workflow'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>



      {/* OAUTH CONNECT MODAL */}
      <Dialog open={oauthModalOpen} onOpenChange={setOauthModalOpen}>
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>Connect External AI Platform</DialogTitle>
            <DialogDescription>
              Register OAuth credentials for ChatGPT Custom Actions, Claude MCP, or Custom Clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-4">
              <button
                type="button"
                onClick={() => setOauthSubTab('create')}
                className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                  oauthSubTab === 'create'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Register New Client
              </button>
              <button
                type="button"
                onClick={() => setOauthSubTab('list')}
                className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                  oauthSubTab === 'list'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Active Clients ({oauthClients.length})
              </button>
            </div>

            {oauthSubTab === 'create' ? (
              <form onSubmit={handleCreateOAuthClient} className="space-y-3">
                {oauthError && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200">
                    {oauthError}
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Client Name</Label>
                  <Input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Redirect URI</Label>
                  <Input
                    type="url"
                    value={newRedirectUri}
                    onChange={(e) => setNewRedirectUri(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>

                <Button type="submit" className="w-full rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white">
                  Generate OAuth Credentials
                </Button>

                {createdClient && (
                  <div className="p-3.5 rounded-2xl bg-zinc-900 text-white text-xs space-y-2 mt-3 font-mono">
                    <p className="text-emerald-400 font-bold">Client Credentials Generated:</p>
                    <p>Client ID: {createdClient.clientId}</p>
                    {createdClient.clientSecret && <p>Client Secret: {createdClient.clientSecret}</p>}
                  </div>
                )}
              </form>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {oauthLoading ? (
                  <p className="text-xs text-zinc-400">Loading...</p>
                ) : oauthClients.length === 0 ? (
                  <p className="text-xs text-zinc-400">No active OAuth clients for this workflow.</p>
                ) : (
                  oauthClients.map((client) => (
                    <div key={client.id} className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                      <p className="font-bold">{client.clientName}</p>
                      <p className="text-zinc-500 font-mono text-[10px] mt-0.5">{client.clientId}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
