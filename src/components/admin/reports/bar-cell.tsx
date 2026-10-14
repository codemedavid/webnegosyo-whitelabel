import { cn } from '@/lib/utils'
import { SERIES_CURRENT } from './report-colors'

export interface BarCellProps {
  value: number
  /** The largest value in the column: its bar fills the track. */
  max: number
  /** The formatted number shown beside the bar ("₱12,300"). */
  label: string
  className?: string
}

/** Share of the column's largest value, clamped to 0..1. */
export function barFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0
  return Math.min(1, value / max)
}

/** A ranked bar inside a table cell. The bar is decoration; the number is the content. */
export function BarCell({ value, max, label, className }: BarCellProps) {
  const fraction = barFraction(value, max)
  return (
    <div className={cn('flex min-w-[8rem] items-center justify-end gap-2.5', className)}>
      <div aria-hidden className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-wn-canvas">
        <div
          data-testid="bar-cell-fill"
          className="h-full rounded-full"
          style={{ width: `${(fraction * 100).toFixed(1)}%`, backgroundColor: SERIES_CURRENT }}
        />
      </div>
      <span className="shrink-0 text-right tabular-nums lining-nums">{label}</span>
    </div>
  )
}
