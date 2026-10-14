import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/reports/format'
import { UNPAID_PATTERN, categoryColor } from './report-colors'

export interface SharePart {
  key: string
  label: string
  /** Centavos. */
  cents: number
}

export interface ShareBarProps {
  parts: SharePart[]
  /** Sales not yet paid, shown as its own hatched grey segment. */
  unpaidCents?: number
  /** Read before the legend: "How customers paid". */
  label?: string
  emptyMessage?: string
  className?: string
}

/**
 * Whole percents that always add up to exactly 100 (largest remainder), so
 * a legend never reads 33% + 33% + 33%. All zero → all zero.
 */
export function sharePercents(values: number[]): number[] {
  const safe = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0))
  const total = safe.reduce((sum, value) => sum + value, 0)
  if (total === 0) return safe.map(() => 0)
  const exact = safe.map((value) => (value / total) * 100)
  const floors = exact.map(Math.floor)
  const shortfall = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  const bumped = new Set(order.slice(0, shortfall).map((entry) => entry.index))
  return floors.map((value, index) => (bumped.has(index) ? value + 1 : value))
}

interface Segment {
  key: string
  label: string
  cents: number
  percent: number
  background: string
  isUnpaid: boolean
}

function toSegments(parts: SharePart[], unpaidCents: number): Segment[] {
  const all = unpaidCents > 0 ? [...parts, { key: '__unpaid', label: 'Unpaid', cents: unpaidCents }] : parts
  const percents = sharePercents(all.map((part) => part.cents))
  return all.map((part, index) => {
    const isUnpaid = part.key === '__unpaid' && index === parts.length
    return {
      key: part.key,
      label: part.label,
      cents: part.cents,
      percent: percents[index],
      background: isUnpaid ? UNPAID_PATTERN : categoryColor(index),
      isUnpaid,
    }
  })
}

/**
 * One 100% stacked bar for how a period was paid. The bar is decoration; the
 * legend underneath (label · amount · %) carries every number. Unpaid is a
 * hatched grey segment with its own label, never coloured like a method.
 */
export function ShareBar({
  parts,
  unpaidCents = 0,
  label = 'Share of sales',
  emptyMessage = 'No payments in this period.',
  className,
}: ShareBarProps) {
  const segments = toSegments(parts, unpaidCents)
  const hasAny = segments.some((segment) => segment.cents > 0)

  if (!hasAny) {
    return (
      <p className={cn('rounded-xl bg-wn-sand px-4 py-6 text-center text-[14px] text-muted-foreground', className)}>
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div aria-hidden className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-white">
        {segments
          .filter((segment) => segment.cents > 0)
          .map((segment) => (
            <div
              key={segment.key}
              data-testid={`share-segment-${segment.key}`}
              className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: segment.cents, flexBasis: 0, background: segment.background }}
            />
          ))}
      </div>
      <ul aria-label={label} className="grid gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.key} data-unpaid={segment.isUnpaid || undefined} className="flex items-center gap-2.5">
            <span aria-hidden className="size-3 shrink-0 rounded-[3px]" style={{ background: segment.background }} />
            <span className={cn('min-w-0 flex-1 truncate', segment.isUnpaid ? 'text-wn-stone' : 'text-foreground')}>
              {segment.label}
            </span>
            <span className="font-semibold tabular-nums lining-nums">{formatMoney(segment.cents)}</span>
            <span className="w-11 text-right text-wn-stone tabular-nums lining-nums">{segment.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
