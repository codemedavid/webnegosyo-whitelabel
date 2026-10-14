import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { UNKNOWN_FIGURE, formatMoney } from '@/lib/reports/format'

interface KpiTileBaseProps {
  /** "Net sales". */
  label: string
  /** Usually a <DeltaPill />. */
  delta?: ReactNode
  /** Usually a <MetricInfo />, shown beside the label. */
  info?: ReactNode
  /** One short muted line under the value: "128 orders". */
  hint?: string
  /** A refetch is in flight: keep the old figure, dimmed. */
  isStale?: boolean
  className?: string
}

interface MoneyValue {
  /** Centavos. `null` = unknown → "—". */
  valueCents: number | null
  value?: never
}

interface TextValue {
  /** Already formatted ("128", "34%"). `null` = unknown → "—". */
  value: string | null
  valueCents?: never
}

export type KpiTileProps = KpiTileBaseProps & (MoneyValue | TextValue)

/** One headline number. Hierarchy comes from type, not colour (plan §4). */
export function KpiTile({ label, valueCents, value, delta, info, hint, isStale = false, className }: KpiTileProps) {
  const text = valueCents !== undefined ? formatMoney(valueCents) : (value ?? UNKNOWN_FIGURE)
  return (
    <div
      aria-busy={isStale || undefined}
      data-stale={isStale || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-2xl bg-white p-4 ring-1 ring-border transition-opacity duration-150 motion-reduce:transition-none sm:p-5',
        isStale && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="truncate text-[13px] font-semibold text-muted-foreground">{label}</p>
        {info}
      </div>
      <p className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-wn-ink tabular-nums lining-nums sm:text-[32px]">
        {text}
      </p>
      {(delta || hint) && (
        <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          {delta}
          {hint && <p className="text-[12.5px] text-muted-foreground tabular-nums">{hint}</p>}
        </div>
      )}
    </div>
  )
}
