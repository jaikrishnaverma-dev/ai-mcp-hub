import React, { useState, useEffect } from 'react';
import {
  api,
  type McpTool,
  type Skill,
  type Comment,
  type UserProfile,
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
  const [activeTab, setActiveTab] = useState<'skills' | 'tools'>('skills');
  const [tools, setTools] = useState<McpTool[]>([]);
  const skills = DEFAULT_SKILLS;
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [likes, setLikes] = useState<Record<string, boolean>>({});

  // Comment dialog
  const [commentTarget, setCommentTarget] = useState<{ id: string; title: string } | null>(null);
  const [commentsList, setCommentsList] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  // Schema dialog
  const [inspectTool, setInspectTool] = useState<McpTool | null>(null);

  useEffect(() => {
    setLikes(getStoredLikes());
    api.getToolCatalog()
      .then((res) => setTools(res.tools))
      .catch((err) => console.error('Failed to load tool catalog:', err));
  }, []);

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
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
            AI Tools &amp; Skills Marketplace
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Browse verified capabilities, inspect schemas, and compose custom AI workflows with scoped MCP endpoints.
          </p>
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('skills')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'skills'
              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Curated Skills ({filteredSkills.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tools')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'tools'
              ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Available MCP Tools ({filteredTools.length})</span>
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
                className={`rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  selectedCategory === cat
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
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                        {category}
                      </span>
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
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                          isLiked ? 'text-red-600' : 'text-zinc-500 hover:text-zinc-900'
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
