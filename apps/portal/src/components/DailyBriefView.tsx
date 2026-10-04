import { useState, useEffect } from 'react';
import {
  api,
  type DailyBriefResponse,
  type UserProfile,
} from '../api/client.js';
import {
  RefreshCw,
  Target,
  AlertTriangle,
  Clock,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { Skeleton } from './ui/skeleton.js';
import { StatusBadge, PriorityBadge, getStatusCardClass } from './ui/badge.js';
import { cn } from '@/lib/utils.js';

interface DailyBriefViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
  onNavigateToTasks: () => void;
}

export function DailyBriefView({
  currentUser,
  onRequireAuth,
  onNavigateToTasks,
}: DailyBriefViewProps) {
  const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBrief = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await api.getDailyBrief();
      setBrief(data);
    } catch (err) {
      console.error('Failed to load brief:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchBrief();
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <Target className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Daily Executive Brief</h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          AI-curated brief of your top focus targets, active blockers, and commitments scheduled for today.
        </p>
        <div className="pt-2">
          <Button
            onClick={() => onRequireAuth('Sign in to view your daily executive brief')}
            className="rounded-xl h-10 px-5 text-sm font-semibold bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
          >
            Sign In to View Brief
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !brief) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8 animate-in fade-in duration-300">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-lg" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>

        {/* Metric Strip Skeleton */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-100 dark:divide-zinc-800">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 sm:p-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-3.5 w-20 rounded" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
                <Skeleton className="h-8 w-12 rounded-md" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Focus Targets Skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-44 rounded-md" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-16 rounded-full" />
                    <Skeleton className="h-4 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-3/4 rounded-md" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        </div>

        {/* Secondary Grid Skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="space-y-2.5">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
          <div className="p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="space-y-2.5">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const focusCount = brief?.suggestedFocus?.length ?? 3;
  const blockerCount = brief?.blockedTasks?.length ?? 0;
  const dueCount = brief?.dueTasks?.length ?? 0;
  const overdueCount = brief?.overdueTasks?.length ?? 0;

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
            Daily Executive Brief
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {brief?.date || new Date().toISOString().split('T')[0]} · Timezone: {brief?.timezone || 'Asia/Kolkata'} · AI-curated commitments
          </p>
        </div>

        <div>
          <button
            onClick={fetchBrief}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Brief</span>
          </button>
        </div>
      </div>

      {/* Compressed Consolidated Metric Strip (High Density & Effective Info) */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-100 dark:divide-zinc-800">
          {/* Focus Targets */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">Focus Targets</span>
              <Target className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div className="my-1.5">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
                {focusCount}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">Top momentum today</p>
          </div>

          {/* Active Blockers */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">Active Blockers</span>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="my-1.5">
              <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${blockerCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-950 dark:text-zinc-100'}`}>
                {blockerCount}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
              {blockerCount > 0 ? 'Requires attention' : 'None blocking'}
            </p>
          </div>

          {/* Due Today */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">Due Today</span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="my-1.5">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">
                {dueCount}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">Before midnight</p>
          </div>

          {/* Overdue Items */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">Overdue</span>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="my-1.5">
              <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${overdueCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-950 dark:text-zinc-100'}`}>
                {overdueCount}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
              {overdueCount > 0 ? 'Past deadline' : 'None overdue'}
            </p>
          </div>
        </div>
      </div>


      {/* Suggested Focus (Top 3) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Suggested Focus (Top 3)
            </h2>
          </div>
          <button
            onClick={onNavigateToTasks}
            className="flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
          >
            <span>All Tasks</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-zinc-500 -mt-2">
          Tasks calculated by priority weighting and deadline proximity
        </p>

        {/* List of Focus Items */}
        <div className="space-y-3">
          {(!brief?.suggestedFocus || brief.suggestedFocus.length === 0) ? (
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center text-xs text-zinc-500">
              No pending focus items. All tasks are currently on track!
            </div>
          ) : (
            brief.suggestedFocus.slice(0, 3).map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center justify-between p-4 rounded-2xl border shadow-xs transition-all',
                  getStatusCardClass(item.status)
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="font-mono text-xs font-bold text-zinc-400 shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {item.title}
                    </p>
                    {item.parentTitle && (
                      <p className="text-xs text-zinc-500 truncate">
                        Parent: {item.parentTitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  <PriorityBadge priority={item.priority} size="xs" />
                  <StatusBadge status={item.status} size="xs" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Summary Note */}
      {brief?.summary && (
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-2">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            AI Assistant Executive Note
          </p>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {brief.summary}
          </p>
        </div>
      )}
    </div>
  );
}
