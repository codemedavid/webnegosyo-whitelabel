import type { GovFlag, GovFlagSeverity } from '@/lib/gov-discount'
import { visibleFlags } from '@/lib/gov-discount-reports/review-queue'
import { cn } from '@/lib/utils'

const SEVERITY_STYLES: Readonly<Record<GovFlagSeverity, string>> = {
  high: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  medium: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  low: 'border-border bg-muted/50 text-muted-foreground',
}

export interface GovFlagChipsProps {
  flags: readonly GovFlag[]
  /** Show at most this many chips, then "+N". */
  limit?: number
  className?: string
}

/** The engine's own words for each flag, coloured by how much it matters. */
export function GovFlagChips({ flags, limit, className }: GovFlagChipsProps) {
  if (flags.length === 0) return null
  const chips = visibleFlags(flags)
  const shown = limit === undefined ? chips : chips.slice(0, limit)
  const hidden = chips.length - shown.length

  return (
    <ul className={cn('flex flex-wrap gap-1', className)} aria-label="Flags">
      {shown.map((chip) => (
        <li
          key={chip.flag}
          title={chip.explain}
          className={cn(
            'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
            SEVERITY_STYLES[chip.severity],
          )}
        >
          {chip.label}
        </li>
      ))}
      {hidden > 0 && (
        <li className="inline-flex items-center px-1 text-[11px] text-muted-foreground">+{hidden} more</li>
      )}
    </ul>
  )
}
