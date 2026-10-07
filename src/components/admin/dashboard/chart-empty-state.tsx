import { cn } from '@/lib/utils'

interface ChartEmptyStateProps {
  title: string
  hint?: string
  className?: string
}

/**
 * Stands in for a chart with nothing to plot — a flat zero line on a made-up
 * ₱0–₱4 axis reads as broken, not as "quiet day".
 */
export function ChartEmptyState({ title, hint, className }: ChartEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-wn-sand px-6 text-center',
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
