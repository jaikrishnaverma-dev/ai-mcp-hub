import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Trash2, Filter, Calendar, FolderKanban } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { api, type TaskItem } from '../api/client.js';

export function TasksView() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // New task form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDescription, setNewDescription] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const params: { status?: string; priority?: string } = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;

      const res = await api.getItems(params);
      setTasks(res.items || []);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [statusFilter, priorityFilter]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsSubmitting(true);
      await api.createTask({
        title: newTitle.trim(),
        priority: newPriority,
        description: newDescription.trim() || undefined,
        dueAt: newDueAt ? new Date(newDueAt).toISOString() : undefined,
      });
      setNewTitle('');
      setNewDescription('');
      setNewDueAt('');
      setShowAddForm(false);
      await loadTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await api.completeTask(taskId, 'Marked complete via web portal');
      await loadTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to soft delete this task?')) return;
    try {
      await api.deleteTask(taskId, 'Deleted via web portal');
      await loadTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Process Items & Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage goals, stories, and tasks synced with your AI client
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-1.5 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          {showAddForm ? 'Cancel' : 'New Task'}
        </Button>
      </div>

      {/* Add Task Modal / Card */}
      {showAddForm && (
        <Card className="border-primary/40 bg-card/95 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Create New Process Item</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Finalize vendor contracts"
                  required
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="none">None</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                  <Input
                    type="date"
                    value={newDueAt}
                    onChange={(e) => setNewDueAt(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Description (Optional)</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  placeholder="Context, requirements, links..."
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting || !newTitle.trim()}>
                  {isSubmitting ? 'Creating...' : 'Create Item'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-card/40">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mr-2">
          <Filter className="w-3.5 h-3.5" /> Filter by:
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 flex-wrap">
          {['all', 'todo', 'in_progress', 'blocked', 'done'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border hidden sm:block mx-1" />

        {/* Priority Filters */}
        <div className="flex items-center gap-1 flex-wrap">
          {['all', 'critical', 'high', 'medium', 'low'].map((pr) => (
            <button
              key={pr}
              onClick={() => setPriorityFilter(pr)}
              className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                priorityFilter === pr
                  ? 'bg-secondary text-secondary-foreground font-semibold border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {pr}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No process items found matching the selected filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-border/80 transition-all gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.title}
                  </span>
                  <Badge variant={task.status as any}>{task.status}</Badge>
                  <Badge variant={task.priority as any}>{task.priority}</Badge>
                  <span className="text-[11px] font-mono text-muted-foreground uppercase">{task.type}</span>
                </div>

                {task.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
                  {task.parentTitle && (
                    <span className="flex items-center gap-1">
                      <FolderKanban className="w-3.5 h-3.5" />
                      {task.parentTitle}
                    </span>
                  )}
                  {task.dueAt && (
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Calendar className="w-3.5 h-3.5" />
                      Due {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {task.status !== 'done' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleComplete(task.id)}
                    className="h-8 gap-1.5 text-xs hover:border-emerald-500/50 hover:text-emerald-400"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Complete
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(task.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Soft delete item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
