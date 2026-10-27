import Link from 'next/link'
import { formatMoney } from '@/lib/reports/format'
import { bucketKeys, bucketLabel } from '@/lib/reports/period'
import type { ProfitPeriodFigures } from '@/lib/reports/profit-facts'
import { buildProfitReport, profitTrend, type ProfitReport } from '@/lib/reports/profit-model'
import {
  expensesBookHref,
  expensesLinkFor,
  findingCopy,
  isIncompleteBucket,
  previousFullWindow,
  profitGrainFor,
  type ProfitView,
} from '@/lib/reports/profit-view'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { readExpenseCategories, readProfitPeriods, readProfitSummary, type ReportResult } from '@/lib/reports/read/report-rpc'
import { reportClient } from '@/lib/reports/read/load-report-context'
import { ReportSection } from '../report-section'
import { CashFlowPanel } from './cash-flow-panel'
import { MoneyWentList, PrimeCostBar, ProfitRatios, ProfitTrustStrip } from './profit-insights'
import { ProfitSentenceCard } from './profit-sentence-card'
import { ProfitTrendChart, type ProfitTrendBucket } from './profit-trend-chart'

function dataOrNull<T>(result: ReportResult<T> | null): T | null {
  return result && result.ok ? result.data : null
}

function captionOf(context: ReportContext): string {
  const { period } = context
  const when = `${period.label}${period.isPartial ? ' so far' : ''}`
  const where =
    context.lockedBranchLabel ??
    (context.branch.branch === null ? 'all branches' : (context.outletNames.get(context.branch.branch) ?? 'Unassigned and store-wide'))
  return context.isMultiBranch || context.isBranchLocked ? `${when} · ${where}` : when
}

function trendBuckets(context: ReportContext, rows: readonly ProfitPeriodFigures[], report: ProfitReport): ProfitTrendBucket[] {
  const { period, schedule } = context
  const grain = profitGrainFor(period.grain)
  // Business-day buckets, as report_profit_by_period dates every fact since
  // 20261027180000; a different schedule here would drop bars.
  const keys = bucketKeys(period.start, period.end, grain, schedule)
  return profitTrend(keys, rows, report.ingredientBasis).map((point, index) => ({
    key: point.bucket,
    label: bucketLabel(point.bucket, grain),
    netSalesCents: point.netSalesCents,
    profitCents: point.profitCents,
    isIncomplete: isIncompleteBucket(keys, index, period),
  }))
}

function trendSentence(buckets: readonly ProfitTrendBucket[]): string {
  if (buckets.length === 0) return 'No periods to show.'
  const best = buckets.reduce((top, bucket) => (bucket.profitCents > top.profitCents ? bucket : top))
  return `Sales and profit for ${buckets.length} periods. Best: ${best.label}, ${formatMoney(best.profitCents)} profit.`
}

function FirstRun({ addHref }: { addHref: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-border">
      <p className="text-[15px] font-bold text-wn-ink">Profit = Sales − Ingredients − Expenses</p>
      <p className="mt-1 max-w-xl text-[13.5px] leading-snug text-muted-foreground">
        We already know your sales. Add your first expense and we’ll do the math. Kung may binayaran ka, idagdag dito.
      </p>
      <Link
        href={addHref}
        className="mt-4 inline-flex min-h-11 items-center rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Add expense
      </Link>
    </div>
  )
}

/** Profit view and Cash flow view (expense plan §5.3). Every read uses the caller's session. */
export async function ProfitOverview({ context, view }: { context: ReportContext; view: ProfitView }) {
  const client = await reportClient()
  const window = context.windows.current
  const previous = previousFullWindow(context.period, context.schedule)
  const isProfitView = view === 'profit'
  const [summary, categories, previousCategories, periods] = await Promise.all([
    readProfitSummary(client, window),
    readExpenseCategories(client, window),
    isProfitView && previous ? readExpenseCategories(client, { ...window, ...previous }) : Promise.resolve(null),
    isProfitView ? readProfitPeriods(client, window, profitGrainFor(context.period.grain)) : Promise.resolve(null),
  ])

  if (!summary.ok || !categories.ok) {
    const error = !summary.ok ? summary.error : !categories.ok ? categories.error : null
    return <ReportSection title="Profit" isError errorMessage={error?.message} />
  }

  const report = buildProfitReport({
    figures: summary.data,
    categories: categories.data,
    previousCategories: dataOrNull(previousCategories),
  })
  const adminBase = `/${context.tenantSlug}/admin`
  const expensesLink = expensesLinkFor(context.period)
  const periodPhrase = context.period.isPartial ? `${context.period.phrase} yet` : context.period.phrase
  const findings = report.findings.map((finding) => findingCopy(finding, { adminBase, periodPhrase, expenses: expensesLink }))

  if (!isProfitView) {
    return <CashFlowPanel cashFlow={report.cashFlow} />
  }

  const periodRows = dataOrNull(periods)
  const buckets = periodRows ? trendBuckets(context, periodRows, report) : []
  return (
    <>
      {summary.data.expenseCount === 0 && <FirstRun addHref={expensesBookHref(adminBase, expensesLink, { add: '1', on: expensesLink.recordOn })} />}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <ProfitSentenceCard report={report} caption={captionOf(context)} />
          <ProfitTrustStrip findings={findings} />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-2">
          <PrimeCostBar report={report} />
          <ProfitRatios report={report} />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <ReportSection title="Where the money went" description="Expenses by category, largest first." className="lg:col-span-2">
          <MoneyWentList categories={report.byCategory} adminBase={adminBase} expensesLink={expensesLink} />
        </ReportSection>
        <ReportSection
          title="Sales and profit over time"
          description="Sales as a line, profit as bars. The period still running is drawn hollow."
          isError={periods !== null && !periods.ok}
          errorMessage={periods && !periods.ok ? periods.error.message : undefined}
          className="lg:col-span-3"
        >
          {periodRows && <ProfitTrendChart buckets={buckets} summary={trendSentence(buckets)} />}
        </ReportSection>
      </div>
    </>
  )
}
