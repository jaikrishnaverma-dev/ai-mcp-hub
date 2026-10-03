import React, { useState, useEffect } from 'react';
import {
  api,
  type McpTool,
  type Skill,
  type Comment,
  type UserProfile,
  type ExternalMcpIntegration,
  type ExternalMcpTool,
  DEFAULT_SKILLS,
  categorizeTool,
  getStoredLikes,
  toggleStoredLike,
  getStoredComments,
  addStoredComment,
} from '../api/client.js';
import {
  Sparkles,
  Wrench,
  Heart,
  MessageSquare,
  Search,
  Code,
  ArrowRight,
  Plus,
  Lock,
  Plug,
  Globe,
  CheckCircle2,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Textarea } from './ui/textarea.js';

interface CatalogViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
  onHarnessSkill: (skill: Skill) => void;
  onHarnessTool: (tool: McpTool) => void;
}

export function CatalogView({
  currentUser,
  onRequireAuth,
  onHarnessSkill,
  onHarnessTool,
}: CatalogViewProps) {
  const [activeTab, setActiveTab] = useState<'skills' | 'tools' | 'external'>('tools');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [externalMcps, setExternalMcps] = useState<ExternalMcpIntegration[]>([]);
  const skills = DEFAULT_SKILLS;
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [likes, setLikes] = useState<Record<string, boolean>>({});

  // External MCP dialog state
  const [addExternalModalOpen, setAddExternalModalOpen] = useState(false);
  const [extName, setExtName] = useState('Spent App');
  const [extUrl, setExtUrl] = useState('https://apptiva.in/backend/mcp/server.php');
  const [extToken, setExtToken] = useState('');
  const [extTesting, setExtTesting] = useState(false);
  const [extSaving, setExtSaving] = useState(false);
  const [extTestResult, setExtTestResult] = useState<{ count: number; tools: ExternalMcpTool[] } | null>(null);
  const [extError, setExtError] = useState<string | null>(null);

  // Comment dialog
  const [commentTarget, setCommentTarget] = useState<{ id: string; title: string } | null>(null);
  const [commentsList, setCommentsList] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  // Schema dialog
  const [inspectTool, setInspectTool] = useState<McpTool | null>(null);

  const loadData = async () => {
    try {
      const [catRes, extRes] = await Promise.all([
        api.getToolCatalog().catch(() => ({ tools: [] })),
        currentUser ? api.getExternalMcps().catch(() => ({ integrations: [] })) : Promise.resolve({ integrations: [] }),
      ]);
      setTools(catRes.tools || []);
      setExternalMcps(extRes.integrations || []);
    } catch (err) {
      console.error('Failed to load catalog data:', err);
    }
  };

  useEffect(() => {
    setLikes(getStoredLikes());
    loadData();
  }, [currentUser]);

  const [spentDetails, setSpentDetails] = useState<{
    name: string;
    clientId: string;
    clientSecret: string;
    serverUrl: string;
    verifyUrl: string;
    isAuthenticated: boolean;
    userEmail: string;
  } | null>(null);

  const handleOpenAddExternal = async () => {
    setExtName('Spent App');
    setExtUrl('https://apptiva.in/backend/mcp/server.php');
    setExtToken('');
    setExtError(null);
    setExtTestResult(null);
    setAddExternalModalOpen(true);

    try {
      const details = await api.getSpentAppDetails();
      setSpentDetails(details);
      if (details.name) setExtName(details.name);
      if (details.serverUrl) setExtUrl(details.serverUrl);
      if (details.clientSecret) setExtToken(details.clientSecret);
    } catch {
      // ignore
    }
  };

  const handleFillSpentPreset = () => {
    setExtName('Spent App');
    setExtUrl('https://apptiva.in/backend/mcp/server.php');
    if (spentDetails?.clientSecret) {
      setExtToken(spentDetails.clientSecret);
    }
    setExtError(null);
  };

  const handleTestExternal = async () => {
    if (!extUrl.trim()) {
      setExtError('Please enter a server URL');
      return;
    }
    setExtTesting(true);
    setExtError(null);
    setExtTestResult(null);
    try {
      const res = await api.testExternalMcp({ url: extUrl.trim(), authToken: extToken.trim() || undefined });
      setExtTestResult(res);
    } catch (err) {
      setExtError(err instanceof Error ? err.message : 'Failed to reach external MCP server');
    } finally {
      setExtTesting(false);
    }
  };

  const handleSaveExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extName.trim() || !extUrl.trim()) {
      setExtError('Name and Server URL are required');
      return;
    }
    setExtSaving(true);
    setExtError(null);
    try {
      await api.addExternalMcp({
        name: extName.trim(),
        url: extUrl.trim(),
        authToken: extToken.trim() || undefined,
      });
      setAddExternalModalOpen(false);
      await loadData();
    } catch (err) {
      setExtError(err instanceof Error ? err.message : 'Failed to connect external MCP');
    } finally {
      setExtSaving(false);
    }
  };

  const handleDeleteExternal = async (id: string, name: string) => {
    if (!window.confirm(`Disconnect external MCP server "${name}"?`)) return;
    try {
      await api.deleteExternalMcp(id);
      await loadData();
    } catch (err) {
      console.error('Failed to disconnect external MCP:', err);
    }
  };

  const handleToggleLike = (targetId: string, title: string) => {
    if (!currentUser) {
      onRequireAuth(`Sign in to like "${title}"`);
      return;
    }
    const next = toggleStoredLike(targetId);
    setLikes({ ...likes, [targetId]: next });
  };

  const handleOpenComments = (id: string, title: string) => {
    setCommentTarget({ id, title });
    setCommentsList(getStoredComments(id));
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentTarget || !newCommentText.trim()) return;

    if (!currentUser) {
      onRequireAuth(`Sign in to comment on "${commentTarget.title}"`);
      return;
    }

    const cmt = addStoredComment(commentTarget.id, newCommentText.trim(), currentUser);
    setCommentsList([...commentsList, cmt]);
    setNewCommentText('');
  };

  const categories = ['all', ...Array.from(new Set(tools.map((t) => categorizeTool(t.name))))];

  const filteredSkills = skills.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tools.some((t) => t.toLowerCase().includes(q))
    );
  });

  const filteredTools = tools.filter((t) => {
    const q = search.toLowerCase();
    const matchQ = t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    const matchCat = selectedCategory === 'all' || categorizeTool(t.name) === selectedCategory;
    return matchQ && matchCat;
  });

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6 w-full">
      {/* Header Banner */}
      <div className="space-y-3 pb-5 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
              AI Tools &amp; Skills Marketplace
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Browse capabilities, inspect schemas, and connect external MCP servers (Spent App) to your AI clients.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAddExternal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3.5 sm:px-4 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Plug className="h-4 w-4" />
              <span>+ Add External Tools</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search tools &amp; skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 shadow-2xs"
          />
        </div>
      </div>

      {/* Pill Tabs Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab('tools')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${activeTab === 'tools'
              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
            }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>All Tools ({filteredTools.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('skills')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${activeTab === 'skills'
              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
            }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Curated Skills ({filteredSkills.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('external')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${activeTab === 'external'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
            }`}
        >
          <Plug className="h-3.5 w-3.5" />
          <span>Connected External MCPs ({externalMcps.length})</span>
        </button>
      </div>

      {/* TAB 1: CURATED SKILLS */}
      {activeTab === 'skills' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          {filteredSkills.map((skill) => {
            const isLiked = Boolean(likes[skill.id]);
            const commentsCount = getStoredComments(skill.id).length || skill.commentsCount;
            const likeCount = skill.likes + (isLiked ? 1 : 0);

            return (
              <div
                key={skill.id}
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors min-w-0"
              >
                <div className="space-y-3 min-w-0">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                          {skill.category}
                        </span>
                        <span className="text-[11px] text-zinc-400">• By {skill.author}</span>
                      </div>
                      <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-100 truncate pt-1">
                        {skill.name}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {skill.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleLike(skill.id, skill.name)}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold shrink-0 transition-colors ${isLiked
                          ? 'border-red-200 bg-red-50 text-red-600'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 hover:bg-zinc-50'
                        }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current text-red-600' : ''}`} />
                      <span>{likeCount}</span>
                    </button>
                  </div>

                  {/* Required Tools */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Required MCP Tools:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {skill.tools.map((t) => (
                        <span
                          key={t}
                          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-2 py-0.5 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Prompt Preview */}
                  <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3 text-xs text-zinc-600 dark:text-zinc-300 break-words leading-relaxed font-mono">
                    <span className="font-semibold text-zinc-950 dark:text-zinc-100">Prompt: </span>
                    {skill.systemPrompt}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
                  <button
                    onClick={() => handleOpenComments(skill.id, skill.name)}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{commentsCount} comments</span>
                  </button>

                  <button
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth(`Sign in to harness "${skill.name}" into your custom MCP endpoint`);
                        return;
                      }
                      onHarnessSkill(skill);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 text-xs font-semibold shadow-xs transition-colors"
                  >
                    <span>Harness to MCP</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: AVAILABLE TOOLS */}
      {activeTab === 'tools' && (
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-colors ${selectedCategory === cat
                    ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:bg-zinc-50'
                  }`}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {filteredTools.map((tool) => {
              const isLiked = Boolean(likes[tool.name]);
              const commentsCount = getStoredComments(tool.name).length;
              const category = categorizeTool(tool.name);

              return (
                <div
                  key={tool.name}
                  className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs flex flex-col justify-between space-y-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors min-w-0"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                          {category}
                        </span>
                        {tool.isExternal && (
                          <span className="rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2 py-0.5 text-[10px] font-semibold">
                            External • {tool.serverName || 'Spent App'}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {tool.requiredScope}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold font-mono text-zinc-950 dark:text-zinc-100 truncate">
                      {tool.name}
                    </h4>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                      {tool.description}
                    </p>

                    <button
                      onClick={() => setInspectTool(tool)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 py-1.5 text-[11px] font-mono font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 transition-colors"
                    >
                      <Code className="h-3 w-3" />
                      <span>Inspect JSON Schema</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleLike(tool.name, tool.name)}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${isLiked ? 'text-red-600' : 'text-zinc-500 hover:text-zinc-900'
                          }`}
                      >
                        <Heart className={`h-3 w-3 ${isLiked ? 'fill-current' : ''}`} />
                        <span>{isLiked ? 1 : 0}</span>
                      </button>

                      <button
                        onClick={() => handleOpenComments(tool.name, tool.name)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>{commentsCount}</span>
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        if (!currentUser) {
                          onRequireAuth(`Sign in to add "${tool.name}" to your workflow`);
                          return;
                        }
                        onHarnessTool(tool);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add to Workflow</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CONNECTED EXTERNAL MCPS */}
      {activeTab === 'external' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              External MCP servers bridge remote tools into your MCP Hub. Tools are automatically available in Claude, ChatGPT, and custom workflows.
            </p>
            <button
              onClick={handleOpenAddExternal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Connect External MCP</span>
            </button>
          </div>

          {externalMcps.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400">
                <Plug className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                No External MCP Servers Connected Yet
              </h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Connect your Spent App account on apptiva.in to access your homes, expenses, wallets, and shared balances through Claude and ChatGPT.
              </p>
              <div className="pt-2">
                <Button
                  onClick={handleOpenAddExternal}
                  className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
                >
                  <Plug className="h-3.5 w-3.5 mr-1.5" />
                  Connect Spent App MCP (apptiva.in)
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {externalMcps.map((mcp) => (
                <div
                  key={mcp.id}
                  className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-zinc-950 dark:text-zinc-100 truncate">
                          {mcp.name}
                        </h4>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-zinc-500 truncate">{mcp.url}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteExternal(mcp.id, mcp.name)}
                      className="text-zinc-400 hover:text-red-600 p-1.5 rounded-lg border border-transparent hover:border-zinc-200 transition-colors"
                      title="Disconnect MCP Server"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 p-3 space-y-2">
                    <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                      Discovered Remote Tools ({mcp.toolCount || mcp.tools?.length || 0}):
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {mcp.tools?.map((t) => (
                        <span
                          key={t.name}
                          className="font-mono text-[10px] bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200/80 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONNECT EXTERNAL MCP MODAL */}
      <Dialog open={addExternalModalOpen} onOpenChange={setAddExternalModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Plug className="h-5 w-5 text-purple-600" />
              <span>Connect External MCP Server</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 mt-1">
              Add any remote Streamable HTTP or SSE MCP server. Tools are automatically proxied with your credentials.
            </DialogDescription>
          </DialogHeader>

          {extError && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{extError}</span>
            </div>
          )}

          {/* Quick Preset: Spent App */}
          <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/60 dark:bg-purple-950/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white font-bold text-xs">
                  S
                </span>
                <span className="font-bold text-xs text-purple-950 dark:text-purple-200">
                  Spent App Preset (apptiva.in)
                </span>
              </div>
              <button
                type="button"
                onClick={handleFillSpentPreset}
                className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 hover:underline"
              >
                Reset Details
              </button>
            </div>
            
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              {currentUser ? (
                <>
                  Logged in as <strong>{currentUser.email}</strong>. Client ID: <code className="font-mono text-[10px]">{spentDetails?.clientId || 'spent_app'}</code>. Your Spent App token is active and ready.
                </>
              ) : (
                <>
                  Connect your Spent App account (<code className="font-mono text-[10px]">https://apptiva.in/backend/mcp/server.php</code>).
                </>
              )}
            </p>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  handleFillSpentPreset();
                  await handleSaveExternal(new Event('submit') as unknown as React.FormEvent);
                }}
                disabled={extSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plug className="h-3.5 w-3.5" />
                <span>{extSaving ? 'Connecting...' : 'Connect Spent App (1-Click)'}</span>
              </button>
              
              <a
                href={spentDetails?.verifyUrl || 'https://apptiva.in/login'}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-purple-700 dark:text-purple-300 hover:underline ml-auto"
              >
                Open Spent App ↗
              </a>
            </div>
          </div>

          <form onSubmit={handleSaveExternal} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Server Name
              </label>
              <input
                type="text"
                placeholder="e.g. Spent App"
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                MCP Server URL
              </label>
              <input
                type="url"
                placeholder="https://apptiva.in/backend/mcp/server.php"
                value={extUrl}
                onChange={(e) => setExtUrl(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                <span>Auth Bearer Token (Optional)</span>
                <span className="text-[10px] text-zinc-400 font-normal">Auto-filled for Spent App</span>
              </label>
              <input
                type="password"
                placeholder="Leave blank to use active Spent App login session"
                value={extToken}
                onChange={(e) => setExtToken(e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
              />
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestExternal}
                disabled={extTesting}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                {extTesting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Contacting Remote MCP...</span>
                  </>
                ) : (
                  <>
                    <Globe className="h-3.5 w-3.5" />
                    <span>Test Connection &amp; Discover Tools</span>
                  </>
                )}
              </button>
            </div>

            {/* Test Result preview */}
            {extTestResult && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1.5 text-xs text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Success! {extTestResult.count} remote tools discovered</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                  {extTestResult.tools.map((t) => (
                    <span
                      key={t.name}
                      className="font-mono text-[10px] bg-white dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                disabled={extSaving}
                className="w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition-colors"
              >
                {extSaving ? 'Connecting Server...' : 'Save & Enable External Tools'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* COMMENTS MODAL */}
      <Dialog open={Boolean(commentTarget)} onOpenChange={(open) => !open && setCommentTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span>Comments on {commentTarget?.title}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Community questions, tips, and feedback.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2 max-h-60 overflow-y-auto pr-1">
            {commentsList.length === 0 ? (
              <div className="text-center py-6 text-xs text-zinc-400">
                No comments yet. Be the first to start the discussion!
              </div>
            ) : (
              commentsList.map((c) => (
                <div key={c.id} className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-zinc-900">{c.userName}</span>
                    <span className="text-zinc-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-zinc-700 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddComment} className="space-y-2.5 pt-2 border-t">
            <Textarea
              placeholder={currentUser ? 'Write a comment...' : 'Sign in to write a comment...'}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              rows={2}
              className="rounded-xl text-xs resize-none"
              disabled={!currentUser}
            />
            <div className="flex items-center justify-between">
              {!currentUser && (
                <button
                  type="button"
                  onClick={() => onRequireAuth('Sign in to post comments')}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-700 font-semibold hover:underline"
                >
                  <Lock className="h-3 w-3" />
                  <span>Sign in to comment</span>
                </button>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={!currentUser || !newCommentText.trim()}
                className="ml-auto rounded-xl text-xs bg-zinc-950 hover:bg-zinc-800 text-white"
              >
                Post Comment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* SCHEMA VIEWER MODAL */}
      <Dialog open={Boolean(inspectTool)} onOpenChange={(open) => !open && setInspectTool(null)}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-mono flex items-center gap-2">
              <Code className="h-4 w-4" />
              <span>{inspectTool?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {inspectTool?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              JSON Schema Input Specification:
            </p>
            <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-3 text-[11px] font-mono overflow-x-auto max-h-64 border border-zinc-200 dark:border-zinc-800">
              {JSON.stringify(inspectTool?.inputSchema, null, 2)}
            </pre>
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setInspectTool(null)} className="rounded-xl text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
