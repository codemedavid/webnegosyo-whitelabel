import Link from 'next/link'
import { ChevronRight, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney, formatRatio } from '@/lib/reports/format'
import type { ExpenseCategoryTotal } from '@/lib/reports/profit-facts'
import { PRIME_COST_BAND, type ProfitReport } from '@/lib/reports/profit-model'
import type { FindingCopy } from '@/lib/reports/profit-view'
import { KpiTile } from '../kpi-tile'
import { MetricInfo } from '../metric-info'

/** What to fix before believing the number. Shown only when something is off. */
export function ProfitTrustStrip({ findings }: { findings: readonly FindingCopy[] }) {
  if (findings.length === 0) return null
  return (
    <ul aria-label="Before you trust this number" className="flex flex-col gap-2">
      {findings.map((finding) => {
        const isWarning = finding.tone === 'warning'
        const Icon = isWarning ? TriangleAlert : Info
        return (
          <li
            key={finding.key}
            data-tone={finding.tone}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug ring-1',
              isWarning ? 'bg-amber-50 text-amber-950 ring-amber-200' : 'bg-wn-sand text-wn-ink ring-wn-line',
            )}
          >
            <Icon className={cn('size-4 shrink-0', isWarning ? 'text-amber-700' : 'text-wn-stone')} aria-hidden />
            <span className="min-w-0 flex-1 tabular-nums">{finding.text}</span>
            {finding.action && (
              <Link
                href={finding.action.href}
                className="inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-[13.5px] font-bold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {finding.action.label}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Ingredients + Staff as a share of sales, against the band most food businesses land in. */
export function PrimeCostBar({ report }: { report: ProfitReport }) {
  const prime = report.ratios.prime
  if (prime === null) return null
  const fill = Math.min(Math.max(prime, 0), 1) * 100
  const low = PRIME_COST_BAND.low * 100
  const high = PRIME_COST_BAND.high * 100
  return (
    <section aria-label="Ingredients and staff" className="rounded-2xl bg-white p-4 ring-1 ring-border sm:p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-[14px] font-semibold text-wn-ink tabular-nums">
          Ingredients + Staff = {formatRatio(prime)} of sales
        </p>
        <MetricInfo
          term="Prime cost"
          definition="What food and people cost together. Most food businesses land between 55% and 65% of sales; above that, profit gets thin."
          formula="(Ingredients + Staff) ÷ Sales"
        />
      </div>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Most cafés and restaurants land at 55–65%.</p>
      <div
        role="meter"
        aria-label="Ingredients and staff as a share of sales"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(prime * 100)}
        aria-valuetext={`${formatRatio(prime)} of sales; most land at 55 to 65%`}
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-wn-sand ring-1 ring-wn-line"
      >
        <span aria-hidden className="absolute inset-y-0 bg-emerald-100" style={{ left: `${low}%`, width: `${high - low}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-wn-ink" style={{ width: `${fill}%` }} />
      </div>
    </section>
  )
}

/** Food, staff and rent as shares of sales. */
export function ProfitRatios({ report }: { report: ProfitReport }) {
  const tiles = [
    { key: 'food', label: 'Ingredients', value: report.ratios.food, info: 'Ingredient cost ÷ sales.' },
    { key: 'staff', label: 'Staff', value: report.ratios.staff, info: 'Salaries, contributions, staff meals and 13th month ÷ sales.' },
    { key: 'rent', label: 'Rent', value: report.ratios.rent, info: 'Rent ÷ sales.' },
  ] as const
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
      {tiles.map((tile, index) => (
        <KpiTile
          key={tile.key}
          label={`${tile.label} %`}
          value={tile.value === null ? null : formatRatio(tile.value)}
          info={<MetricInfo term={`${tile.label} %`} definition={tile.info} align={index === 2 ? 'end' : 'start'} />}
        />
      ))}
    </div>
  )
}

const SHOWN_CATEGORIES = 6

interface MoneyRow {
  key: string
  label: string
  icon: string | null
  cents: number
  href: string | null
}

function rowsOf(categories: readonly ExpenseCategoryTotal[], expensesHref: string): MoneyRow[] {
  const shown = categories.slice(0, SHOWN_CATEGORIES).map((row) => ({
    key: row.categoryId,
    label: row.name,
    icon: row.icon,
    cents: row.cents,
    href: `${expensesHref}?category=${encodeURIComponent(row.categoryId)}`,
  }))
  const rest = categories.slice(SHOWN_CATEGORIES)
  if (rest.length === 0) return shown
  return [
    ...shown,
    { key: 'rest', label: `Other ${rest.length}`, icon: null, cents: rest.reduce((sum, row) => sum + row.cents, 0), href: expensesHref },
  ]
}

/** Expenses by category, largest first, as bars (no pie). Each row opens the expense book. */
export function MoneyWentList({ categories, expensesHref }: { categories: readonly ExpenseCategoryTotal[]; expensesHref: string }) {
  if (categories.length === 0) {
    return <p className="text-[13.5px] text-muted-foreground">No expenses recorded for this period.</p>
  }
  const rows = rowsOf(categories, expensesHref)
  const largest = Math.max(...rows.map((row) => row.cents), 1)
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((row) => {
        const width = `${Math.max((row.cents / largest) * 100, 2)}%`
        const content = (
          <>
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-wn-sand text-[11px] font-bold text-wn-stone">
              {row.icon ?? row.label.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[13.5px] font-semibold text-wn-ink">{row.label}</span>
              <span aria-hidden className="block h-1.5 rounded-full bg-wn-ink/75" style={{ width }} />
            </span>
            <span className="shrink-0 text-[14px] font-bold text-wn-ink tabular-nums">{formatMoney(row.cents)}</span>
          </>
        )
        return (
          <li key={row.key}>
            {row.href ? (
              <Link
                href={row.href}
                className="flex min-h-12 items-center gap-3 rounded-lg px-1 py-1.5 outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {content}
              </Link>
            ) : (
              <div className="flex min-h-12 items-center gap-3 px-1 py-1.5">{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
