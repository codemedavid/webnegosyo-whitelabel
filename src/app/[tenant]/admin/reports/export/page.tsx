import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { exportCardGroups, parseSheetsParam } from '@/lib/exports/export-page-model'
import type { ExportRequest } from '@/lib/exports/request-schema'
import { loadReportPage } from '@/lib/reports/read/load-report-context'
import { reportHref } from '@/lib/reports/report-links'
import { hasPermission } from '@/lib/staff-permissions'
import { CoverageNote } from '@/components/admin/reports'
import { ReportFilters } from '@/components/admin/reports/report-filters'
import { ExportBuilder } from '@/components/admin/reports/export/export-builder'
import { RecentExports } from '@/components/admin/reports/export/recent-exports'
import { ReportFooter, ReportPageFrame, reportsPath } from '@/components/admin/reports/sales/report-page-chrome'
import { ReportRefused, ReportUnsupported } from '@/components/admin/reports/sales/report-states'

interface ExportPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TITLE = 'Export'
const HEADING = 'text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]'

export default async function ExportPage({ params, searchParams }: ExportPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const page = await loadReportPage(tenantSlug, query)

  if (page.kind === 'not_found') notFound()
  if (page.kind !== 'ready') {
    return (
      <ReportPageFrame>
        <h1 className={HEADING}>{TITLE}</h1>
        {page.kind === 'refused' ? <ReportRefused reason={page.reason} /> : <ReportUnsupported tenantSlug={tenantSlug} backend={page.backend} />}
      </ReportPageFrame>
    )
  }

  const { context } = page
  const { appUser, roleError } = await getRequestCaller()
  // Fail closed: an account that could not be read holds no key, so every extra sheet stays locked.
  const caller = roleError ? null : appUser
  const groups = exportCardGroups({ has: (key) => (caller ? hasPermission(caller, key) : false) }, context.isMultiBranch)
  const { preset, from, to, branch } = context.filter
  const period: ExportRequest['period'] = preset === 'custom' && from && to ? { preset, from, to } : { preset: context.period.preset }
  const path = `${reportsPath(context)}/export`

  return (
    <ReportPageFrame>
      <header className="flex flex-col gap-4">
        <div className="min-w-0">
          <Link
            href={reportHref(reportsPath(context), context.filter)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-[13px] font-bold text-muted-foreground outline-none transition-colors hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Sales
          </Link>
          <h1 className={`mt-1 ${HEADING}`}>{TITLE}</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-snug text-muted-foreground text-pretty">
            Take your figures out as an Excel or CSV file. Pick the dates, tick what you want, check it, download.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-wn-ink text-[12.5px] font-extrabold text-white">1</span>
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-wn-ink">Which dates</h2>
            <p className="text-[13px] text-muted-foreground">Pick “Custom” for any range.</p>
          </div>
          <ReportFilters
            path={path}
            presets={context.presets}
            value={{ ...context.filter, compare: false }}
            branches={context.branchOptions}
            isBranchLocked={context.isBranchLocked}
            lockedBranchLabel={context.lockedBranchLabel}
            today={context.today}
            hasCompare={false}
          />
          <p className="text-[13px] font-medium text-muted-foreground tabular-nums">
            {context.period.from === context.period.to ? context.period.from : `${context.period.from} to ${context.period.to}`}
            {context.period.isPartial ? ' · so far' : ''}
          </p>
        </div>
      </header>
      {context.isMixedBackend && (
        <CoverageNote tone="info">
          Exports read orders saved in WebNegosyo’s main database. Orders your store took on its earlier real-time system are not included.
        </CoverageNote>
      )}
      <ExportBuilder
        tenantId={context.tenantId}
        groups={groups}
        askedSheets={parseSheetsParam(query.sheets)}
        period={period}
        periodFrom={context.period.from}
        periodTo={context.period.to}
        branch={branch}
        periodError={context.periodError}
      />
      <Suspense fallback={null}>
        <RecentExports tenantId={context.tenantId} />
      </Suspense>
      <ReportFooter />
    </ReportPageFrame>
  )
}
