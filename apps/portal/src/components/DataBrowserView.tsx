import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  History,
  Plus,
  Trash2,
  FolderKanban,
  Search,
  Bot,
  User,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs.js';
import {
  api,
  type TaskItem,
  type BlockerItem,
  type DecisionItem,
  type ActivityItem,
} from '../api/client.js';

export function DataBrowserView() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'blockers' | 'decisions' | 'activity'>('tasks');
  const [loading, setLoading] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueAt, setNewDueAt] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Blockers state
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  const [showAddBlocker, setShowAddBlocker] = useState(false);
  const [blockerTargetId, setBlockerTargetId] = useState('');
  const [blockerReason, setBlockerReason] = useState('');

  // Decisions state
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [showAddDecision, setShowAddDecision] = useState(false);
  const [decisionItemId, setDecisionItemId] = useState('');
  const [decisionSummary, setDecisionSummary] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');

  // Activity stream state
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tRes, bRes, dRes, aRes] = await Promise.all([
        api.getItems(),
        api.getBlockers(),
        api.getDecisions(),
        api.getActivity(),
      ]);
      setTasks(tRes.items || []);
      setBlockers(bRes.blockers || []);
      setDecisions(dRes.decisions || []);
      setActivities(aRes.activities || []);
      if (tRes.items && tRes.items.length > 0 && tRes.items[0]) {
        const firstId = tRes.items[0].id;
        setBlockerTargetId(firstId);
        setDecisionItemId(firstId);
      }
    } catch (err) {
      console.error('Failed to load user data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered tasks
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (searchQuery.trim() && !task.title.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  // Task actions
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await api.createTask({
        title: newTitle.trim(),
        priority: newPriority,
        description: newDescription.trim() || undefined,
        dueAt: newDueAt ? new Date(newDueAt).toISOString() : undefined,
      });
      setNewTitle('');
      setNewDescription('');
      setNewDueAt('');
      setShowAddTask(false);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      await api.completeTask(id, 'Marked complete from portal data browser');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Soft delete this task?')) return;
    try {
      await api.deleteTask(id, 'Soft deleted from portal');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  // Blocker actions
  const handleCreateBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockerTargetId || !blockerReason.trim()) return;
    try {
      await api.createTask as any; // placeholder check
      await fetch('/api/blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: blockerTargetId,
          reason: blockerReason.trim(),
        }),
      });
      setBlockerReason('');
      setShowAddBlocker(false);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to set blocker');
    }
  };

  const handleResolveBlocker = async (id: string) => {
    try {
      await api.resolveBlocker(id, 'Blocker resolved via data browser');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resolve blocker');
    }
  };

  // Decision actions
  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionItemId || !decisionSummary.trim() || !decisionRationale.trim()) return;
    try {
      await api.logDecision({
        itemId: decisionItemId,
        summary: decisionSummary.trim(),
        rationale: decisionRationale.trim(),
      });
      setDecisionSummary('');
      setDecisionRationale('');
      setShowAddDecision(false);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to log decision');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Users' Data Explorer</h2>
            <Badge variant="outline" className="font-mono text-xs">
              Unified Schema
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inspect live database records across process items, blockers, decisions, and activity logs
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </Button>
      </div>

      {/* Tabs navigation */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
        <TabsList className="grid grid-cols-4 w-full sm:w-[500px]">
          <TabsTrigger value="tasks" icon={<FolderKanban className="w-3.5 h-3.5" />}>
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="blockers" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
            Blockers ({blockers.length})
          </TabsTrigger>
          <TabsTrigger value="decisions" icon={<Lightbulb className="w-3.5 h-3.5" />}>
            Decisions ({decisions.length})
          </TabsTrigger>
          <TabsTrigger value="activity" icon={<History className="w-3.5 h-3.5" />}>
            Audit Log ({activities.length})
          </TabsTrigger>
        </TabsList>

        {/* =================================================================== */}
        {/* Tab 1: Tasks & Process Items */}
        {/* =================================================================== */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search items by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm"
              >
                <option value="all">All Statuses</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <Button size="sm" onClick={() => setShowAddTask(!showAddTask)} className="gap-1.5 h-9">
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>
          </div>

          {/* Add Task Form */}
          {showAddTask && (
            <Card className="border-primary/40 bg-card p-4 space-y-3">
              <form onSubmit={handleCreateTask} className="space-y-3">
                <Input
                  required
                  placeholder="Task title..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <Input
                    type="date"
                    value={newDueAt}
                    onChange={(e) => setNewDueAt(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddTask(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Create Task
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Items Table / Cards */}
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
                No items match the current filters.
              </div>
            ) : (
              filteredTasks.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${item.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.title}
                      </span>
                      <Badge variant={item.status as any}>{item.status}</Badge>
                      <Badge variant={item.priority as any}>{item.priority}</Badge>
                      <span className="font-mono text-[10px] text-muted-foreground uppercase">{item.type}</span>
                    </div>
                    {item.parentTitle && (
                      <p className="text-xs text-muted-foreground">
                        Parent: <span className="text-foreground">{item.parentTitle}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {item.status !== 'done' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCompleteTask(item.id)}
                        className="h-7 text-xs gap-1 hover:border-emerald-500/50 hover:text-emerald-400"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Complete
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteTask(item.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 2: Blockers */}
        {/* =================================================================== */}
        <TabsContent value="blockers" className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <p className="text-xs text-muted-foreground">
              Items marked as blocked prevent progress until an impediment is cleared.
            </p>
            <Button size="sm" onClick={() => setShowAddBlocker(!showAddBlocker)} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              Set Blocker
            </Button>
          </div>

          {showAddBlocker && (
            <Card className="border-red-500/40 p-4 space-y-3">
              <form onSubmit={handleCreateBlocker} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Target Item</label>
                  <select
                    value={blockerTargetId}
                    onChange={(e) => setBlockerTargetId(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Reason for Blocker *</label>
                  <Input
                    required
                    placeholder="e.g. Waiting on API credentials from 3rd party"
                    value={blockerReason}
                    onChange={(e) => setBlockerReason(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddBlocker(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" variant="destructive">
                    Set Blocker
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {blockers.length === 0 ? (
              <div className="col-span-full p-8 text-center text-xs text-muted-foreground border rounded-lg">
                No active blockers! All processes are clear.
              </div>
            ) : (
              blockers.map((b) => {
                const targetTask = tasks.find((t) => t.id === b.itemId);
                return (
                  <Card key={b.id} className="border-red-500/30 bg-red-500/5">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-red-400">
                          <AlertTriangle className="w-4 h-4" />
                          {targetTask?.title || 'Unknown Item'}
                        </CardTitle>
                        <Badge variant="blocked">Active Blocker</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-3">
                      <p className="text-xs text-foreground bg-background/50 p-2.5 rounded border border-red-500/20">
                        {b.reason}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          Logged: {new Date(b.createdAt).toLocaleString()}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolveBlocker(b.id)}
                          className="h-7 text-xs hover:border-emerald-500/50 hover:text-emerald-400"
                        >
                          Resolve & Unblock
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 3: Decisions */}
        {/* =================================================================== */}
        <TabsContent value="decisions" className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <p className="text-xs text-muted-foreground">
              Immutable log of choices and rationale recorded during task progression.
            </p>
            <Button size="sm" onClick={() => setShowAddDecision(!showAddDecision)} className="gap-1.5 h-8">
              <Plus className="w-3.5 h-3.5" />
              Log Decision
            </Button>
          </div>

          {showAddDecision && (
            <Card className="border-amber-500/40 p-4 space-y-3">
              <form onSubmit={handleCreateDecision} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Related Item</label>
                  <select
                    value={decisionItemId}
                    onChange={(e) => setDecisionItemId(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  >
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Decision Summary *</label>
                  <Input
                    required
                    placeholder="e.g. Selected MongoDB Replica Set over PostgreSQL"
                    value={decisionSummary}
                    onChange={(e) => setDecisionSummary(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Rationale & Context *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Why this choice was made..."
                    value={decisionRationale}
                    onChange={(e) => setDecisionRationale(e.target.value)}
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddDecision(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Record Decision
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-2.5">
            {decisions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
                No decisions recorded yet.
              </div>
            ) : (
              decisions.map((d) => (
                <div key={d.id} className="p-3.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-400" />
                      {d.summary}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground italic pl-6">"{d.rationale}"</p>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 4: Audit Stream */}
        {/* =================================================================== */}
        <TabsContent value="activity" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Append-only tamper-evident log of all write operations by actor type.
          </p>

          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg">
                No audit activity found.
              </div>
            ) : (
              activities.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-card text-xs gap-2"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5 ${
                        a.actorType === 'ai'
                          ? 'bg-purple-500/20 text-purple-400'
                          : a.actorType === 'user'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {a.actorType === 'ai' ? (
                        <Bot className="w-3.5 h-3.5" />
                      ) : (
                        <User className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-mono py-0 ${
                            a.actorType === 'ai' ? 'text-purple-400 border-purple-500/30' : 'text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {a.actorType}
                        </Badge>
                        <span className="font-semibold text-foreground capitalize">
                          {a.action.replace('_', ' ')}
                        </span>
                      </div>
                      {a.reason && <p className="text-muted-foreground mt-0.5">Reason: {a.reason}</p>}
                    </div>
                  </div>

                  <span className="font-mono text-[11px] text-muted-foreground self-end sm:self-auto">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
