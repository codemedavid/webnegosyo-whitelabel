import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { canSeeProfit, parseProfitView } from '@/lib/reports/profit-view'
import { loadReportPage } from '@/lib/reports/read/load-report-context'
import { reportHref } from '@/lib/reports/report-links'
import { ChartSkeleton, KpiRowSkeleton } from '@/components/admin/reports'
import { ProfitLocked, ProfitTabs, profitPath } from '@/components/admin/reports/profit/profit-chrome'
import { ProfitOverview } from '@/components/admin/reports/profit/profit-overview'
import {
  ReportFooter,
  ReportHeader,
  ReportNotices,
  ReportPageFrame,
  reportsPath,
} from '@/components/admin/reports/sales/report-page-chrome'
import { ReportRefused, ReportUnsupported } from '@/components/admin/reports/sales/report-states'

interface ProfitPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TITLE = 'Profit'
const DESCRIPTION = 'What you kept: sales, minus what the food cost, minus everything else you paid for.'

function Title() {
  return <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">{TITLE}</h1>
}

/**
 * Profit (expense plan §5.3). A static segment, so it wins over `[dim]`.
 * The report context decides reports access, period and branch; this page
 * re-checks Expenses + Costs, and the database refuses the same callers
 * (reporting.assert_profit_access), so the page is not the boundary.
 */
export default async function ProfitPage({ params, searchParams }: ProfitPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const page = await loadReportPage(tenantSlug, query)

  if (page.kind === 'not_found') notFound()
  if (page.kind !== 'ready') {
    return (
      <ReportPageFrame>
        <Title />
        {page.kind === 'refused' ? <ReportRefused reason={page.reason} /> : <ReportUnsupported tenantSlug={tenantSlug} backend={page.backend} />}
      </ReportPageFrame>
    )
  }

  const { context } = page
  const { appUser, roleError } = await getRequestCaller()
  // Fail closed: an errored account read is no account.
  if (!canSeeProfit(roleError ? null : appUser, context.tenantId)) {
    return (
      <ReportPageFrame>
        <Title />
        <ProfitLocked />
      </ReportPageFrame>
    )
  }

  const view = parseProfitView(query.view)
  const pageParams = view === 'cash' ? { view: 'cash' } : undefined
  const path = profitPath(tenantSlug)
  return (
    <ReportPageFrame>
      <ReportHeader
        context={context}
        title={TITLE}
        description={DESCRIPTION}
        path={path}
        backHref={reportHref(reportsPath(context), context.filter)}
        pageParams={pageParams}
      />
      <ProfitTabs tenantSlug={tenantSlug} filter={context.filter} active={view} />
      <ReportNotices context={context} />
      <Suspense
        key={reportHref(path, context.filter, pageParams)}
        fallback={
          <>
            <KpiRowSkeleton />
            <ChartSkeleton />
          </>
        }
      >
        <ProfitOverview context={context} view={view} />
      </Suspense>
      <ReportFooter />
    </ReportPageFrame>
  )
}
