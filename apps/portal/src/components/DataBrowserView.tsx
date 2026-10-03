import React, { useState, useEffect } from 'react';
import {
  api,
  type TaskItem,
  type BlockerItem,
  type DecisionItem,
  type ActivityItem,
  type UserProfile,
} from '../api/client.js';
import {
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  Lightbulb,
  History,
  RefreshCw,
  FolderKanban,
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  List,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { StatusBadge, PriorityBadge } from './ui/badge.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';


interface DataBrowserViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
}

export function DataBrowserView({ currentUser, onRequireAuth }: DataBrowserViewProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'blockers' | 'decisions' | 'activity'>('tasks');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & View Mode
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [collapsedGoals, setCollapsedGoals] = useState<Record<string, boolean>>({});
  const [collapsedStories, setCollapsedStories] = useState<Record<string, boolean>>({});

  // Add Item Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newType, setNewType] = useState<'task' | 'story' | 'goal'>('task');
  const [newParentId, setNewParentId] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const openAddModal = (type: 'goal' | 'story' | 'task' = 'task', parentId = '') => {
    setNewType(type);
    setNewParentId(parentId);
    setCreateOpen(true);
  };

  const toggleGoalCollapse = (id: string) => {
    setCollapsedGoals((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleStoryCollapse = (id: string) => {
    setCollapsedStories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [tRes, bRes, dRes, aRes] = await Promise.all([
        api.getItems({ limit: 100 }).catch(() => ({ items: [] })),
        api.getBlockers().catch(() => ({ blockers: [] })),
        api.getDecisions().catch(() => ({ decisions: [] })),
        api.getActivity().catch(() => ({ activities: [] })),
      ]);
      setTasks(tRes.items || []);
      setBlockers(bRes.blockers || []);
      setDecisions(dRes.decisions || []);
      setActivities(aRes.activities || []);
    } catch (err) {
      console.error('Failed to load explorer data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  const handleToggleComplete = async (task: TaskItem) => {
    try {
      if (task.status === 'done') {
        await api.updateTask(task.id, { status: 'todo' });
      } else {
        await api.completeTask(task.id, 'Completed via web portal');
      }
      await loadData();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      await api.deleteTask(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleResolveBlocker = async (id: string) => {
    try {
      await api.resolveBlocker(id, 'Resolved in portal');
      await loadData();
    } catch (err) {
      console.error('Failed to resolve blocker:', err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreateLoading(true);
    try {
      await api.createTask({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        priority: newPriority,
        type: newType,
        parentId: newParentId || undefined,
      });
      setNewTitle('');
      setNewDesc('');
      setNewPriority('medium');
      setNewType('task');
      setNewParentId('');
      setCreateOpen(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create item:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  // --- Hierarchy Tree Computation ---
  const itemMap = React.useMemo(() => {
    return new Map(tasks.map((t) => [t.id, t]));
  }, [tasks]);

  const getBreadcrumbs = (task: TaskItem): string[] => {
    const crumbs: string[] = [];
    let curId = task.parentId;
    let depth = 0;
    while (curId && depth < 10) {
      depth++;
      const p = itemMap.get(curId);
      if (p) {
        crumbs.unshift(p.title);
        curId = p.parentId;
      } else {
        if (task.parentTitle && crumbs.length === 0) {
          crumbs.unshift(task.parentTitle);
        }
        break;
      }
    }
    return crumbs;
  };

  const matchesFilter = (item: TaskItem): boolean => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  };

  const { goalTrees, orphanStories, standaloneTasks } = React.useMemo(() => {
    const goals = tasks.filter((t) => t.type === 'goal');
    const allStories = tasks.filter((t) => t.type === 'story');
    const allTasks = tasks.filter((t) => t.type === 'task' || t.type === 'subtask');

    const trees = goals.map((goal) => {
      const stories = allStories
        .filter((s) => s.parentId === goal.id)
        .map((story) => ({
          story,
          tasks: allTasks.filter((t) => t.parentId === story.id),
        }));
      const directTasks = allTasks.filter((t) => t.parentId === goal.id);

      const totalGoalTasks =
        stories.reduce((acc, s) => acc + s.tasks.length, 0) + directTasks.length;
      const doneGoalTasks =
        stories.reduce((acc, s) => acc + s.tasks.filter((t) => t.status === 'done').length, 0) +
        directTasks.filter((t) => t.status === 'done').length;

      return {
        goal,
        stories,
        directTasks,
        totalTasks: totalGoalTasks,
        doneTasks: doneGoalTasks,
      };
    });

    const orphans = allStories
      .filter((s) => !s.parentId || !goals.some((g) => g.id === s.parentId))
      .map((story) => ({
        story,
        tasks: allTasks.filter((t) => t.parentId === story.id),
      }));

    const standalone = allTasks.filter((t) => {
      if (!t.parentId) return true;
      const isUnderStory = allStories.some((s) => s.id === t.parentId);
      const isUnderGoal = goals.some((g) => g.id === t.parentId);
      return !isUnderStory && !isUnderGoal;
    });

    return {
      goalTrees: trees,
      orphanStories: orphans,
      standaloneTasks: standalone,
    };
  }, [tasks]);

  const filteredGoalTrees = React.useMemo(() => {
    return goalTrees
      .map((gt) => {
        const goalMatches = matchesFilter(gt.goal);
        const matchingStories = gt.stories
          .map((st) => {
            const storyMatches = matchesFilter(st.story);
            const matchingTasks = st.tasks.filter(matchesFilter);
            if (storyMatches || matchingTasks.length > 0 || goalMatches) {
              return {
                story: st.story,
                tasks: goalMatches || storyMatches ? st.tasks : matchingTasks,
              };
            }
            return null;
          })
          .filter(Boolean) as typeof gt.stories;

        const matchingDirect = gt.directTasks.filter(
          (t) => goalMatches || matchesFilter(t)
        );

        if (goalMatches || matchingStories.length > 0 || matchingDirect.length > 0) {
          return {
            ...gt,
            stories: matchingStories,
            directTasks: matchingDirect,
          };
        }
        return null;
      })
      .filter(Boolean) as typeof goalTrees;
  }, [goalTrees, search, statusFilter]);

  const filteredOrphanStories = React.useMemo(() => {
    return orphanStories
      .map((st) => {
        const storyMatches = matchesFilter(st.story);
        const matchingTasks = st.tasks.filter(matchesFilter);
        if (storyMatches || matchingTasks.length > 0) {
          return {
            story: st.story,
            tasks: storyMatches ? st.tasks : matchingTasks,
          };
        }
        return null;
      })
      .filter(Boolean) as typeof orphanStories;
  }, [orphanStories, search, statusFilter]);

  const filteredStandaloneTasks = React.useMemo(() => {
    return standaloneTasks.filter(matchesFilter);
  }, [standaloneTasks, search, statusFilter]);

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description && t.description.toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }
    return true;
  });

  if (!currentUser) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <FolderKanban className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Users&apos; Data Explorer</h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Sign in to inspect database records across process items, blockers, decisions, and activity logs.
        </p>
        <div className="pt-2">
          <Button
            onClick={() => onRequireAuth('Sign in to view data explorer')}
            className="rounded-xl h-10 px-5 text-sm font-semibold bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
          >
            Sign In to Explore Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
            Users&apos; Data Explorer
          </h1>
          <span className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400">
            Unified Schema
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Inspect live database records across process items, blockers, decisions, and activity logs
        </p>

        <div>
          <button
            onClick={loadData}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* Explorer Sub-Tabs (Responsive 4-column segmented control on mobile, inline on desktop) */}
      <div className="w-full sm:w-fit grid grid-cols-4 sm:flex items-center gap-1 p-1 rounded-xl bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none min-w-0 ${
            activeTab === 'tasks'
              ? 'bg-white text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Tasks</span>
          <span className="text-[10px] font-mono opacity-60">({tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('blockers')}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none min-w-0 ${
            activeTab === 'blockers'
              ? 'bg-white text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <span className="truncate">Blockers</span>
          <span className="text-[10px] font-mono opacity-60">({blockers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('decisions')}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none min-w-0 ${
            activeTab === 'decisions'
              ? 'bg-white text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="truncate">Decisions</span>
          <span className="text-[10px] font-mono opacity-60">({decisions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none min-w-0 ${
            activeTab === 'activity'
              ? 'bg-white text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          <History className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className="truncate hidden sm:inline">Audit Log</span>
          <span className="truncate sm:hidden">Logs</span>
          <span className="text-[10px] font-mono opacity-60">({activities.length})</span>
        </button>
      </div>



      {/* TAB 1: TASKS (Hierarchical Tree View: Goal > Story > Task + Flat Ticker View) */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Top Bar: Search Input, Filter Pills, Add Item */}
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-xs space-y-3.5">
            {/* Hierarchy Guide & View Mode Switcher */}
            <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2.5 pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 font-medium overflow-x-auto no-scrollbar">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50 text-[11px] font-bold shrink-0">
                  🎯 Goal
                </span>
                <ChevronRight className="h-3 w-3 text-zinc-400 shrink-0" />
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 text-[11px] font-bold shrink-0">
                  📖 Story
                </span>
                <ChevronRight className="h-3 w-3 text-zinc-400 shrink-0" />
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700 text-[11px] font-bold shrink-0">
                  📋 Task
                </span>
              </div>

              {/* View Mode Toggle: Tree Hierarchy vs Flat List */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-800/50 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('tree')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'tree'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
                  }`}
                >
                  <FolderTree className="h-3.5 w-3.5" />
                  <span>Hierarchy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('flat')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'flat'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span>Flat List</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search goals, stories, or tasks by title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-10 pr-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 shadow-2xs transition-colors"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'todo', label: 'To Do' },
                  { id: 'in_progress', label: 'In Progress' },
                  { id: 'blocked', label: 'Blocked' },
                  { id: 'done', label: 'Done' },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setStatusFilter(pill.id)}
                    className={`inline-flex items-center justify-center h-9 px-3.5 rounded-xl border text-xs font-medium transition-all select-none whitespace-nowrap cursor-pointer ${
                      statusFilter === pill.id
                        ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 font-semibold shadow-xs'
                        : 'border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}

                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />

                <Button
                  onClick={() => openAddModal()}
                  className="h-9 px-3.5 rounded-xl gap-1.5 text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Add Item</span>
                </Button>
              </div>
            </div>
          </div>

          {/* VIEW MODE 1: HIERARCHY TREE (Goal > Story > Task) */}
          {viewMode === 'tree' && (
            <div className="space-y-4">
              {filteredGoalTrees.length === 0 &&
              filteredOrphanStories.length === 0 &&
              filteredStandaloneTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-500 bg-white dark:bg-zinc-900">
                  No items match your filter criteria.
                </div>
              ) : (
                <>
                  {/* GOALS AND THEIR HIERARCHICAL STORIES & TASKS */}
                  {filteredGoalTrees.map((gt) => {
                    const isGoalCollapsed = !!collapsedGoals[gt.goal.id];
                    const isGoalDone = gt.goal.status === 'done';

                    return (
                      <div
                        key={gt.goal.id}
                        className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden transition-all"
                      >
                        {/* 1. GOAL LEVEL HEADER */}
                        <div className="p-3.5 sm:p-4 bg-zinc-50/80 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleGoalCollapse(gt.goal.id)}
                              className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                              title={isGoalCollapsed ? 'Expand Goal' : 'Collapse Goal'}
                            >
                              {isGoalCollapsed ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>

                            <div className="h-8 px-2 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 font-mono font-bold text-xs flex items-center justify-center shrink-0 select-none shadow-2xs">
                              GOL
                            </div>

                            <div className="min-w-0 flex-1 truncate space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h3 className={`text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-50 truncate ${isGoalDone ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
                                  {gt.goal.title}
                                </h3>
                                <span className="rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 px-2 py-0.2 text-[10px] font-semibold border border-purple-200/60 dark:border-purple-800/40 uppercase hidden sm:inline-block">
                                  Goal
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide truncate">
                                <span>{gt.stories.length} {gt.stories.length === 1 ? 'STORY' : 'STORIES'} · {gt.totalTasks} TASKS</span>
                                <span>·</span>
                                <PriorityBadge priority={gt.goal.priority} />
                              </div>
                            </div>
                          </div>

                          {/* Goal Right Actions & Metrics */}
                          <div className="flex items-center gap-2 shrink-0">
                            {gt.totalTasks > 0 && (
                              <span className="rounded-full bg-zinc-200/70 dark:bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold font-mono text-zinc-700 dark:text-zinc-300 hidden md:inline-block">
                                {gt.doneTasks}/{gt.totalTasks} Done
                              </span>
                            )}

                            <StatusBadge status={gt.goal.status} className="hidden xs:inline-flex" />

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAddModal('story', gt.goal.id)}
                              className="h-8 px-2 sm:px-2.5 text-xs font-semibold gap-1 rounded-lg cursor-pointer"
                              title="Add Story under this Goal"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Add Story</span>
                            </Button>

                            <button
                              onClick={() => handleToggleComplete(gt.goal)}
                              className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                                isGoalDone
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40'
                                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-800'
                              }`}
                              title={isGoalDone ? 'Mark as incomplete' : 'Mark as complete'}
                            >
                              <Check className="h-4 w-4 stroke-[2.5]" />
                            </button>

                            <button
                              onClick={() => handleDeleteTask(gt.goal.id)}
                              className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/50 flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete goal"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* 2. EXPANDED STORIES UNDER THIS GOAL */}
                        {!isGoalCollapsed && (
                          <div className="p-3 sm:p-4 space-y-3.5 bg-white dark:bg-zinc-900">
                            {gt.stories.length === 0 && gt.directTasks.length === 0 ? (
                              <div className="p-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                No stories or tasks under this goal yet.{' '}
                                <button
                                  onClick={() => openAddModal('story', gt.goal.id)}
                                  className="text-zinc-900 dark:text-zinc-100 font-semibold underline underline-offset-2 ml-1 cursor-pointer"
                                >
                                  Add a story now
                                </button>
                              </div>
                            ) : (
                              gt.stories.map((st) => {
                                const isStoryCollapsed = !!collapsedStories[st.story.id];
                                const isStoryDone = st.story.status === 'done';

                                return (
                                  <div
                                    key={st.story.id}
                                    className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/60 p-3 sm:p-3.5 space-y-2.5 transition-all"
                                  >
                                    {/* STORY HEADER */}
                                    <div className="flex items-center justify-between gap-2.5">
                                      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                                        <button
                                          type="button"
                                          onClick={() => toggleStoryCollapse(st.story.id)}
                                          className="p-0.5 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                                          title={isStoryCollapsed ? 'Expand Story' : 'Collapse Story'}
                                        >
                                          {isStoryCollapsed ? (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          )}
                                        </button>

                                        <div className="h-7 px-2 rounded-lg bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60 font-mono font-bold text-[11px] flex items-center justify-center shrink-0 select-none shadow-2xs">
                                          STY
                                        </div>

                                        <div className="min-w-0 flex-1 truncate space-y-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <h4 className={`text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate ${isStoryDone ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
                                              {st.story.title}
                                            </h4>
                                            <span className="rounded bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 px-1.5 py-0.2 text-[9px] font-semibold border border-sky-200/50 dark:border-sky-800/40 uppercase hidden sm:inline-block">
                                              Story
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide truncate">
                                            <span>{st.tasks.length} {st.tasks.length === 1 ? 'TASK' : 'TASKS'}</span>
                                            <span>·</span>
                                            <PriorityBadge priority={st.story.priority} />
                                          </div>
                                        </div>
                                      </div>

                                      {/* Story Actions */}
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <StatusBadge status={st.story.status} className="hidden sm:inline-flex" />

                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => openAddModal('task', st.story.id)}
                                          className="h-7 px-2 text-[11px] font-semibold gap-1 rounded-lg cursor-pointer"
                                          title="Add Task under this Story"
                                        >
                                          <Plus className="h-3 w-3" />
                                          <span className="hidden sm:inline">Add Task</span>
                                        </Button>

                                        <button
                                          onClick={() => handleToggleComplete(st.story)}
                                          className={`h-7 w-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                                            isStoryDone
                                              ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40'
                                              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-800'
                                          }`}
                                          title={isStoryDone ? 'Mark as incomplete' : 'Mark as complete'}
                                        >
                                          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                        </button>

                                        <button
                                          onClick={() => handleDeleteTask(st.story.id)}
                                          className="h-7 w-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/50 flex items-center justify-center transition-colors cursor-pointer"
                                          title="Delete story"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* 3. TASK LEVEL ROWS (Indented under Story) */}
                                    {!isStoryCollapsed && (
                                      <div className="pl-3 sm:pl-4 border-l-2 border-sky-200/70 dark:border-sky-900/50 ml-2.5 sm:ml-3 space-y-1.5 pt-1">
                                        {st.tasks.length === 0 ? (
                                          <div className="text-[11px] text-zinc-400 italic py-1">
                                            No tasks yet.{' '}
                                            <button
                                              onClick={() => openAddModal('task', st.story.id)}
                                              className="text-zinc-800 dark:text-zinc-200 font-semibold underline ml-1 cursor-pointer"
                                            >
                                              Add a task
                                            </button>
                                          </div>
                                        ) : (
                                          st.tasks.map((t) => {
                                            const isDone = t.status === 'done';

                                            return (
                                              <div
                                                key={t.id}
                                                className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all gap-2.5 shadow-2xs ${
                                                  isDone ? 'opacity-65' : ''
                                                }`}
                                              >
                                                {/* Left: TSK badge */}
                                                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/90 dark:border-zinc-700/80 flex items-center justify-center font-mono font-bold text-[10px] text-zinc-700 dark:text-zinc-300 shadow-2xs shrink-0 select-none">
                                                  TSK
                                                </div>

                                                {/* Middle: Title & Metadata */}
                                                <div className="space-y-0.5 min-w-0 flex-1 truncate">
                                                  <h5 className={`text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate ${isDone ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
                                                    {t.title}
                                                  </h5>
                                                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide truncate">
                                                    <PriorityBadge priority={t.priority} />
                                                    <span>·</span>
                                                    <span>{new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                                                  </div>
                                                </div>

                                                {/* Right: Pill Badge + Actions */}
                                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                                  <StatusBadge status={t.status} className="hidden xs:inline-flex" />

                                                  <div className="flex items-center gap-1">
                                                    <button
                                                      onClick={() => handleToggleComplete(t)}
                                                      className={`h-7 w-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                                                        isDone
                                                          ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40'
                                                          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-800'
                                                      }`}
                                                      title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                                                    >
                                                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                                    </button>

                                                    <button
                                                      onClick={() => handleDeleteTask(t.id)}
                                                      className="h-7 w-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/50 flex items-center justify-center transition-colors cursor-pointer"
                                                      title="Delete task"
                                                    >
                                                      <Trash2 className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* STANDALONE TASKS (TASKS NOT ATTACHED TO GOALS OR STORIES) */}
                  {filteredStandaloneTasks.length > 0 && (
                    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                            📋 Standalone Tasks & Quick Items ({filteredStandaloneTasks.length})
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAddModal('task')}
                          className="h-7 px-2 text-[11px] font-semibold gap-1 rounded-lg cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Task</span>
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        {filteredStandaloneTasks.map((t) => {
                          const isDone = t.status === 'done';

                          return (
                            <div
                              key={t.id}
                              className={`flex items-center justify-between p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/70 transition-all gap-3 ${
                                isDone ? 'opacity-65' : ''
                              }`}
                            >
                              <div className="h-9 w-9 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-700/80 flex items-center justify-center font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200 shadow-2xs shrink-0 select-none">
                                TSK
                              </div>

                              <div className="space-y-0.5 min-w-0 flex-1 truncate">
                                <h4 className={`text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate ${isDone ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
                                  {t.title}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide truncate">
                                  <span>STANDALONE TASK</span>
                                  <span>·</span>
                                  <PriorityBadge priority={t.priority} />
                                  <span>·</span>
                                  <span>{new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <StatusBadge status={t.status} className="hidden xs:inline-flex" />

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleToggleComplete(t)}
                                    className={`h-8 w-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                                      isDone
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40'
                                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-800'
                                    }`}
                                    title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                                  >
                                    <Check className="h-4 w-4 stroke-[2.5]" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteTask(t.id)}
                                    className="h-8 w-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/50 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Delete task"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* VIEW MODE 2: FLAT LIST (Ticker style with full breadcrumbs on each item) */}
          {viewMode === 'flat' && (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-xs space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-500">
                  No items match your filter criteria.
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const isDone = t.status === 'done';
                  const ticker = t.type === 'story' ? 'STY' : t.type === 'goal' ? 'GOL' : 'TSK';
                  const crumbs = getBreadcrumbs(t);

                  return (
                    <div
                      key={t.id}
                      className={`flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-[#fafafa] dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition-all gap-3 ${
                        isDone ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-700/80 flex items-center justify-center font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200 shadow-2xs shrink-0 select-none">
                        {ticker}
                      </div>

                      <div className="space-y-0.5 min-w-0 flex-1 truncate">
                        <h4 className={`text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate ${isDone ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
                          {t.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide truncate">
                          {crumbs.length > 0 && (
                            <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                              {crumbs.join(' › ')} ·{' '}
                            </span>
                          )}
                          <PriorityBadge priority={t.priority} />
                          <span>·</span>
                          <span>{new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <StatusBadge status={t.status} className="hidden xs:inline-flex" />

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleComplete(t)}
                            className={`h-8 w-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                              isDone
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40'
                                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-800'
                            }`}
                            title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                          >
                            <Check className="h-4 w-4 stroke-[2.5]" />
                          </button>

                          <button
                            onClick={() => handleDeleteTask(t.id)}
                            className="h-8 w-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/50 flex items-center justify-center transition-colors cursor-pointer"
                            title="Delete item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}


      {/* TAB 2: BLOCKERS */}
      {activeTab === 'blockers' && (
        <div className="space-y-3">
          {blockers.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-xs text-zinc-500">
              No active blockers found in the database.
            </div>
          ) : (
            blockers.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">
                      Active Blocker
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {b.reason}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Logged: {new Date(b.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={() => handleResolveBlocker(b.id)}
                  className="rounded-xl bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-800 px-3.5 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-100/50 transition-colors self-start sm:self-center shadow-2xs"
                >
                  Mark Resolved
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: DECISIONS */}
      {activeTab === 'decisions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {decisions.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center text-xs text-zinc-500">
              No architectural decision records (ADRs) logged yet.
            </div>
          ) : (
            decisions.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Decided by: <strong className="text-zinc-700 dark:text-zinc-300">{d.decidedBy}</strong></span>
                    <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                    {d.summary}
                  </h3>
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                    {d.rationale}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: AUDIT LOG */}
      {activeTab === 'activity' && (
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs divide-y divide-zinc-100 dark:divide-zinc-800">
          {activities.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No activity logged yet.
            </div>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="p-3.5 sm:p-4 flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-700 dark:text-zinc-300 uppercase">
                    {a.actorType}
                  </span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold truncate">
                    {a.action}
                  </span>
                  {a.reason && (
                    <span className="text-zinc-500 truncate hidden sm:inline">
                      — {a.reason}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-zinc-400 shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ADD ITEM MODAL */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Add Process Item</DialogTitle>
            <DialogDescription className="text-xs">
              Create a new item in your process manager database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTask} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs font-semibold">Title</Label>
              <Input
                id="title"
                placeholder={
                  newType === 'goal'
                    ? "e.g. Rahul's Wedding Planning"
                    : newType === 'story'
                    ? 'e.g. Venue & Decorations'
                    : 'e.g. Book final venue and pay advance'
                }
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                className="rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="desc" className="text-xs font-semibold">Description (Optional)</Label>
              <Input
                id="desc"
                placeholder="Additional context or notes"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label htmlFor="type" className="text-xs font-semibold">Item Level</Label>
                <select
                  id="type"
                  value={newType}
                  onChange={(e) => {
                    const t = e.target.value as 'task' | 'story' | 'goal';
                    setNewType(t);
                    setNewParentId('');
                  }}
                  className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                >
                  <option value="goal">🎯 Goal (Top Level)</option>
                  <option value="story">📖 Story (Under Goal)</option>
                  <option value="task">📋 Task (Under Story / Standalone)</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="priority" className="text-xs font-semibold">Priority</Label>
                <select
                  id="priority"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Parent Selection for Stories */}
            {newType === 'story' && (
              <div className="space-y-1 pt-1">
                <Label htmlFor="parentId" className="text-xs font-semibold">Parent Goal *</Label>
                <select
                  id="parentId"
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  required
                  className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                >
                  <option value="">Select a Goal...</option>
                  {tasks
                    .filter((t) => t.type === 'goal')
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        🎯 {g.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Parent Selection for Tasks */}
            {newType === 'task' && (
              <div className="space-y-1 pt-1">
                <Label htmlFor="parentId" className="text-xs font-semibold">Parent Story (Optional)</Label>
                <select
                  id="parentId"
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                >
                  <option value="">None (Standalone Task)</option>
                  {tasks
                    .filter((t) => t.type === 'story')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        📖 {s.parentTitle ? `${s.parentTitle} › ` : ''}{s.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="pt-2 w-full">
              <Button
                type="submit"
                disabled={createLoading || !newTitle.trim() || (newType === 'story' && !newParentId)}
                className="w-full h-11 rounded-xl bg-zinc-950 text-white hover:bg-zinc-900 font-medium text-sm transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
              >
                {createLoading ? 'Creating...' : `Save ${newType.charAt(0).toUpperCase() + newType.slice(1)}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
