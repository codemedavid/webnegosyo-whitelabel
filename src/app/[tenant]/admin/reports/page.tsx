import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { canSeeProfit } from '@/lib/reports/profit-view'
import { loadReportPage } from '@/lib/reports/read/load-report-context'
import { reportHref } from '@/lib/reports/report-links'
import { ChartSkeleton, KpiRowSkeleton } from '@/components/admin/reports'
import {
  ReportFooter,
  ReportHeader,
  ReportNotices,
  ReportPageFrame,
  reportsPath,
} from '@/components/admin/reports/sales/report-page-chrome'
import { ReportRefused, ReportUnsupported } from '@/components/admin/reports/sales/report-states'
import { ProfitEntryCard } from '@/components/admin/reports/profit/profit-chrome'
import { SalesOverview } from '@/components/admin/reports/sales/sales-overview'

interface SalesReportPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TITLE = 'Sales'
const DESCRIPTION = 'How this period went, and why. Every figure adds up to the one below it.'

export default async function SalesReportPage({ params, searchParams }: SalesReportPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const page = await loadReportPage(tenantSlug, query)

  if (page.kind === 'not_found') notFound()
  if (page.kind !== 'ready') {
    return (
      <ReportPageFrame>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">{TITLE}</h1>
        {page.kind === 'refused' ? (
          <ReportRefused reason={page.reason} />
        ) : (
          <ReportUnsupported tenantSlug={tenantSlug} backend={page.backend} />
        )}
      </ReportPageFrame>
    )
  }

  const { context } = page
  const path = reportsPath(context)
  const { appUser, roleError } = await getRequestCaller()
  const showsProfit = canSeeProfit(roleError ? null : appUser, context.tenantId)
  return (
    <ReportPageFrame>
      <ReportHeader context={context} title={TITLE} description={DESCRIPTION} path={path} />
      <ReportNotices context={context} />
      {/* A new filter is a new key: the skeleton shows instead of stale figures. */}
      <Suspense
        key={reportHref(path, context.filter)}
        fallback={
          <>
            <KpiRowSkeleton />
            <ChartSkeleton />
          </>
        }
      >
        <SalesOverview context={context} />
      </Suspense>
      {showsProfit && <ProfitEntryCard tenantSlug={context.tenantSlug} filter={context.filter} />}
      <ReportFooter />
    </ReportPageFrame>
  )
}
