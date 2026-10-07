import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantCard, BarsCard, RankedCard, StatsCard } from '@/lib/assistant/types'

function CardShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-border">
      <header className="px-4 pb-2 pt-3">
        <h3 className="text-[13px] font-extrabold tracking-[-0.01em]">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null
  const isUp = value >= 0
  const Icon = isUp ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center text-[11px] font-semibold', isUp ? 'text-emerald-700' : 'text-rose-700')}>
      <Icon className="h-3 w-3" aria-hidden />
      {Math.abs(value)}%
    </span>
  )
}

function StatsView({ card }: { card: StatsCard }) {
  return (
    <CardShell title={card.title} subtitle={card.subtitle}>
      <dl className="grid grid-cols-2 gap-2">
        {card.items.map((item) => (
          <div key={item.label} className="rounded-xl bg-muted/50 px-3 py-2">
            <dt className="text-[11px] font-medium text-muted-foreground">{item.label}</dt>
            <dd className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold tabular-nums">{item.value}</span>
              <Change value={item.change} />
            </dd>
            {item.hint ? <dd className="text-[11px] text-muted-foreground">{item.hint}</dd> : null}
          </div>
        ))}
      </dl>
    </CardShell>
  )
}

function RankedView({ card }: { card: RankedCard }) {
  if (card.rows.length === 0) {
    return (
      <CardShell title={card.title} subtitle={card.subtitle}>
        <p className="text-sm text-muted-foreground">{card.emptyText ?? 'Nothing to show.'}</p>
      </CardShell>
    )
  }
  return (
    <CardShell title={card.title} subtitle={card.subtitle}>
      <ol className="divide-y divide-border">
        {card.rows.map((row, index) => (
          <li key={`${row.label}-${index}`} className="flex items-center gap-3 py-2">
            <span className="w-4 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                <span className="truncate">{row.label}</span>
                {row.badge ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800">{row.badge}</span>
                ) : null}
              </p>
              {row.detail ? <p className="truncate text-[11px] text-muted-foreground">{row.detail}</p> : null}
            </div>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums">{row.value}</span>
          </li>
        ))}
      </ol>
    </CardShell>
  )
}

function BarsView({ card }: { card: BarsCard }) {
  const max = Math.max(1, ...card.bars.map((bar) => bar.value))
  return (
    <CardShell title={card.title} subtitle={card.subtitle}>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={card.title}>
        {card.bars.map((bar) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1" title={`${bar.label}: ${bar.value}`}>
            <div
              className={cn('w-full rounded-t-sm', bar.isHighlight ? 'bg-[#E4572E]' : 'bg-neutral-300')}
              style={{ height: `${Math.max(2, (bar.value / max) * 96)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{card.bars[0]?.label}</span>
        <span>{card.bars[card.bars.length - 1]?.label}</span>
      </div>
    </CardShell>
  )
}

/** Renders a tool's card. Unknown shapes (an older stored message) render nothing rather than crash. */
export function AssistantCardView({ card }: { card: AssistantCard | undefined }) {
  if (!card || typeof card !== 'object') return null
  switch (card.type) {
    case 'stats':
      return Array.isArray(card.items) ? <StatsView card={card} /> : null
    case 'ranked':
      return Array.isArray(card.rows) ? <RankedView card={card} /> : null
    case 'bars':
      return Array.isArray(card.bars) ? <BarsView card={card} /> : null
    // Interactive; rendered by ConfirmCardView, which needs the store context.
    case 'confirm':
      return null
    default:
      return null
  }
}
