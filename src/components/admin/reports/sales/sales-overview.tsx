import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatCount, formatMoney } from '@/lib/reports/format'
import { buildSalesInsight } from '@/lib/reports/insights'
import { METRIC_GLOSSARY, type MetricKey } from '@/lib/reports/metric-glossary'
import { bucketKeys } from '@/lib/reports/period'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { readPeriods, readTotals, type ReportResult } from '@/lib/reports/read/report-rpc'
import type { SalesTotals } from '@/lib/reports/read/report-rpc-rows'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { reportHref } from '@/lib/reports/report-links'
import {
  BREAKDOWN_META,
  alignTrend,
  breakdownsFor,
  insightBuckets,
  trendSummary,
} from '@/lib/reports/report-view-model'
import type { PeriodRow } from '@/lib/reports/sales-breakdowns'
import { DeltaPill, type DeltaKind } from '../delta-pill'
import { InsightCard } from '../insight-card'
import { KpiTile } from '../kpi-tile'
import { MetricInfo } from '../metric-info'
import { ReportSection } from '../report-section'
import { TrendChart } from '../trend-chart'
import { reportsPath } from './report-page-chrome'
import { TotalsLedger } from './totals-ledger'

function dataOrNull<T>(result: ReportResult<T> | null): T | null {
  return result && result.ok ? result.data : null
}

function info(key: MetricKey, align: 'start' | 'end' = 'start') {
  const entry = METRIC_GLOSSARY[key]
  return <MetricInfo term={entry.term} definition={entry.definition} formula={entry.formula} align={align} />
}

interface KpiSpec {
  key: MetricKey
  current: number | null
  previous: number | null
  kind: DeltaKind
  hint?: string
}

function Kpis({ context, totals, previous }: { context: ReportContext; totals: SalesTotals; previous: SalesTotals | null }) {
  const compareLabel = context.compare?.phrase
  const specs: KpiSpec[] = [
    { key: 'net', current: totals.netCents, previous: previous?.netCents ?? null, kind: 'money' },
    { key: 'orders', current: totals.orders, previous: previous?.orders ?? null, kind: 'count' },
    { key: 'aov', current: totals.aovCents, previous: previous?.aovCents ?? null, kind: 'money' },
    {
      key: 'collected',
      current: totals.collectedCents,
      previous: previous?.collectedCents ?? null,
      kind: 'money',
      hint: totals.unpaidCents > 0 ? `${formatMoney(totals.unpaidCents)} still unpaid` : 'Nothing unpaid',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {specs.map((spec, index) => {
        const entry = METRIC_GLOSSARY[spec.key]
        const delta = context.compare ? (
          <DeltaPill current={spec.current} previous={spec.previous} polarity="higher_is_better" kind={spec.kind} compareLabel={compareLabel} />
        ) : undefined
        const shared = { label: entry.term, info: info(spec.key, index % 2 === 1 ? 'end' : 'start'), delta, hint: spec.hint }
        return spec.kind === 'money' ? (
          <KpiTile key={spec.key} {...shared} valueCents={spec.current} />
        ) : (
          <KpiTile key={spec.key} {...shared} value={spec.current === null ? null : formatCount(spec.current)} />
        )
      })}
    </div>
  )
}

function BreakItDown({ context }: { context: ReportContext }) {
  const slugs = breakdownsFor({ isMultiBranch: context.isMultiBranch, isBranchLocked: context.isBranchLocked })
  return (
    <ul className="-my-1 divide-y divide-wn-line">
      {slugs.map((slug) => (
        <li key={slug}>
          <Link
            href={reportHref(reportsPath(context, slug), context.filter)}
            className="group flex min-h-14 items-center gap-3 rounded-lg py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold text-wn-ink">{BREAKDOWN_META[slug].title}</span>
              <span className="block text-[13px] leading-snug text-muted-foreground">{BREAKDOWN_META[slug].question}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Trend({ context, current, previous }: { context: ReportContext; current: PeriodRow[]; previous: PeriodRow[] | null }) {
  const { period, compare, schedule } = context
  // Same business-day buckets as report_sales_by_period (20261027140000).
  const points = alignTrend({
    grain: period.grain,
    currentKeys: bucketKeys(period.start, period.end, period.grain, schedule),
    current,
    previousKeys: compare && previous ? bucketKeys(compare.start, compare.end, period.grain, schedule) : null,
    previous: compare ? previous : null,
  })
  const seriesLabel = METRIC_GLOSSARY.net.term
  const compareLabel = compare && previous ? compare.label.charAt(0).toUpperCase() + compare.label.slice(1) : undefined
  return <TrendChart buckets={points} seriesLabel={seriesLabel} compareLabel={compareLabel} summary={trendSummary(points, seriesLabel)} />
}

/** "How did this period go, and why?" (plan §3.2). */
export async function SalesOverview({ context }: { context: ReportContext }) {
  const client = await reportClient()
  const { current, previous } = context.windows
  const grain = context.period.grain
  const [totals, previousTotals, periods, previousPeriods] = await Promise.all([
    readTotals(client, current),
    previous ? readTotals(client, previous) : Promise.resolve(null),
    readPeriods(client, current, grain),
    previous ? readPeriods(client, previous, grain) : Promise.resolve(null),
  ])

  const periodRows = dataOrNull(periods)
  const before = dataOrNull(previousTotals)
  const itemsHref = reportHref(reportsPath(context, 'items'), context.filter)

  return (
    <>
      {totals.ok ? (
        <>
          <InsightCard
            {...buildSalesInsight({
              period: context.period,
              compare: context.compare && before ? context.compare : null,
              current: { netCents: totals.data.netCents, orders: totals.data.orders },
              previous: before ? { netCents: before.netCents, orders: before.orders } : null,
              buckets: periodRows ? insightBuckets(periodRows, grain) : [],
            })}
            action={
              totals.data.orders > 0 ? (
                <Link
                  href={itemsHref}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-wn-ink px-4 text-[13.5px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  See what sold
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : undefined
            }
          />
          <Kpis context={context} totals={totals.data} previous={before} />
        </>
      ) : (
        <ReportSection title="This period" isError errorMessage={totals.error.message} />
      )}

      <ReportSection
        title="Sales over time"
        description={context.compare ? `Net sales, with ${context.compare.label} as a dashed line.` : 'Net sales.'}
        isError={!periods.ok}
        errorMessage={periods.ok ? undefined : periods.error.message}
      >
        {periodRows && <Trend context={context} current={periodRows} previous={dataOrNull(previousPeriods)} />}
      </ReportSection>

      <div className="grid gap-5 lg:grid-cols-5">
        <ReportSection title="Break it down" description="Every breakdown keeps this period and branch." className="lg:col-span-2">
          <BreakItDown context={context} />
        </ReportSection>
        <ReportSection
          title="Totals"
          description="How sales become what was billed and what came in."
          isError={!totals.ok}
          errorMessage={totals.ok ? undefined : totals.error.message}
          className="lg:col-span-3"
        >
          {totals.ok && <TotalsLedger totals={totals.data} />}
        </ReportSection>
      </div>
    </>
  )
}
