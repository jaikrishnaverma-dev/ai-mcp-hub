import { useState, useEffect } from 'react';
import { Target, AlertTriangle, Clock, CheckCircle2, ArrowRight, Lightbulb, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { api, type DailyBriefResponse } from '../api/client.js';

interface DailyBriefViewProps {
  onNavigateToTasks: () => void;
  onNavigateToBlockers: () => void;
}

export function DailyBriefView({ onNavigateToTasks, onNavigateToBlockers }: DailyBriefViewProps) {
  const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBrief = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDailyBrief();
      setBrief(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch daily brief');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrief();
  }, []);

  const handleComplete = async (taskId: string) => {
    try {
      await api.completeTask(taskId, 'Completed from Daily Brief dashboard');
      await loadBrief();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  if (loading && !brief) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Aggregating daily brief and scoring focus priorities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/10">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadBrief} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!brief) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner / Today Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Daily Executive Brief</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {brief.today} · AI-curated state of commitments and bottlenecks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadBrief} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Brief
          </Button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-card to-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Focus Targets</span>
              <Target className="w-4 h-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-mono">{brief.focus.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Top scored for momentum today
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Active Blockers</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-mono text-red-400">{brief.blocked.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            {brief.blocked.length > 0 ? 'Requires intervention' : 'No bottlenecks detected'}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Due Today</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-mono">{brief.dueToday.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Commitments closing by midnight
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-card/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Overdue Items</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-mono text-amber-400">{brief.overdue.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Past due deadline
          </CardContent>
        </Card>
      </div>

      {/* Main Focus Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Suggested Focus (Top 3)
                </CardTitle>
                <CardDescription>
                  Tasks calculated by priority weighting and deadline proximity
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={onNavigateToTasks} className="text-xs gap-1">
                All Tasks <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {brief.focus.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  🎉 No urgent tasks pending! You're caught up.
                </div>
              ) : (
                brief.focus.map((task, index) => (
                  <div
                    key={task.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border bg-background/50 hover:bg-muted/40 transition-colors gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-mono font-bold mt-0.5">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{task.title}</span>
                          <Badge variant={task.priority as any}>{task.priority}</Badge>
                          <Badge variant={task.status as any}>{task.status}</Badge>
                        </div>
                        {task.parentTitle && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Project: <span className="text-foreground/80">{task.parentTitle}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleComplete(task.id)}
                        className="h-8 gap-1.5 text-xs hover:border-emerald-500/50 hover:text-emerald-400"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Mark Done
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Active Blockers Alert Box */}
          {brief.blocked.length > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Active Blockers Requiring Attention ({brief.blocked.length})
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={onNavigateToBlockers} className="text-xs text-red-400 hover:text-red-300">
                  Manage Blockers
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {brief.blocked.map((item) => (
                  <div key={item.id} className="p-3 rounded-md border border-red-500/20 bg-background/60 text-xs">
                    <div className="font-semibold text-foreground flex items-center justify-between">
                      <span>{item.title}</span>
                      <Badge variant="blocked">blocked</Badge>
                    </div>
                    {item.blockers.map((b, idx) => (
                      <p key={idx} className="text-muted-foreground mt-1 text-[11px]">
                        ⚠️ Reason: {b}
                      </p>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Sidebar: Due Today & Recent Decisions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Due Today ({brief.dueToday.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {brief.dueToday.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tasks scheduled for today's deadline.</p>
              ) : (
                brief.dueToday.map((task) => (
                  <div key={task.id} className="p-2.5 rounded-md border text-xs flex items-center justify-between">
                    <span className="font-medium truncate mr-2">{task.title}</span>
                    <Badge variant={task.priority as any}>{task.priority}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {brief.recentDecisions && brief.recentDecisions.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  Recent Decisions ({brief.recentDecisions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {brief.recentDecisions.map((d) => (
                  <div key={d.id} className="p-2.5 rounded-md border bg-muted/30 text-xs space-y-1">
                    <p className="font-medium text-foreground">{d.summary}</p>
                    <p className="text-[11px] text-muted-foreground italic">"{d.rationale}"</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
