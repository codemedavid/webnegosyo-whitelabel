import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { loadReportPage } from '@/lib/reports/read/load-report-context'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { reportHref } from '@/lib/reports/report-links'
import { BREAKDOWN_META, breakdownsFor, isBreakdownSlug, type BreakdownSlug } from '@/lib/reports/report-view-model'
import { TableSkeleton } from '@/components/admin/reports'
import {
  BreakdownTabs,
  ReportFooter,
  ReportHeader,
  ReportNotices,
  ReportPageFrame,
  reportsPath,
} from '@/components/admin/reports/sales/report-page-chrome'
import { ReportRefused, ReportUnsupported } from '@/components/admin/reports/sales/report-states'
import { BranchesBreakdown } from '@/components/admin/reports/sales/breakdowns/branches-breakdown'
import { CategoriesBreakdown } from '@/components/admin/reports/sales/breakdowns/categories-breakdown'
import { ChannelsBreakdown } from '@/components/admin/reports/sales/breakdowns/channels-breakdown'
import { HoursBreakdown } from '@/components/admin/reports/sales/breakdowns/hours-breakdown'
import {
  ItemsBreakdown,
  parseItemsView,
  type ItemsView,
} from '@/components/admin/reports/sales/breakdowns/items-breakdown'
import { PaymentsBreakdown } from '@/components/admin/reports/sales/breakdowns/payments-breakdown'

interface BreakdownPageProps {
  params: Promise<{ tenant: string; dim: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function Breakdown({ slug, context, view }: { slug: BreakdownSlug; context: ReportContext; view: ItemsView }) {
  switch (slug) {
    case 'items':
      return <ItemsBreakdown context={context} view={view} />
    case 'categories':
      return <CategoriesBreakdown context={context} />
    case 'payments':
      return <PaymentsBreakdown context={context} />
    case 'channels':
      return <ChannelsBreakdown context={context} />
    case 'hours':
      return <HoursBreakdown context={context} />
    case 'branches':
      return <BranchesBreakdown context={context} />
  }
}

export default async function BreakdownPage({ params, searchParams }: BreakdownPageProps) {
  const [{ tenant: tenantSlug, dim }, query] = await Promise.all([params, searchParams])
  if (!isBreakdownSlug(dim)) notFound()
  const meta = BREAKDOWN_META[dim]

  const page = await loadReportPage(tenantSlug, query)
  if (page.kind === 'not_found') notFound()
  if (page.kind !== 'ready') {
    return (
      <ReportPageFrame>
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">{meta.title}</h1>
        {page.kind === 'refused' ? (
          <ReportRefused reason={page.reason} />
        ) : (
          <ReportUnsupported tenantSlug={tenantSlug} backend={page.backend} />
        )}
      </ReportPageFrame>
    )
  }

  const { context } = page
  // Branches compares branches: a single-branch store or a branch account has one.
  if (!breakdownsFor({ isMultiBranch: context.isMultiBranch, isBranchLocked: context.isBranchLocked }).includes(dim)) {
    notFound()
  }

  const view = parseItemsView(query.view)
  const pageParams = dim === 'items' && view === 'matrix' ? { view: 'matrix' } : undefined
  const path = reportsPath(context, dim)

  return (
    <ReportPageFrame>
      <ReportHeader
        context={context}
        title={meta.title}
        description={meta.question}
        path={path}
        backHref={reportHref(reportsPath(context), context.filter)}
        pageParams={pageParams}
      />
      <BreakdownTabs context={context} active={dim} />
      <ReportNotices context={context} />
      <Suspense key={reportHref(path, context.filter, pageParams)} fallback={<TableSkeleton />}>
        <Breakdown slug={dim} context={context} view={view} />
      </Suspense>
      <ReportFooter />
    </ReportPageFrame>
  )
}
