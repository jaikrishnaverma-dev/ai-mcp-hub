import { useState, useEffect } from 'react';
import {
  api,
  type McpTool,
  type Skill,
  type UserProfile,
  type ExternalMcpIntegration,
  type ExternalMcpTool,
  DEFAULT_SKILLS,
  DEFAULT_SPENT_TOOLS,
  TOOL_ROLE_GROUPS,
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
  Plug,
  CheckCircle2,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Send,
  Calendar,
  CheckSquare,
  Bell,
  Cpu,
  ShieldCheck,
  DollarSign,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Button } from './ui/button.js';
import { Skeleton } from './ui/skeleton.js';

interface CatalogViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
  onHarnessSkill: (skill: Skill) => void;
  onHarnessTool?: (tool: McpTool) => void;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Wrench; desc: string; color: string; badge: string }> = {
  'Spent App & Finance': {
    label: 'Spent App & Finance',
    icon: DollarSign,
    desc: 'Household expenses, category budgets, wallets, and shared split balances from Spent App.',
    color: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  'Calendar & Scheduling': {
    label: 'Calendar & Scheduling',
    icon: Calendar,
    desc: 'Query agenda slots, free/busy times, and schedule commitments with ease.',
    color: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20 text-blue-500',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  'Tasks & Planning': {
    label: 'Tasks & Planning',
    icon: CheckSquare,
    desc: 'Goal decomposition, daily briefing, dependency links, status management, and bottleneck explanation.',
    color: 'from-indigo-500/10 to-purple-500/10 border-indigo-500/20 text-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  'Reminders & Alerts': {
    label: 'Reminders & Alerts',
    icon: Bell,
    desc: 'Proactive timers, notification channels (push, email, webhook), and preference settings.',
    color: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 text-amber-500',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  'Agent Core & Intelligence': {
    label: 'Agent Core & Intelligence',
    icon: Cpu,
    desc: 'Context retrieval, topological critical paths, automated verification, search, and activity auditing.',
    color: 'from-violet-500/10 to-fuchsia-500/10 border-violet-500/20 text-violet-500',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  },
  'Knowledge & Ground Truth': {
    label: 'Knowledge & Ground Truth',
    icon: ShieldCheck,
    desc: 'Distinguish verified facts from unverified assumptions, enforce constraints, and log decisions.',
    color: 'from-rose-500/10 to-pink-500/10 border-rose-500/20 text-rose-500',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  'General Utilities': {
    label: 'General Utilities',
    icon: Layers,
    desc: 'System health checks, diagnostics, and auxiliary tools.',
    color: 'from-zinc-500/10 to-stone-500/10 border-zinc-500/20 text-zinc-500',
    badge: 'bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
  },
};

export function CatalogView({
  currentUser,
  onRequireAuth,
  onHarnessSkill,
}: CatalogViewProps) {
  const [activeTab, setActiveTab] = useState<'tools' | 'skills' | 'external'>('tools');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [externalMcps, setExternalMcps] = useState<ExternalMcpIntegration[]>([]);
  const skills = DEFAULT_SKILLS;
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [likes, setLikes] = useState<Record<string, boolean>>({});

  // Accordion state: toolName -> boolean
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  
  // Inline comment draft state: toolName -> text
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  
  // Local comments state to trigger instant re-renders
  const [, setCommentsVersion] = useState(0);

  // Schema Dialog
  const [inspectTool, setInspectTool] = useState<McpTool | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  // External MCP dialog state
  const [addExternalModalOpen, setAddExternalModalOpen] = useState(false);
  const [extName, setExtName] = useState('Spent App');
  const [extUrl, setExtUrl] = useState('https://apptiva.in/backend/mcp/server.php');
  const [extToken, setExtToken] = useState('');
  const [extTesting, setExtTesting] = useState(false);
  const [extSaving, setExtSaving] = useState(false);
  const [extTestResult, setExtTestResult] = useState<{ count: number; tools: ExternalMcpTool[] } | null>(null);
  const [extError, setExtError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, extRes] = await Promise.all([
        api.getToolCatalog().catch(() => ({ tools: [] })),
        currentUser ? api.getExternalMcps().catch(() => ({ integrations: [] })) : Promise.resolve({ integrations: [] }),
      ]);

      let allTools = catRes.tools || [];
      
      // Ensure Spent App tools are visible
      const hasSpentTools = allTools.some(
        (t) => t.name.startsWith('spent_') || (t.serverName && t.serverName.toLowerCase().includes('spent'))
      );
      if (!hasSpentTools) {
        allTools = [...allTools, ...DEFAULT_SPENT_TOOLS];
      }

      setTools(allTools);
      setExternalMcps(extRes.integrations || []);
    } catch (err) {
      console.error('Failed to load catalog data:', err);
    } finally {
      setLoading(false);
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

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshExternal = async (id: string, name: string) => {
    setRefreshingId(id);
    try {
      await api.refreshExternalMcp(id);
      await loadData();
    } catch (err) {
      alert(`Failed to refresh "${name}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshingId(null);
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
    setLikes((prev) => ({ ...prev, [targetId]: next }));
  };

  const toggleAccordion = (toolName: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [toolName]: !prev[toolName],
    }));
  };

  const handleAddToolComment = (toolName: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = (commentDrafts[toolName] || '').trim();
    if (!text) return;

    if (!currentUser) {
      onRequireAuth(`Sign in to comment on "${toolName}"`);
      return;
    }

    addStoredComment(toolName, text, currentUser);
    setCommentDrafts((prev) => ({ ...prev, [toolName]: '' }));
    setCommentsVersion((v) => v + 1);
  };

  const handleCopySchemaJson = () => {
    if (!inspectTool) return;
    navigator.clipboard.writeText(JSON.stringify(inspectTool.inputSchema, null, 2));
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  // Group tools by role
  const filteredTools = tools.filter((t) => {
    const q = search.toLowerCase();
    const matchQ = t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    const cat = categorizeTool(t.name, t.isExternal, t.serverName);
    const matchCat = selectedCategory === 'all' || cat === selectedCategory;
    return matchQ && matchCat;
  });

  const groupedTools = TOOL_ROLE_GROUPS.reduce<Record<string, McpTool[]>>((acc, group) => {
    acc[group] = filteredTools.filter((t) => categorizeTool(t.name, t.isExternal, t.serverName) === group);
    return acc;
  }, {});

  // Extra tools that might belong to General Utilities
  const extraTools = filteredTools.filter(
    (t) => !TOOL_ROLE_GROUPS.includes(categorizeTool(t.name, t.isExternal, t.serverName) as any)
  );
  if (extraTools.length > 0) {
    groupedTools['General Utilities'] = extraTools;
  }

  const filteredSkills = skills.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tools.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="container max-w-5xl mx-auto py-6 sm:py-8 px-3 sm:px-6 space-y-6 w-full">
      {/* Header Banner */}
      <div className="space-y-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-100">
                MCP Tool Directory
              </h1>
              <span className="rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2.5 py-0.5 text-xs font-semibold">
                {tools.length} Tools
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
              Role-grouped tool capabilities for Spent App, Calendar, Tasks, Reminders, and Agent Core. Tap any tool to explore schemas and join discussion.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenAddExternal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plug className="h-3.5 w-3.5" />
              <span>Connect Spent App</span>
            </button>
          </div>
        </div>

        {/* Search bar & quick filters */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search tools by name, action, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-10 pr-4 py-2 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Pill Tabs Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('tools')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors shrink-0 ${
            activeTab === 'tools'
              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>All Tools ({filteredTools.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('skills')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors shrink-0 ${
            activeTab === 'skills'
              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Curated Skills ({filteredSkills.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('external')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors shrink-0 ${
            activeTab === 'external'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
          }`}
        >
          <Plug className="h-3.5 w-3.5" />
          <span>Connected MCPs ({externalMcps.length})</span>
        </button>
      </div>

      {/* TAB 1: ROLE GROUPED TOOLS LIST */}
      {activeTab === 'tools' && (
        <div className="space-y-6">
          {/* Quick Role Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50'
              }`}
            >
              All Roles ({tools.length})
            </button>
            {Object.keys(groupedTools).map((cat) => {
              const count = groupedTools[cat]?.length || 0;
              if (count === 0 && selectedCategory !== cat) return null;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {loading && tools.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
                  <Skeleton className="h-6 w-48 rounded" />
                  <Skeleton className="h-4 w-full rounded" />
                </div>
              ))}
            </div>
          ) : (
            Object.entries(groupedTools).map(([groupName, groupTools]) => {
              if (groupTools.length === 0) return null;
              const meta = CATEGORY_META[groupName] || CATEGORY_META['General Utilities']!;
              const IconComp = meta.icon;

              return (
                <section
                  key={groupName}
                  className="rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm overflow-hidden shadow-xs"
                >
                  {/* Category Header */}
                  <div className="p-4 sm:p-5 border-b border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-950/30">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl border ${meta.color}`}>
                        <IconComp className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-100 flex items-center gap-2">
                          <span>{meta.label}</span>
                          <span className="text-xs font-normal text-zinc-400">({groupTools.length})</span>
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                          {meta.desc}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tool List Rows */}
                  <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                    {groupTools.map((tool) => {
                      const isExpanded = Boolean(expandedTools[tool.name]);
                      const isLiked = Boolean(likes[tool.name]);
                      const comments = getStoredComments(tool.name);
                      const commentsCount = comments.length;
                      const draft = commentDrafts[tool.name] || '';

                      return (
                        <div key={tool.name} className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          {/* Tool Clickable Row */}
                          <div
                            onClick={() => toggleAccordion(tool.name)}
                            className="p-3.5 sm:p-4.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            {/* Left: Tool Name & Badges */}
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                type="button"
                                className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-0.5 rounded-lg transition-transform"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-100 tracking-tight hover:underline">
                                    {tool.name}
                                  </span>

                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase border ${
                                      tool.requiredScope === 'write'
                                        ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                        : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                    }`}
                                  >
                                    {tool.requiredScope}
                                  </span>

                                  {tool.isExternal && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                      Spent App
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                                  {tool.description}
                                </p>
                              </div>
                            </div>

                            {/* Right: Likes, Comments, Schema */}
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Like button */}
                              <button
                                onClick={() => handleToggleLike(tool.name, tool.name)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                                  isLiked
                                    ? 'bg-red-50 dark:bg-red-950/40 text-red-600 border border-red-200 dark:border-red-900'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800'
                                }`}
                                title={isLiked ? 'Unlike' : 'Like tool'}
                              >
                                <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current text-red-600' : ''}`} />
                                <span className="text-xs">{isLiked ? 1 : 0}</span>
                              </button>

                              {/* Comments count */}
                              <button
                                onClick={() => toggleAccordion(tool.name)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-colors"
                                title="View discussion & comments"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>{commentsCount}</span>
                              </button>
                            </div>
                          </div>

                          {/* ACCORDION BOTTOM EXPANSION: Description + Parameters + Comments */}
                          {isExpanded && (
                            <div className="p-4 sm:p-6 bg-zinc-50/80 dark:bg-zinc-950/50 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-5 animate-in slide-in-from-top-2 duration-150">
                              {/* Full description */}
                              <div className="space-y-1.5">
                                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                                  Tool Description &amp; Usage
                                </h4>
                                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
                                  {tool.description}
                                </p>
                              </div>

                              {/* Parameters preview & schema modal button */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                                    Input Parameters
                                  </h4>
                                  <button
                                    onClick={() => setInspectTool(tool)}
                                    className="inline-flex items-center gap-1 text-[11px] font-mono text-purple-600 dark:text-purple-400 hover:underline"
                                  >
                                    <Code className="h-3 w-3" />
                                    <span>Inspect JSON Schema</span>
                                  </button>
                                </div>

                                {tool.inputSchema && typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {Object.entries((tool.inputSchema as any).properties || {}).map(([propName, propDef]: [string, any]) => {
                                      const isReq = ((tool.inputSchema as any).required || []).includes(propName);
                                      return (
                                        <div
                                          key={propName}
                                          className="p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex flex-col justify-between"
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-100 truncate">
                                              {propName}
                                            </span>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[10px] font-mono text-zinc-400">
                                                {propDef?.type || 'any'}
                                              </span>
                                              {isReq && (
                                                <span className="text-[9px] font-bold text-red-500 uppercase">req</span>
                                              )}
                                            </div>
                                          </div>
                                          {propDef?.description && (
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                                              {propDef.description}
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-xs text-zinc-400 italic">No parameters required for this tool.</p>
                                )}
                              </div>

                              {/* Interactive Comments Section */}
                              <div className="space-y-3 pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                                    <MessageSquare className="h-3.5 w-3.5 text-purple-600" />
                                    <span>Community Discussion ({commentsCount})</span>
                                  </h4>
                                </div>

                                {/* Comments list */}
                                {comments.length > 0 ? (
                                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {comments.map((c) => (
                                      <div
                                        key={c.id}
                                        className="p-3 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 text-xs space-y-1 shadow-2xs"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                            {c.userName}
                                          </span>
                                          <span className="text-[10px] text-zinc-400 font-mono">
                                            {new Date(c.createdAt).toLocaleDateString()}
                                          </span>
                                        </div>
                                        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans">
                                          {c.content}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-zinc-400 italic">
                                    No comments yet. Share your experience or tips for using {tool.name}!
                                  </p>
                                )}

                                {/* Inline Add Comment Form */}
                                <form
                                  onSubmit={(e) => handleAddToolComment(tool.name, e)}
                                  className="flex items-center gap-2 pt-1"
                                >
                                  <input
                                    type="text"
                                    placeholder={
                                      currentUser
                                        ? `Write a comment on ${tool.name}...`
                                        : 'Sign in to post a comment...'
                                    }
                                    value={draft}
                                    onChange={(e) =>
                                      setCommentDrafts((prev) => ({ ...prev, [tool.name]: e.target.value }))
                                    }
                                    className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                                  />
                                  <button
                                    type="submit"
                                    disabled={!draft.trim()}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 px-3.5 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                                  >
                                    <Send className="h-3 w-3" />
                                    <span>Post</span>
                                  </button>
                                </form>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: CURATED SKILLS */}
      {activeTab === 'skills' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          {filteredSkills.map((skill) => {
            const isLiked = Boolean(likes[skill.id]);
            const commentsCount = getStoredComments(skill.id).length || skill.commentsCount;
            const likeCount = skill.likes + (isLiked ? 1 : 0);

            return (
              <div
                key={skill.id}
                className="rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors min-w-0"
              >
                <div className="space-y-3 min-w-0">
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
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold shrink-0 transition-colors ${
                        isLiked
                          ? 'border-red-200 bg-red-50 text-red-600'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 hover:bg-zinc-50'
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current text-red-600' : ''}`} />
                      <span>{likeCount}</span>
                    </button>
                  </div>

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

                  <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3 text-xs text-zinc-600 dark:text-zinc-300 break-words leading-relaxed font-mono">
                    <span className="font-semibold text-zinc-950 dark:text-zinc-100">Prompt: </span>
                    {skill.systemPrompt}
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{commentsCount} comments</span>
                  </span>

                  <button
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth(`Sign in to harness "${skill.name}" into your custom MCP endpoint`);
                        return;
                      }
                      onHarnessSkill(skill);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Harness to Workflow</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: CONNECTED EXTERNAL MCPS */}
      {activeTab === 'external' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                Spent App MCP Server Integration
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Connect external JSON-RPC MCP servers to register remote financial and household tools into your hub.
              </p>
            </div>
            <button
              onClick={handleOpenAddExternal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors shrink-0"
            >
              <Plug className="h-3.5 w-3.5" />
              <span>Connect MCP Server</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {externalMcps.map((mcp) => (
              <div
                key={mcp.id}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-zinc-950 dark:text-zinc-100">{mcp.name}</h4>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Connected ({mcp.toolCount} tools)</span>
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-500 truncate">{mcp.url}</p>
                <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => handleRefreshExternal(mcp.id, mcp.name)}
                    disabled={refreshingId === mcp.id}
                    className="inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === mcp.id ? 'animate-spin' : ''}`} />
                    <span>Sync Tools</span>
                  </button>
                  <button
                    onClick={() => handleDeleteExternal(mcp.id, mcp.name)}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Schema Inspection Modal */}
      {inspectTool && (
        <Dialog open={Boolean(inspectTool)} onOpenChange={() => setInspectTool(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col rounded-3xl">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <div>
                  <DialogTitle className="font-mono text-base font-bold">
                    {inspectTool.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs mt-1">
                    JSON Schema definition for MCP tool calling clients.
                  </DialogDescription>
                </div>
                <button
                  onClick={handleCopySchemaJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium hover:bg-zinc-100 transition-colors"
                >
                  {copiedSchema ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>Copy JSON</span>
                </button>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto mt-2">
              <pre className="p-4 rounded-2xl bg-zinc-950 text-zinc-200 text-xs font-mono overflow-x-auto leading-relaxed border border-zinc-800">
                {JSON.stringify(inspectTool.inputSchema, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* External MCP Connect Modal */}
      {addExternalModalOpen && (
        <Dialog open={addExternalModalOpen} onOpenChange={setAddExternalModalOpen}>
          <DialogContent className="max-w-lg rounded-3xl">
            <DialogHeader>
              <DialogTitle>Connect External MCP Server</DialogTitle>
              <DialogDescription>
                Attach Spent App or custom MCP servers via JSON-RPC endpoint.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveExternal} className="space-y-4 pt-2">
              {extError && (
                <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs flex items-center gap-2 border border-red-200 dark:border-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{extError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Name</label>
                <input
                  type="text"
                  value={extName}
                  onChange={(e) => setExtName(e.target.value)}
                  placeholder="Spent App"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Server URL</label>
                <input
                  type="url"
                  value={extUrl}
                  onChange={(e) => setExtUrl(e.target.value)}
                  placeholder="https://apptiva.in/backend/mcp/server.php"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Bearer Token (Optional)</label>
                <input
                  type="password"
                  value={extToken}
                  onChange={(e) => setExtToken(e.target.value)}
                  placeholder="spent_bearer_token..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleFillSpentPreset}
                  className="text-xs text-purple-600 hover:underline"
                >
                  ⚡ Auto-fill Spent App credentials
                </button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestExternal}
                    disabled={extTesting}
                    className="text-xs rounded-xl"
                  >
                    {extTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test Connection'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={extSaving}
                    className="text-xs rounded-xl bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {extSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Connect Server'}
                  </Button>
                </div>
              </div>

              {extTestResult && (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Success! Discovered {extTestResult.count} tools on server.</span>
                </div>
              )}
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
