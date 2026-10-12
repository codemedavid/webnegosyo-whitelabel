import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { GovBreakdown, GovOverview } from '@/components/admin/gov-discounts/gov-overview'
import { GovEmptyState } from '@/components/admin/gov-discounts/gov-empty-state'
import { GovExportsCard } from '@/components/admin/gov-discounts/gov-exports-card'
import { GovLedgerWorkspace } from '@/components/admin/gov-discounts/gov-ledger-workspace'
import { GovPeriodPicker } from '@/components/admin/gov-discounts/gov-period-picker'
import { getCachedCurrentUserRole, getCachedTenantBySlug } from '@/lib/cache'
import { hasPermission } from '@/lib/staff-permissions'
import { createClient } from '@/lib/supabase/server'
import { loadLedgerPageData, type LedgerPageData } from '@/lib/gov-discount-reports/load-ledger'
import { resolveReportPeriod } from '@/lib/gov-discount-reports/period'
import { buildGovDiscountReport } from '@/lib/gov-discount-reports/report'

interface GovDiscountsPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}

function LoadError() {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
      <p className="font-medium">We couldn&apos;t load your Senior/PWD sales book.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Your records are safe — this is a problem reading them, not missing data. Please refresh, and contact
        support if it keeps happening.
      </p>
    </div>
  )
}

/**
 * Senior & PWD: what the government-mandated discounts cost this period, the
 * grants worth a second look, every grant with its review history, and the
 * sales books the accountant files.
 *
 * Read with the caller's session, so RLS decides what appears: owners and
 * `discount_review` holders, a branch-locked reviewer for their own branch.
 * Middleware already gates the route on `discount_review`; the check below
 * does not depend on which request path reached the render.
 */
export default async function GovDiscountsPage({ params, searchParams }: GovDiscountsPageProps) {
  const { tenant: tenantSlug } = await params
  const query = await searchParams

  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) return <div>Tenant not found</div>

  const caller = await getCachedCurrentUserRole()
  if (!caller || !hasPermission(caller, 'discount_review')) notFound()

  const nowMs = Date.now()
  const period = resolveReportPeriod(query, nowMs)
  const basePath = `/${tenantSlug}/admin/gov-discounts`

  let data: LedgerPageData | null = null
  try {
    data = await loadLedgerPageData(await createClient(), tenant.id, period, nowMs)
  } catch (error) {
    console.error('[gov-discounts] ledger unavailable', error instanceof Error ? error.message : error)
  }

  const header = (
    <>
      <Breadcrumbs items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Senior & PWD' }]} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold">Senior &amp; PWD</h1>
          <p className="text-muted-foreground">
            The Senior Citizen and PWD discounts your store gave, the ones worth a second look, and the sales
            books for your accountant.
          </p>
        </div>
        {data?.hasAnyClaims !== false && <GovPeriodPicker basePath={basePath} period={period} />}
      </div>
    </>
  )

  if (data === null) {
    return (
      <div className="space-y-6">
        {header}
        <LoadError />
      </div>
    )
  }

  if (!data.hasAnyClaims) {
    return (
      <div className="space-y-6">
        {header}
        <GovEmptyState tenantSlug={tenantSlug} />
      </div>
    )
  }

  const report = buildGovDiscountReport(data)
  const branchOutlets = data.outlets.length > 1 ? data.outlets : []

  return (
    <div className="space-y-6">
      {header}

      {data.isTruncated && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          This period has more records than one page can add up, so the figures below are incomplete. Choose a
          shorter period.
        </p>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{period.label}</h2>
        <GovOverview totals={report.totals} reversedCount={report.reversedCount} periodLabel={period.label} />
      </div>

      <div className={`grid gap-4 ${report.byBranch ? 'lg:grid-cols-3' : 'md:grid-cols-2'}`}>
        <GovBreakdown
          testId="gov-by-kind"
          title="By type"
          description="Total taken off per kind of discount."
          groups={report.byKind}
        />
        <GovBreakdown
          testId="gov-by-cashier"
          title="By cashier"
          description="Who gave the discounts."
          groups={report.byCashier}
        />
        {report.byBranch && (
          <GovBreakdown
            testId="gov-by-branch"
            title="By branch"
            description="Where they were given."
            groups={report.byBranch}
          />
        )}
      </div>

      <GovLedgerWorkspace
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        grants={report.grants}
        grantCount={report.grantCount}
        needsALook={report.needsALook}
        kinds={report.kinds}
        outlets={branchOutlets}
      />

      <GovExportsCard tenantId={tenant.id} period={period} kinds={report.kinds} isTruncated={data.isTruncated} />
    </div>
  )
}
