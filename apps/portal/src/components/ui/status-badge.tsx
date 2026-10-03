import * as React from 'react';
import { cn } from '@/lib/utils.js';
import { Check, AlertTriangle, Clock, PlayCircle, XCircle } from 'lucide-react';

export type PlatformStatus = 'todo' | 'in_progress' | 'done' | 'completed' | 'blocked' | 'cancelled' | string;
export type PlatformPriority = 'critical' | 'high' | 'medium' | 'low' | 'none' | string;
export type PlatformItemType = 'goal' | 'story' | 'task' | 'subtask' | 'note' | 'event' | string;

export interface StatusConfig {
  label: string;
  className: string;
  dotClassName: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  todo: {
    label: 'To Do',
    className:
      'bg-zinc-100 text-zinc-700 border-zinc-200/90 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/60',
    dotClassName: 'bg-zinc-400 dark:bg-zinc-500',
    icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    className:
      'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60 shadow-2xs',
    dotClassName: 'bg-blue-500 animate-pulse',
    icon: PlayCircle,
  },
  done: {
    label: 'Done',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60 shadow-2xs',
    dotClassName: 'bg-emerald-500',
    icon: Check,
  },
  completed: {
    label: 'Completed',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60 shadow-2xs',
    dotClassName: 'bg-emerald-500',
    icon: Check,
  },
  blocked: {
    label: 'Blocked',
    className:
      'bg-red-50 text-red-700 border-red-200/80 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60 shadow-2xs',
    dotClassName: 'bg-red-500',
    icon: AlertTriangle,
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'bg-zinc-100/70 text-zinc-500 border-zinc-200/60 dark:bg-zinc-900/60 dark:text-zinc-500 dark:border-zinc-800 line-through',
    dotClassName: 'bg-zinc-400 dark:bg-zinc-600',
    icon: XCircle,
  },
};

export const PRIORITY_CONFIG: Record<string, { label: string; className: string; dotClassName: string }> = {
  critical: {
    label: 'Critical',
    className:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60 font-bold',
    dotClassName: 'bg-rose-500',
  },
  high: {
    label: 'High',
    className:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
    dotClassName: 'bg-amber-500',
  },
  medium: {
    label: 'Medium',
    className:
      'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/60',
    dotClassName: 'bg-sky-500',
  },
  low: {
    label: 'Low',
    className:
      'bg-zinc-100 text-zinc-600 border-zinc-200/80 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700/60',
    dotClassName: 'bg-zinc-400',
  },
  none: {
    label: 'None',
    className:
      'bg-zinc-50 text-zinc-400 border-zinc-200/50 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800',
    dotClassName: 'bg-zinc-300 dark:bg-zinc-700',
  },
};

export const ITEM_TYPE_CONFIG: Record<string, { ticker: string; label: string; badgeClass: string; tickerClass: string }> = {
  goal: {
    ticker: 'GOL',
    label: 'Goal',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200/70 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/50',
    tickerClass:
      'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800/60',
  },
  story: {
    ticker: 'STY',
    label: 'Story',
    badgeClass:
      'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/50',
    tickerClass:
      'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800/60',
  },
  task: {
    ticker: 'TSK',
    label: 'Task',
    badgeClass:
      'bg-zinc-100 text-zinc-700 border-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    tickerClass:
      'bg-zinc-100 text-zinc-700 border-zinc-200/90 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700/80',
  },
  subtask: {
    ticker: 'SUB',
    label: 'Subtask',
    badgeClass:
      'bg-zinc-100 text-zinc-600 border-zinc-200/70 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700',
    tickerClass:
      'bg-zinc-100 text-zinc-600 border-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700/70',
  },
  note: {
    ticker: 'NOT',
    label: 'Note',
    badgeClass:
      'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50',
    tickerClass:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800/60',
  },
  event: {
    ticker: 'EVT',
    label: 'Event',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50',
    tickerClass:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/60',
  },
};

/**
 * Standardized Status Badge component used across the entire platform
 */
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: PlatformStatus;
  showDot?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function StatusBadge({
  status,
  showDot = true,
  size = 'xs',
  className,
  ...props
}: StatusBadgeProps) {
  const normalizedKey = (status || 'todo').toLowerCase().replace(/\s+/g, '_');
  const config = STATUS_CONFIG[normalizedKey] || {
    label: status.replace('_', ' '),
    className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    dotClassName: 'bg-zinc-400',
  };

  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[9px]',
    sm: 'px-2.5 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
  }[size];

  const dotSizes = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2 w-2',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold select-none capitalize transition-colors',
        sizeClasses,
        config.className,
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn('rounded-full shrink-0', dotSizes, config.dotClassName)}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Standardized Priority Badge component used across the entire platform
 */
export interface PriorityBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  priority: PlatformPriority;
  showDot?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function PriorityBadge({
  priority,
  showDot = false,
  size = 'xs',
  className,
  ...props
}: PriorityBadgeProps) {
  const normalizedKey = (priority || 'medium').toLowerCase();
  const config = PRIORITY_CONFIG[normalizedKey] || {
    label: priority,
    className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    dotClassName: 'bg-zinc-400',
  };

  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[9px]',
    sm: 'px-2.5 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
  }[size];

  const dotSizes = {
    xs: 'h-1.5 w-1.5',
    sm: 'h-2 w-2',
    md: 'h-2 w-2',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium select-none capitalize transition-colors',
        sizeClasses,
        config.className,
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn('rounded-full shrink-0', dotSizes, config.dotClassName)}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Standardized Item Type Pill (Goal, Story, Task, etc.)
 */
export function ItemTypeBadge({
  type,
  className,
}: {
  type: PlatformItemType;
  className?: string;
}) {
  const normalizedKey = (type || 'task').toLowerCase();
  const fallback = ITEM_TYPE_CONFIG['task']!;
  const config = ITEM_TYPE_CONFIG[normalizedKey] || fallback;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.2 text-[9px] font-semibold border uppercase tracking-wider select-none',
        config.badgeClass,
        className
      )}
    >
      {config.label}
    </span>
  );
}

