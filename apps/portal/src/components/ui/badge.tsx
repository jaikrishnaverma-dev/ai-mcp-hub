import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'success'
    | 'warning'
    | 'critical'
    | 'high'
    | 'medium'
    | 'low'
    | 'todo'
    | 'in_progress'
    | 'blocked'
    | 'done';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground shadow',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground',
    outline: 'text-foreground border-border',
    success: 'border-transparent bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    warning: 'border-transparent bg-amber-500/15 text-amber-400 border border-amber-500/20',
    // Priorities
    critical: 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold',
    high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    medium: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    low: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    // Statuses
    todo: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    in_progress: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    blocked: 'bg-red-500/20 text-red-400 border border-red-500/30 font-medium',
    done: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
