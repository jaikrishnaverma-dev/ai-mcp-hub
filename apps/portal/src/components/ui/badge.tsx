import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils.js"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950",
        secondary:
          "border-transparent bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100",
        destructive:
          "border-transparent bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
        outline:
          "text-zinc-800 border-zinc-200 dark:border-zinc-800 dark:text-zinc-300",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
        warning:
          "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
        // Platform State Standardized Variants
        todo:
          "border-zinc-200/90 bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/60",
        in_progress:
          "border-blue-200/80 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60 shadow-2xs",
        done:
          "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60 shadow-2xs",
        blocked:
          "border-red-200/80 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60 shadow-2xs",
        cancelled:
          "border-zinc-200/60 bg-zinc-100/70 text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-500 dark:border-zinc-800 line-through",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
export * from "./status-badge.js"

